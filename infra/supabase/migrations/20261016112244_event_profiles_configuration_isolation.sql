-- Configuration belongs to administrators; event profiles belong to individual events.
create or replace function event_ops_private.shared_program(p_event uuid,p_other uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.program_events a join public.program_events b on b.program_id=a.program_id
 join public.event_programs p on p.id=a.program_id join public.events e on e.id=a.event_id join public.events o on o.id=b.event_id
 where a.event_id=p_event and b.event_id=p_other and e.organization_id=o.organization_id and p.organization_id=e.organization_id and o.status<>'archived');
$$;
create or replace function event_ops_private.guest_management(p_event uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((config->>'guest_management')::boolean,event_type='social') from public.events where id=p_event;
$$;

-- Triggers also protect writes through older SECURITY DEFINER configuration RPCs.
-- Operational registrations, scans, payments and printing keep their scoped permissions.
create or replace function event_ops_private.guard_configuration() returns trigger
language plpgsql security definer set search_path='' as $$
declare d jsonb; prev jsonb; org uuid; previous_org uuid; linked_org uuid; v_event uuid; v_program uuid;
begin
 d:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 -- Booking/check-in may update occupancy; drawing and prices remain administrative.
 if tg_table_name in('seats','venue_map_elements') and tg_op='UPDATE'
 and (to_jsonb(new)-array['status','updated_at']) is not distinct from (to_jsonb(old)-array['status','updated_at']) then return new;end if;
 if tg_table_name='organizations' then org:=(d->>'id')::uuid;
 elsif tg_table_name='program_events' then
  select organization_id into org from public.event_programs where id=(d->>'program_id')::uuid;
  select organization_id into linked_org from public.events where id=(d->>'event_id')::uuid;
  if tg_op<>'DELETE' and (org is null or linked_org is distinct from org) then raise exception 'El programa y el evento deben pertenecer a la misma organización' using errcode='42501';end if;
 else
  org:=nullif(d->>'organization_id','')::uuid;
  if org is null and d->>'event_id' is not null then select organization_id into org from public.events where id=(d->>'event_id')::uuid;end if;
  if org is null and d->>'program_id' is not null then select organization_id into org from public.event_programs where id=(d->>'program_id')::uuid;end if;
  if org is null and d->>'item_id' is not null then select p.organization_id into org from public.program_registration_items i join public.event_programs p on p.id=i.program_id where i.id=(d->>'item_id')::uuid;end if;
  if org is null and d->>'pass_id' is not null then select p.organization_id into org from public.passes a join public.event_programs p on p.id=a.program_id where a.id=(d->>'pass_id')::uuid;end if;
  if org is null and d->>'session_id' is not null then select organization_id into org from public.event_sessions where id=(d->>'session_id')::uuid;end if;
  if org is null and d->>'map_id' is not null then select organization_id into org from public.venue_maps where id=(d->>'map_id')::uuid;end if;
 end if;
 -- A previously authorized parent deletion may already have removed the row
 -- used to resolve the tenant. Its FK cascade must still be able to clean up.
 if tg_op='DELETE' and org is null and pg_trigger_depth()>1 then return old;end if;
 if auth.uid() is not null then
  if exists(select 1 from public.platform_user_controls where user_id=auth.uid() and suspended_at is not null)
   or (not public.is_platform_admin() and not coalesce(public.has_org_role(org,array['owner','admin']::public.member_role[]),false)) then
   raise exception 'Solo propietarios y administradores pueden modificar la configuración' using errcode='42501';
  end if;
  -- Check both sides of an UPDATE, including a forged tenant move through an RPC.
  if tg_op='UPDATE' then
   prev:=to_jsonb(old); previous_org:=nullif(prev->>'organization_id','')::uuid;
   if tg_table_name='organizations' then previous_org:=(prev->>'id')::uuid;end if;
   if previous_org is null and prev->>'event_id' is not null then select organization_id into previous_org from public.events where id=(prev->>'event_id')::uuid;end if;
   if previous_org is null and prev->>'program_id' is not null then select organization_id into previous_org from public.event_programs where id=(prev->>'program_id')::uuid;end if;
   if previous_org is null and prev->>'item_id' is not null then select p.organization_id into previous_org from public.program_registration_items i join public.event_programs p on p.id=i.program_id where i.id=(prev->>'item_id')::uuid;end if;
   if previous_org is null and prev->>'pass_id' is not null then select p.organization_id into previous_org from public.passes a join public.event_programs p on p.id=a.program_id where a.id=(prev->>'pass_id')::uuid;end if;
   if previous_org is null and prev->>'session_id' is not null then select organization_id into previous_org from public.event_sessions where id=(prev->>'session_id')::uuid;end if;
   if previous_org is null and prev->>'map_id' is not null then select organization_id into previous_org from public.venue_maps where id=(prev->>'map_id')::uuid;end if;
   if not public.is_platform_admin() and not coalesce(public.has_org_role(previous_org,array['owner','admin']::public.member_role[]),false) then raise exception 'Configuración de otra organización' using errcode='42501';end if;
  end if;
 elsif current_setting('role',true) in('anon','authenticated') then
  raise exception 'Se requiere un administrador autenticado' using errcode='42501';
 end if;
 if tg_table_name='program_events' and auth.uid() is not null then
  perform event_ops_private.audit((d->>'event_id')::uuid,'program_'||lower(tg_op),(d->>'program_id')::uuid,jsonb_build_object('program_id',d->>'program_id'));
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
do $$declare t text;begin
 foreach t in array array['organizations','events','event_programs','program_events','program_agendas','program_registration_items','program_registration_entitlements',
 'passes','pass_entitlements','payment_methods','event_sessions','event_session_ticket_categories','event_ticket_categories','event_zones','event_stages','event_speakers','session_speakers',
 'venue_maps','venue_map_elements','venue_map_versions','seats','seat_reservation_categories','access_points','event_staff_scopes','session_staff_assignments','event_lead_forms','event_campaigns','public_sites',
 'sponsorship_packages','event_sponsorships'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists guard_admin_configuration on public.%I',t);
   execute format('create trigger guard_admin_configuration before %s on public.%I for each row execute function event_ops_private.guard_configuration()',case when t='organizations' then 'update or delete' else 'insert or update or delete' end,t);
  end if;
 end loop;
end $$;

create or replace function event_ops_private.validate_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare subtype text;begin
 subtype:=new.config->>'event_subtype';
 if subtype is not null and not coalesce(case new.event_type
  when 'social' then subtype in('social','wedding','celebration','graduation','gala')
  when 'forum' then subtype in('forum','conference','product_launch','networking')
  when 'exhibition' then subtype='exhibition' when 'workshop' then subtype='workshop' else false end,false) then
  raise exception 'El subtipo no corresponde al formato del evento';end if;
 if new.config ? 'event_purpose' and coalesce(new.config->>'event_purpose','') not in('commercial','private','fundraising','institutional') then raise exception 'Finalidad del evento no válida';end if;
 if new.config ? 'guest_management' and jsonb_typeof(new.config->'guest_management') is distinct from 'boolean' then raise exception 'Selecciona si el evento utiliza grupos y mesas';end if;
 if tg_op='UPDATE' then
  if new.event_type is distinct from old.event_type and (exists(select 1 from public.event_private_invitations where event_id=old.id) or exists(select 1 from public.registrations where event_id=old.id)) then raise exception 'No se puede cambiar el formato de un evento con invitaciones o registros';end if;
  if not coalesce((new.config->>'guest_management')::boolean,new.event_type='social') and exists(select 1 from public.event_social_households where event_id=new.id) then raise exception 'El evento tiene grupos; conserva el módulo para gestionar sus datos';end if;
 end if;
 return new;
end $$;
drop trigger if exists validate_event_profile on public.events;
create trigger validate_event_profile before insert or update on public.events for each row execute function event_ops_private.validate_profile();

-- Keep existing audited workflows; tighten their event boundaries in place.
do $$declare def text; f record;begin
 def:=pg_get_functiondef('public.get_event_operations(uuid)'::regprocedure);
 if position('event_profile_isolation_v1' in def)=0 then
  def:=replace(def,'''event_type'',e.event_type,','''event_type'',e.event_type,''config'',jsonb_build_object(''event_subtype'',e.config->''event_subtype'',''event_purpose'',e.config->''event_purpose'',''guest_management'',event_ops_private.guest_management(e.id)),');
  def:=replace(def,'''id'',c.id,''name'',c.name','''id'',c.id,''name'',c.name,''event_type'',c.event_type');
  def:=replace(def,'c.id<>p_event and c.status<>''archived''','c.id<>p_event and c.status<>''archived'' and event_ops_private.shared_program(p_event,c.id)');
  def:=replace(def,'s.organization_id=parent.organization_id and s.status=''scheduled''','s.organization_id=parent.organization_id and s.status=''scheduled'' and (s.event_id=p_event or event_ops_private.shared_program(p_event,s.event_id))');
  if position('shared_program(p_event,c.id)' in def)=0 or position('shared_program(p_event,s.event_id)' in def)=0 then raise exception 'Operations workspace isolation patch mismatch';end if;
  def:=replace(def,'begin','begin /* event_profile_isolation_v1 */');execute def;
 end if;
 def:=pg_get_functiondef('public.event_operations_command(uuid,text,jsonb)'::regprocedure);
 if position('event_profile_isolation_v1' in def)=0 then
  def:=replace(def,'if e.event_type<>''social'' then raise exception ''Este recorrido requiere un evento social''; end if;','if not event_ops_private.guest_management(p_event) then raise exception ''Habilita grupos y mesas en la configuración de este evento''; end if;');
  def:=replace(def,'organization_id=e.organization_id and status<>''archived''','organization_id=e.organization_id and status<>''archived'' and (events.id=p_event or event_ops_private.shared_program(p_event,events.id))');
  def:=replace(def,'''Un componente no pertenece a esta organización''','''Los accesos combinados requieren eventos vinculados por un administrador al mismo programa''');
  def:=replace(def,'array[''social'']) returning * into a;','array[case e.event_type when ''exhibition'' then ''exhibition'' when ''social'' then ''social'' else ''forum'' end]) returning * into a;');
  def:=replace(def,'begin','begin /* event_profile_isolation_v1 */');
  if position('shared_program(p_event,events.id)' in def)=0 then raise exception 'Allocation isolation patch mismatch';end if;
  -- Gate every group/table mutation, including table creation without any household.
  def:=replace(def,'e:=event_ops_private.lock_event(p_event);','e:=event_ops_private.lock_event(p_event); if p_action in(''household'',''household_link'',''member'',''import_members'',''planner_rsvp'',''resume_member'',''table'',''assign_table'') and not event_ops_private.guest_management(p_event) then raise exception ''Habilita grupos y mesas en la configuración de este evento'';end if;');
  execute def;
 end if;
 def:=pg_get_functiondef('event_ops_private.allocation_capacity(uuid,integer,uuid)'::regprocedure);
 if position('shared_program' in def)=0 then
  def:=replace(def,'select capacity_policy into policy','if exists(select 1 from unnest(a.access_event_ids) x where x<>a.event_id and not event_ops_private.shared_program(a.event_id,x)) then raise exception ''Un evento autorizado ya no pertenece al programa; revisa la asignación'';end if; select capacity_policy into policy');execute def;
 end if;
 def:=pg_get_functiondef('public.validate_invitation_checkin(text,uuid,uuid)'::regprocedure);
 if position('shared_program' in def)=0 then
  def:=replace(def,'not p.event_id=any(a.access_event_ids)','(not p.event_id=any(a.access_event_ids) or not event_ops_private.shared_program(i.event_id,p.event_id))');
  def:=replace(def,'when ''forum'' then ''forum'' when ''social''','when ''forum'' then ''forum'' when ''workshop'' then ''forum'' when ''social''');execute def;
 end if;
 def:=pg_get_functiondef('public.get_invitation_credential_details(text)'::regprocedure);
 if position('shared_program' in def)=0 then
  def:=replace(def,'e.id=i.event_id or e.id=any(a.access_event_ids)','e.id=i.event_id or (e.id=any(a.access_event_ids) and event_ops_private.shared_program(i.event_id,e.id))');
  def:=replace(def,'s.id=any(a.session_ids)','s.id=any(a.session_ids) and (s.event_id=i.event_id or event_ops_private.shared_program(i.event_id,s.event_id))');execute def;
 end if;
 -- Date-only legacy entitlements must never authorize an unrelated event.
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='event_ops_private' and p.proname in('original_validate_program_checkin','original_validate_session_checkin'))
 or (n.nspname='public' and p.proname='manual_program_checkin') loop
  def:=pg_get_functiondef(f.oid);
  if position('program_boundary_v1' in def)=0 and position('if not allowed then' in def)>0 then
   def:=replace(def,'if not allowed then','/* program_boundary_v1 */ allowed:=allowed and exists(select 1 from public.program_events pe where pe.program_id=part.program_id and pe.event_id=point.event_id); if not allowed then');execute def;
  end if;
 end loop;
end $$;
revoke all on function event_ops_private.shared_program(uuid,uuid),event_ops_private.guest_management(uuid),event_ops_private.guard_configuration(),event_ops_private.validate_profile() from public,anon,authenticated;

-- The legacy CRM upsert keyed people by organization+email and overwrote profiles
-- in unrelated programs. Preserve existing references and scope future upserts.
do $$declare f record; def text; person record; association record; copy public.people; clone_id uuid; c record;begin
 if to_regclass('public.people') is null then return;end if;
 alter table public.people add column if not exists registration_program_id uuid references public.event_programs(id);
 -- Drop only the old exact organization/email unique constraint, not other keys.
 for c in select conname from pg_constraint where conrelid='public.people'::regclass and contype='u'
 and (select array_agg(a.attname::text order by a.attname) from unnest(conkey) k join pg_attribute a on a.attrelid=conrelid and a.attnum=k)=array['email','organization_id'] loop
  execute format('alter table public.people drop constraint %I',c.conname);
 end loop;
 create unique index if not exists people_program_email on public.people(organization_id,registration_program_id,email);
 create unique index if not exists people_unscoped_email on public.people(organization_id,email) where registration_program_id is null;
 -- Multi-program legacy identities become independent copies. No new invitations,
 -- consents, orders or event links are generated. Original CRM rows are retained.
 for person in select pe.id from public.people pe where pe.registration_program_id is null
 and exists(select 1 from public.event_participations ep where ep.person_id=pe.id and ep.program_id is not null) loop
  for association in select distinct ep.program_id from public.event_participations ep where ep.person_id=person.id and ep.program_id is not null loop
   clone_id:=gen_random_uuid();
   select (jsonb_populate_record(null::public.people,to_jsonb(pe)||jsonb_build_object('id',clone_id,'registration_program_id',association.program_id))).* into copy from public.people pe where pe.id=person.id;
   insert into public.people select copy.*;
   update public.event_participations set person_id=clone_id where person_id=person.id and program_id=association.program_id;
   update public.program_registration_orders set person_id=clone_id where person_id=person.id and program_id=association.program_id;
  end loop;
 end loop;
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname in('register_program_participant','register_program_selection') loop
  def:=pg_get_functiondef(f.oid);
  if position('registration_program_id' in def)=0 then
   def:=replace(def,'public.people(organization_id,','public.people(organization_id,registration_program_id,');
   def:=replace(def,'values(v_org,trim(p_first_name)','values(v_org,p_program_id,trim(p_first_name)');
   def:=replace(def,'values(org,trim(p_first_name)','values(org,p_program_id,trim(p_first_name)');
   def:=replace(def,'on conflict(organization_id,email)','on conflict(organization_id,registration_program_id,email)');
   if position('values(org,p_program_id,trim(p_first_name)' in def)=0 and position('values(v_org,p_program_id,trim(p_first_name)' in def)=0 then raise exception 'Program identity isolation patch mismatch';end if;
   execute def;
  end if;
 end loop;
end $$;
-- Keep a program-scoped identity from being attached to an unrelated program,
-- including direct Data API writes that bypass the public registration forms.
create or replace function event_ops_private.guard_person_scope() returns trigger
language plpgsql security definer set search_path='' as $$
declare scope uuid; org uuid;begin
 if tg_table_name='people' then
  if tg_op='UPDATE' and new.registration_program_id is distinct from old.registration_program_id then raise exception 'El ámbito del perfil no puede trasladarse a otro programa';end if;
  if new.registration_program_id is not null and not exists(select 1 from public.event_programs p where p.id=new.registration_program_id and p.organization_id=new.organization_id) then raise exception 'El perfil y el programa pertenecen a organizaciones diferentes';end if;
 elsif new.person_id is not null and new.program_id is not null then
  select registration_program_id,organization_id into scope,org from public.people where id=new.person_id;
  if scope is distinct from new.program_id or not exists(select 1 from public.event_programs p where p.id=new.program_id and p.organization_id=org) then raise exception 'El perfil pertenece a otro programa';end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_person_scope on public.people;
create trigger guard_person_scope before insert or update on public.people for each row execute function event_ops_private.guard_person_scope();
drop trigger if exists guard_person_scope on public.event_participations;
create trigger guard_person_scope before insert or update of person_id,program_id on public.event_participations for each row execute function event_ops_private.guard_person_scope();
drop trigger if exists guard_person_scope on public.program_registration_orders;
create trigger guard_person_scope before insert or update of person_id,program_id on public.program_registration_orders for each row execute function event_ops_private.guard_person_scope();
revoke all on function event_ops_private.guard_person_scope() from public,anon,authenticated;
notify pgrst,'reload schema';
