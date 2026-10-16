-- Private invitations and organizer operations. All mutations go through checked RPCs.
create schema if not exists event_ops_private;
revoke all on schema event_ops_private from public,anon,authenticated;
alter table public.registrations alter column email drop not null;

create table if not exists public.event_invitation_settings(
 event_id uuid primary key references public.events(id),organization_id uuid not null references public.organizations(id),
 capacity_policy text not null check(capacity_policy in('issue','redeem')),inviter_identity boolean not null default false,
 rsvp_deadline timestamptz,approved_at timestamptz not null default now(),approved_by uuid references auth.users(id) on delete set null
);
create table if not exists public.event_invitation_allocations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 name text not null check(length(name) between 2 and 180),kind text not null check(kind in('exhibitor','sponsor','speaker','organizer','household')),
 distributor_id uuid references auth.users(id) on delete set null,quantity integer not null check(quantity between 1 and 10000),
 origin text not null default '',rights text[] not null check(cardinality(rights)>0 and rights <@ array['exhibition','forum','vip','social']),
 expires_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.event_private_invitations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 allocation_id uuid not null references public.event_invitation_allocations(id),secret_hash text not null unique,
 state text not null default 'available' check(state in('available','redeemed','revoked')),distributed_at timestamptz,
 registration_id uuid unique references public.registrations(id),request_hash text,expires_at timestamptz,
 replaced_id uuid references public.event_private_invitations(id),created_at timestamptz not null default now(),redeemed_at timestamptz,
 check((state='redeemed')=(registration_id is not null))
);
create table if not exists public.event_social_households(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 allocation_id uuid not null unique references public.event_invitation_allocations(id),name text not null,contact_name text not null,
 contact_email text,secret_hash text not null unique,expires_at timestamptz not null default now()+interval '90 days'
);
create table if not exists public.event_social_tables(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 name text not null,capacity int not null check(capacity between 1 and 1000),unique(event_id,name)
);
create table if not exists public.event_social_members(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 household_id uuid not null references public.event_social_households(id),invitation_id uuid not null unique references public.event_private_invitations(id),
 first_name text not null,last_name text,email text,rsvp text not null default 'pending' check(rsvp in('pending','accepted','declined')),
 table_id uuid references public.event_social_tables(id),responded_at timestamptz,updated_by uuid references auth.users(id) on delete set null
);
create table if not exists public.event_production_tasks(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 title text not null,provider text not null default '',responsible text not null default '',due_at timestamptz,
 dependency_id uuid references public.event_production_tasks(id),status text not null default 'open' check(status in('open','doing','done')),revision int not null default 1
);
create table if not exists public.event_organizer_budget(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 title text not null,provider text not null default '',kind text not null check(kind in('income','expense')),
 stage text not null check(stage in('planned','committed','accrued','paid')),amount numeric(14,2) not null check(amount>0),
 currency text not null check(currency in('USD','VES')),ves_per_usd numeric(16,6) not null check(ves_per_usd>0),
 rate_source text not null check(length(rate_source)>0),rate_date date not null,revision int not null default 1,
 request_key uuid not null unique,voided_at timestamptz,void_reason text,
 check(currency<>'USD' or ves_per_usd=1)
);
create table if not exists public.event_product_reviews(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 segment text not null check(segment in('b2b','social')),title text not null,category text not null check(category in('defect','rule','preference','purchase')),
 status text not null default 'pending' check(status in('pending','observed','resolved')),notes text not null default '',revision int not null default 1
);
create table if not exists public.event_operations_audit(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 actor_id uuid references auth.users(id) on delete set null,action text not null,target_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create table if not exists public.event_invitation_benefits(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 name text not null,kind text not null check(kind in('exhibitor','sponsor','speaker','organizer')),
 quantity int not null check(quantity between 1 and 10000),rights text[] not null check(cardinality(rights)>0 and rights <@ array['exhibition','forum','vip','social']),
 revision int not null default 1,unique(event_id,name)
);
alter table public.event_invitation_allocations add column if not exists benefit_id uuid references public.event_invitation_benefits(id);
alter table public.event_invitation_allocations add column if not exists benefit_revision int;
alter table public.event_invitation_allocations add column if not exists access_event_ids uuid[] not null default '{}';
alter table public.event_invitation_allocations add column if not exists access_dates date[] not null default '{}';
alter table public.event_invitation_allocations add column if not exists session_ids uuid[] not null default '{}';
alter table public.event_production_tasks add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;
alter table public.checkin_records add column if not exists invitation_session_id uuid references public.event_sessions(id) on delete set null;
alter table public.event_organizer_budget add column if not exists request_payload jsonb not null default '{}';
alter table public.event_invitation_settings add column if not exists revision int not null default 1;
alter table public.event_organizer_budget drop constraint if exists organizer_budget_finite;
alter table public.event_organizer_budget add constraint organizer_budget_finite check(amount<1000000000000 and ves_per_usd<10000000000);
create index if not exists invitation_event_state on public.event_private_invitations(event_id,state);
create index if not exists invitation_allocation on public.event_private_invitations(allocation_id);
create index if not exists social_household_members on public.event_social_members(household_id);
create index if not exists social_table_members on public.event_social_members(table_id);
create index if not exists allocation_distributor on public.event_invitation_allocations(distributor_id,event_id);
create index if not exists operations_audit_event on public.event_operations_audit(event_id,created_at);

create or replace function event_ops_private.manager(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists(select 1 from public.platform_user_controls where user_id=auth.uid() and suspended_at is not null) and exists(select 1 from public.events e where e.id=p_event and (public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin()));
$$;
create or replace function event_ops_private.audit(p_event uuid,p_action text,p_target uuid,p_details jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.event_operations_audit(organization_id,event_id,actor_id,action,target_id,details) select organization_id,id,auth.uid(),p_action,p_target,p_details from public.events where id=p_event;
$$;
-- New tables explicitly inherit contractual write guards. Direct writes remain revoked.
do $$declare t text;begin
 foreach t in array array['event_invitation_settings','event_invitation_allocations','event_private_invitations','event_social_households','event_social_tables','event_social_members','event_production_tasks','event_organizer_budget','event_product_reviews','event_operations_audit','event_invitation_benefits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('drop policy if exists ops_manager_read on public.%I',t);
 execute format('create policy ops_manager_read on public.%I for select to authenticated using(event_ops_private.manager(event_id))',t);
 execute format('drop trigger if exists commercial_write_guard on public.%I',t);
 execute format('create trigger commercial_write_guard before insert or update or delete on public.%I for each row execute function commercial_private.check_write(''core'')',t);
 end loop;
end $$;
-- RLS helper only: no direct table access is granted through this schema.
grant usage on schema event_ops_private to authenticated;
grant execute on function event_ops_private.manager(uuid) to authenticated;

create or replace function event_ops_private.lock_event(p_event uuid) returns public.events language plpgsql security definer set search_path='' as $$
declare e public.events;begin
 select * into e from public.events where id=p_event for update;
 if e.id is null then raise exception 'Evento no disponible'; end if;
 -- Older checkout RPCs lock the event before contractual quota enforcement.
 if not pg_try_advisory_xact_lock(hashtextextended(e.organization_id::text,8)) then raise exception 'Otra operación está en curso; vuelve a intentarlo' using errcode='40001';end if;
 return e;
end $$;

create or replace function event_ops_private.allocation_capacity(p_allocation uuid,p_extra int,p_redeeming uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare a public.event_invitation_allocations; e public.events;n int;policy text;ses public.event_sessions;begin
 select * into a from public.event_invitation_allocations where id=p_allocation;
 select capacity_policy into policy from public.event_invitation_settings where event_id=a.event_id;
 for e in select * from public.events where id=a.event_id or id=any(a.access_event_ids) order by id for update nowait loop
  if p_redeeming is not null and (e.status<>'published' or e.end_date<=now()) then raise exception 'Componente no disponible: %',e.name;end if;
  select count(*) into n from public.registrations where event_id=e.id and status<>'rejected' and badge_cancelled_at is null;
  select n+count(*) into n from public.event_private_invitations inv join public.event_invitation_allocations al on al.id=inv.allocation_id join public.registrations r on r.id=inv.registration_id
   where inv.event_id<>e.id and e.id=any(al.access_event_ids) and inv.state='redeemed' and r.status='confirmed' and r.badge_cancelled_at is null;
  select n+count(*) into n from public.event_private_invitations inv join public.event_invitation_allocations al on al.id=inv.allocation_id join public.event_invitation_settings s on s.event_id=inv.event_id
   where (inv.event_id=e.id or e.id=any(al.access_event_ids)) and inv.state='available' and (inv.expires_at is null or inv.expires_at>now()) and s.capacity_policy='issue' and inv.id is distinct from p_redeeming;
  if e.total_slots>0 and n+p_extra>e.total_slots then raise exception 'Aforo agotado en %',e.name;end if;
 end loop;
 for ses in select * from public.event_sessions where id=any(a.session_ids) order by id for update nowait loop
  if ses.status<>'scheduled' then raise exception 'Sesión no disponible: %',ses.name;end if;
  perform event_ops_private.session_capacity(ses.id,p_extra,p_redeeming,null);
 end loop;
end $$;

create or replace function event_ops_private.session_capacity(p_session uuid,p_extra int,p_skip_invitation uuid default null,p_skip_reservation uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare max_slots int;n int;begin
 select capacity into max_slots from public.event_sessions where id=p_session for update nowait;
 if max_slots is null then return;end if;
 n:=event_ops_private.base_session_reserved_count(p_session);
 if exists(select 1 from public.session_reservations sr left join public.registrations r on r.id=sr.registration_id where sr.id=p_skip_reservation and sr.session_id=p_session and (sr.status in('confirmed','checked_in') or (sr.status='pending_payment' and (r.payment_deadline is null or r.payment_deadline>now())))) then n:=greatest(n-1,0);end if;
 select n+count(*) into n from public.event_private_invitations inv join public.event_invitation_allocations a on a.id=inv.allocation_id join public.event_invitation_settings s on s.event_id=inv.event_id
  where p_session=any(a.session_ids) and inv.state='available' and inv.id is distinct from p_skip_invitation and (inv.expires_at is null or inv.expires_at>now()) and s.capacity_policy='issue';
 if n+p_extra>max_slots then raise exception 'La sesión alcanzó su capacidad';end if;
end $$;

do $$begin
 if to_regprocedure('event_ops_private.base_session_reserved_count(uuid)') is null then
  alter function public.event_session_reserved_count(uuid) set schema event_ops_private;
  alter function event_ops_private.event_session_reserved_count(uuid) rename to base_session_reserved_count;
 end if;
end $$;
create or replace function public.event_session_reserved_count(p_session_id uuid) returns integer language sql stable security definer set search_path='' as $$
 select event_ops_private.base_session_reserved_count(p_session_id)+(select count(*)::int from public.event_private_invitations inv join public.event_invitation_allocations a on a.id=inv.allocation_id join public.event_invitation_settings s on s.event_id=inv.event_id where p_session_id=any(a.session_ids) and inv.state='available' and (inv.expires_at is null or inv.expires_at>now()) and s.capacity_policy='issue');
$$;
revoke all on function public.event_session_reserved_count(uuid) from public;
grant execute on function public.event_session_reserved_count(uuid) to anon,authenticated,service_role;
create or replace function event_ops_private.available_capacity(p_event uuid,p_extra int) returns void language plpgsql security definer set search_path='' as $$
declare e public.events; policy text;n int;begin
 select * into e from public.events where id=p_event;
 select capacity_policy into policy from public.event_invitation_settings where event_id=p_event;
 select count(*) into n from public.registrations where event_id=p_event and status<>'rejected' and badge_cancelled_at is null;
 if policy='issue' then n:=n+(select count(*) from public.event_private_invitations where event_id=p_event and state='available' and (expires_at is null or expires_at>now())); end if;
 if e.total_slots>0 and n+p_extra>e.total_slots then raise exception 'El evento alcanzó su capacidad'; end if;
end $$;

-- Return secrets only on issue/replacement; only their SHA256 is persisted.
create or replace function public.event_operations_command(p_event uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;a public.event_invitation_allocations;i public.event_private_invitations;h public.event_social_households;m public.event_social_members;
 v_id uuid; secret text; result jsonb:='{}';codes jsonb:='[]';n int;qty int;rights text[];target uuid;manager boolean;row_id uuid;v_revision int;benefit public.event_invitation_benefits;access_ids uuid[];sessions uuid[];
begin
 e:=event_ops_private.lock_event(p_event);manager:=event_ops_private.manager(p_event);
 if p_action in('task','budget','review') and length(btrim(coalesce(p_data->>'title',''))) not between 2 and 200 then raise exception 'Indica un título entre 2 y 200 caracteres';end if;
 if auth.uid() is null or exists(select 1 from public.platform_user_controls where user_id=auth.uid() and suspended_at is not null) then raise exception 'No autorizado' using errcode='42501';end if;
 if not manager then
  if p_action='task_status' then
   if not exists(select 1 from public.event_production_tasks where event_id=p_event and event_production_tasks.id=(p_data->>'id')::uuid and assigned_user_id=auth.uid()) then raise exception 'No autorizado' using errcode='42501';end if;
  else
   if p_action not in('issue','distributed') then raise exception 'No autorizado' using errcode='42501'; end if;
   select * into a from public.event_invitation_allocations where id=(p_data->>'allocation_id')::uuid and event_id=p_event and distributor_id=auth.uid();
   if auth.uid() is null or a.id is null then raise exception 'No autorizado' using errcode='42501'; end if;
  end if;
 end if;
 if p_action='reset_demo' then
  if coalesce((e.config->>'ops_demo')::boolean,false)=false or p_data->>'confirmation' is distinct from e.name then raise exception 'Escribe el nombre exacto del evento de demostración';end if;
  if exists(select 1 from public.registrations where event_id=p_event) or exists(select 1 from public.event_private_invitations where event_id=p_event and state='redeemed') then raise exception 'La demo ya tiene registros: conserva su historial y crea otro evento DEMO para un ensayo limpio';end if;
  delete from public.event_social_members where event_id=p_event;
  delete from public.event_social_households where event_id=p_event;
  delete from public.event_private_invitations where event_id=p_event;
  delete from public.event_invitation_allocations where event_id=p_event;
  delete from public.event_invitation_benefits where event_id=p_event;
  delete from public.event_social_tables where event_id=p_event;
  update public.event_production_tasks set dependency_id=null where event_id=p_event;
  delete from public.event_production_tasks where event_id=p_event;
  delete from public.event_organizer_budget where event_id=p_event;
  delete from public.event_product_reviews where event_id=p_event;
 elsif p_action='seed_demo' then
  if e.name not ilike 'DEMO%' or exists(select 1 from public.registrations where event_id=p_event) or exists(select 1 from public.event_invitation_allocations where event_id=p_event) then raise exception 'Usa un evento vacío cuyo nombre empiece por DEMO';end if;
  if not exists(select 1 from public.event_invitation_settings where event_id=p_event) then raise exception 'Aprueba las reglas antes de cargar la demostración';end if;
  update public.events set config=config||'{"ops_demo":true,"private_listing":true}'::jsonb where events.id=p_event;
  if e.event_type='social' then
   result:=public.event_operations_command(p_event,'household','{"name":"Hogar de demostración","contact_name":"Representante de prueba","quantity":3}');
   codes:=codes||jsonb_build_array(jsonb_build_object('id',result->>'id','code',result->>'code','mode','hogar'));
   perform public.event_operations_command(p_event,'import_members',jsonb_build_object('household_id',result->>'id','rows','[{"first_name":"Ana","last_name":"Demo"},{"first_name":"Luis","last_name":"Demo"},{"first_name":"Acompañante"}]'::jsonb));
   perform public.event_operations_command(p_event,'table','{"name":"Mesa demostración","capacity":2}');
  else
   result:=public.event_operations_command(p_event,'benefit','{"name":"Stand demostración 9m2","kind":"exhibitor","quantity":3,"rights":["exhibition"]}');
   result:=public.event_operations_command(p_event,'allocation',jsonb_build_object('name','Expositor de demostración','kind','exhibitor','benefit_id',result->>'id','origin','Stand demostración 9m2'));
   result:=public.event_operations_command(p_event,'issue',jsonb_build_object('allocation_id',result->>'id','quantity',2));codes:=codes||(result->'codes');
   result:=public.event_operations_command(p_event,'allocation','{"name":"Patrocinante de demostración","kind":"sponsor","quantity":2,"rights":["exhibition","vip"],"origin":"Paquete demostración aprobado"}');
   result:=public.event_operations_command(p_event,'issue',jsonb_build_object('allocation_id',result->>'id','quantity',1));codes:=codes||(result->'codes');
  end if;
  result:=public.event_operations_command(p_event,'task','{"title":"Montaje de demostración","responsible":"Equipo demo","provider":"Proveedor demo","status":"open"}');
  perform public.event_operations_command(p_event,'task',jsonb_build_object('title','Apertura de demostración','responsible','Coordinación demo','dependency_id',result->>'id','status','open'));
  perform public.event_operations_command(p_event,'budget',jsonb_build_object('title','Presupuesto catering demo v1','kind','expense','stage','planned','amount',200,'currency','USD','ves_per_usd',1,'rate_source','USD nominal de demostración','rate_date',current_date,'request_key',gen_random_uuid()));
  perform public.event_operations_command(p_event,'review','{"segment":"b2b","title":"Revisar canje y acceso","category":"rule","status":"pending"}');
  perform public.event_operations_command(p_event,'review','{"segment":"social","title":"Revisar hogares y mesas","category":"rule","status":"pending"}');
  result:=jsonb_build_object('codes',codes);
 elsif p_action='settings_update' then
  if not coalesce(p_data->>'private_listing' in('true','false') and p_data->>'inviter_identity' in('true','false'),false) then raise exception 'Selecciona privacidad y visibilidad de nombres';end if;
  update public.event_invitation_settings set inviter_identity=(p_data->>'inviter_identity')::boolean,rsvp_deadline=nullif(p_data->>'rsvp_deadline','')::timestamptz,approved_by=auth.uid(),approved_at=now(),revision=revision+1 where event_id=p_event and revision=(p_data->>'revision')::int;
  if not found then raise exception 'Las reglas cambiaron; recarga antes de guardar' using errcode='40001';end if;
  update public.events set config=config||jsonb_build_object('private_listing',(p_data->>'private_listing')::boolean) where events.id=p_event;
 elsif p_action='settings' then
  if p_data->>'capacity_policy' not in('issue','redeem') then raise exception 'Selecciona cuándo reservar aforo'; end if;
  if exists(select 1 from public.event_private_invitations where event_id=p_event) then raise exception 'La política queda fijada al emitir invitaciones'; end if;
  if coalesce(e.config->>'registration_mode','')<>'invitation' then raise exception 'Configura primero el evento como registro por invitación'; end if;
  insert into public.event_invitation_settings(event_id,organization_id,capacity_policy,inviter_identity,rsvp_deadline,approved_by)
  values(e.id,e.organization_id,p_data->>'capacity_policy',coalesce((p_data->>'inviter_identity')::boolean,false),nullif(p_data->>'rsvp_deadline','')::timestamptz,auth.uid())
  on conflict(event_id) do update set capacity_policy=excluded.capacity_policy,inviter_identity=excluded.inviter_identity,rsvp_deadline=excluded.rsvp_deadline,approved_by=auth.uid(),approved_at=now();
  update public.events set config=config||jsonb_build_object('private_listing',coalesce((p_data->>'private_listing')::boolean,e.event_type='social')) where events.id=p_event;
 elsif p_action='benefit' then
  select array_agg(value) into rights from jsonb_array_elements_text(p_data->'rights');
  insert into public.event_invitation_benefits(organization_id,event_id,name,kind,quantity,rights) values(e.organization_id,p_event,btrim(p_data->>'name'),p_data->>'kind',(p_data->>'quantity')::int,rights)
  on conflict(event_id,name) do update set kind=excluded.kind,quantity=excluded.quantity,rights=excluded.rights,revision=event_invitation_benefits.revision+1 returning * into benefit;
  result:=to_jsonb(benefit);
 elsif p_action='allocation' then
  if not exists(select 1 from public.event_invitation_settings where event_id=p_event) then raise exception 'Aprueba primero las reglas de invitación'; end if;
  select array_agg(value) into rights from jsonb_array_elements_text(p_data->'rights');
  qty:=(p_data->>'quantity')::int;
  if nullif(p_data->>'benefit_id','') is not null then
   select * into benefit from public.event_invitation_benefits where event_id=p_event and event_invitation_benefits.id=(p_data->>'benefit_id')::uuid;
   if benefit.id is null then raise exception 'Beneficio no disponible';end if;qty:=benefit.quantity;rights:=benefit.rights;
  end if;
  select array_agg(value::uuid) into access_ids from jsonb_array_elements_text(coalesce(p_data->'access_event_ids','[]'));
  if exists(select 1 from unnest(access_ids) x where not exists(select 1 from public.events where events.id=x and organization_id=e.organization_id and status<>'archived')) then raise exception 'Un componente no pertenece a esta organización';end if;
  select array_agg(value::uuid) into sessions from jsonb_array_elements_text(coalesce(p_data->'session_ids','[]'));
  if exists(select 1 from unnest(sessions) x where not exists(select 1 from public.event_sessions s where s.id=x and s.organization_id=e.organization_id and (s.event_id=p_event or s.event_id=any(access_ids)) and s.status='scheduled')) then raise exception 'Selecciona el componente correspondiente a cada sesión autorizada';end if;
  target:=nullif(p_data->>'distributor_id','')::uuid;
  if nullif(btrim(p_data->>'distributor_email'),'') is not null then
   select u.id into target from auth.users u where lower(u.email)=lower(btrim(p_data->>'distributor_email'));
   if target is null then raise exception 'El distribuidor debe crear primero su cuenta con ese correo';end if;
  end if;
  insert into public.event_invitation_allocations(organization_id,event_id,name,kind,distributor_id,quantity,origin,rights,expires_at,benefit_id,benefit_revision,access_event_ids,access_dates,session_ids)
  values(e.organization_id,p_event,btrim(p_data->>'name'),coalesce(benefit.kind,p_data->>'kind'),target,qty,coalesce(p_data->>'origin',''),rights,nullif(p_data->>'expires_at','')::timestamptz,benefit.id,benefit.revision,coalesce(access_ids,'{}'),case when nullif(btrim(p_data->>'access_dates'),'') is null then '{}'::date[] else string_to_array(replace(p_data->>'access_dates',' ',''),',')::date[] end,coalesce(sessions,'{}')) returning * into a;
  result:=to_jsonb(a);
 elsif p_action='issue' then
  select * into a from public.event_invitation_allocations where id=(p_data->>'allocation_id')::uuid and event_id=p_event for update;
  if a.id is null or a.kind='household' then raise exception 'Asignación no disponible'; end if;
  qty:=(p_data->>'quantity')::int;
  if qty is null or qty<1 or qty>500 then raise exception 'Emite entre 1 y 500 códigos por lote'; end if;
  if a.expires_at<=now() then raise exception 'Asignación vencida'; end if;
  select count(*) into n from public.event_private_invitations where allocation_id=a.id and state<>'revoked';
  if n+qty>a.quantity then raise exception 'La emisión supera la asignación'; end if;
  if (select capacity_policy from public.event_invitation_settings where event_id=p_event)='issue' then perform event_ops_private.allocation_capacity(a.id,qty); end if;
  for n in 1..qty loop
   secret:=encode(extensions.gen_random_bytes(32),'hex');
   insert into public.event_private_invitations(organization_id,event_id,allocation_id,secret_hash,expires_at) values(e.organization_id,p_event,a.id,encode(sha256(convert_to(secret,'UTF8')),'hex'),a.expires_at) returning id into v_id;
   codes:=codes||jsonb_build_array(jsonb_build_object('id',v_id,'code',secret));
  end loop;result:=jsonb_build_object('codes',codes);
 elsif p_action in('revoke','transfer','distributed') then
  select * into i from public.event_private_invitations where id=(p_data->>'id')::uuid and event_id=p_event for update;
  if i.id is null or i.state<>'available' then raise exception 'Solo se modifican códigos disponibles'; end if;
  if not manager and i.allocation_id<>a.id then raise exception 'No autorizado' using errcode='42501'; end if;
  if exists(select 1 from public.event_social_members where invitation_id=i.id) then raise exception 'Gestiona esta invitación desde el hogar'; end if;
  if p_action='distributed' then update public.event_private_invitations set distributed_at=coalesce(distributed_at,now()) where event_private_invitations.id=i.id;
  else
   if length(btrim(coalesce(p_data->>'reason','')))<3 then raise exception 'Indica el motivo'; end if;
   update public.event_private_invitations set state='revoked' where event_private_invitations.id=i.id;
   if p_action='transfer' then
    select * into a from public.event_invitation_allocations where event_invitation_allocations.id=(p_data->>'target_allocation_id')::uuid and event_id=p_event for update;
    if a.id is null or a.kind='household' or a.expires_at<=now() then raise exception 'Destino no disponible'; end if;
    if (select count(*) from public.event_private_invitations where allocation_id=a.id and state<>'revoked')>=a.quantity then raise exception 'Destino sin cupos disponibles'; end if;
    if (select capacity_policy from public.event_invitation_settings where event_id=p_event)='issue' then perform event_ops_private.allocation_capacity(a.id,1);end if;
    secret:=encode(extensions.gen_random_bytes(32),'hex');
    insert into public.event_private_invitations(organization_id,event_id,allocation_id,secret_hash,expires_at,replaced_id) values(e.organization_id,p_event,a.id,encode(sha256(convert_to(secret,'UTF8')),'hex'),a.expires_at,i.id) returning event_private_invitations.id into v_id;
    result:=jsonb_build_object('codes',jsonb_build_array(jsonb_build_object('id',v_id,'code',secret)));
   end if;
  end if;
 elsif p_action='household' then
  if e.event_type<>'social' then raise exception 'Este recorrido requiere un evento social'; end if;
  if not exists(select 1 from public.event_invitation_settings where event_id=p_event) then raise exception 'Aprueba primero las reglas'; end if;
  qty:=(p_data->>'quantity')::int;
  insert into public.event_invitation_allocations(organization_id,event_id,name,kind,quantity,rights) values(e.organization_id,p_event,btrim(p_data->>'name'),'household',qty,array['social']) returning * into a;
  secret:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.event_social_households(organization_id,event_id,allocation_id,name,contact_name,contact_email,secret_hash)
  values(e.organization_id,p_event,a.id,a.name,btrim(p_data->>'contact_name'),nullif(lower(btrim(p_data->>'contact_email')),''),encode(sha256(convert_to(secret,'UTF8')),'hex')) returning * into h;
  result:=jsonb_build_object('id',h.id,'code',secret);
 elsif p_action='household_link' then
  secret:=encode(extensions.gen_random_bytes(32),'hex');
  update public.event_social_households set secret_hash=encode(sha256(convert_to(secret,'UTF8')),'hex'),expires_at=now()+interval '90 days' where event_id=p_event and event_social_households.id=(p_data->>'id')::uuid returning event_social_households.id into v_id;
  if v_id is null then raise exception 'Hogar no disponible'; end if;result:=jsonb_build_object('id',v_id,'code',secret);
 elsif p_action='member' then
  select * into h from public.event_social_households where event_social_households.id=(p_data->>'household_id')::uuid and event_id=p_event;
  select * into a from public.event_invitation_allocations where event_invitation_allocations.id=h.allocation_id;
  if h.id is null or (select count(*) from public.event_social_members where household_id=h.id)>=a.quantity then raise exception 'Hogar no disponible o sin plazas'; end if;
  if length(btrim(coalesce(p_data->>'first_name','')))<2 then raise exception 'Indica el nombre del integrante'; end if;
  if (select capacity_policy from public.event_invitation_settings where event_id=p_event)='issue' then perform event_ops_private.allocation_capacity(a.id,1); end if;
  insert into public.event_private_invitations(organization_id,event_id,allocation_id,secret_hash) values(e.organization_id,p_event,a.id,encode(sha256(extensions.gen_random_bytes(32)),'hex')) returning event_private_invitations.id into v_id;
  insert into public.event_social_members(organization_id,event_id,household_id,invitation_id,first_name,last_name,email)
  values(e.organization_id,p_event,h.id,v_id,btrim(p_data->>'first_name'),nullif(btrim(p_data->>'last_name'),''),nullif(lower(btrim(p_data->>'email')),'')) returning event_social_members.id into v_id;
  result:=jsonb_build_object('id',v_id);
 elsif p_action='import_members' then
  if jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows') not between 1 and 200 then raise exception 'Importa entre 1 y 200 integrantes por lote';end if;
  for result in select value from jsonb_array_elements(p_data->'rows') loop
   perform public.event_operations_command(p_event,'member',result||jsonb_build_object('household_id',p_data->>'household_id'));
  end loop;result:=jsonb_build_object('count',jsonb_array_length(p_data->'rows'));
 elsif p_action='planner_rsvp' then
  result:=public.social_household_access(p_event,null,(p_data->>'member_id')::uuid,p_data->>'response',null,null);
 elsif p_action='resume_member' then
  select * into m from public.event_social_members where event_social_members.id=(p_data->>'member_id')::uuid and event_id=p_event for update;
  select * into i from public.event_private_invitations where event_private_invitations.id=m.invitation_id;
  if m.id is null or m.rsvp<>'declined' then raise exception 'Solo se reactiva una participación declinada';end if;
  if i.state='redeemed' then
   perform event_ops_private.allocation_capacity(i.allocation_id,1);
   update public.registrations set status='confirmed',badge_cancelled_at=null,badge_cancelled_reason=null,credential_token=encode(extensions.gen_random_bytes(16),'hex'),updated_at=now() where registrations.id=i.registration_id;
   update public.event_social_members set rsvp='accepted',responded_at=now(),updated_by=auth.uid() where event_social_members.id=m.id;
  else
   if (select capacity_policy from public.event_invitation_settings where event_id=p_event)='issue' then perform event_ops_private.allocation_capacity(i.allocation_id,1);end if;
   -- Replaced individual authorization; the revoked invitation remains in history.
   insert into public.event_private_invitations(organization_id,event_id,allocation_id,secret_hash,replaced_id) values(e.organization_id,p_event,i.allocation_id,encode(sha256(extensions.gen_random_bytes(32)),'hex'),i.id) returning event_private_invitations.id into v_id;
   update public.event_social_members set invitation_id=v_id,rsvp='pending',updated_by=auth.uid() where event_social_members.id=m.id;
  end if;
 elsif p_action='resume_registration' then
  select * into i from public.event_private_invitations where event_private_invitations.id=(p_data->>'id')::uuid and event_id=p_event and state='redeemed';
  if i.id is null or not exists(select 1 from public.registrations where registrations.id=i.registration_id and (status='rejected' or badge_cancelled_at is not null)) then raise exception 'Selecciona una participación cancelada';end if;
  perform event_ops_private.allocation_capacity(i.allocation_id,1);
  update public.registrations set status='confirmed',badge_cancelled_at=null,badge_cancelled_reason=null,credential_token=encode(extensions.gen_random_bytes(16),'hex'),updated_at=now() where registrations.id=i.registration_id;
  update public.event_social_members set rsvp='accepted',responded_at=now(),updated_by=auth.uid() where invitation_id=i.id;
 elsif p_action='cancel_registration' then
  select * into i from public.event_private_invitations where event_private_invitations.id=(p_data->>'id')::uuid and event_id=p_event and state='redeemed';
  if i.id is null or length(btrim(coalesce(p_data->>'reason','')))<3 then raise exception 'Selecciona un registro canjeado e indica el motivo';end if;
  update public.registrations set status='rejected',badge_cancelled_at=now(),badge_cancelled_reason=p_data->>'reason',updated_at=now() where registrations.id=i.registration_id;
  update public.event_social_members set rsvp='declined',table_id=null,responded_at=now(),updated_by=auth.uid() where invitation_id=i.id;
 elsif p_action='table' then
  v_id:=nullif(p_data->>'id','')::uuid;
  if v_id is null then insert into public.event_social_tables(organization_id,event_id,name,capacity) values(e.organization_id,p_event,btrim(p_data->>'name'),(p_data->>'capacity')::int) returning event_social_tables.id into v_id;
  else
   if (select count(*) from public.event_social_members where table_id=v_id)>(p_data->>'capacity')::int then raise exception 'La mesa tiene más personas asignadas'; end if;
   update public.event_social_tables set name=btrim(p_data->>'name'),capacity=(p_data->>'capacity')::int where event_social_tables.id=v_id and event_id=p_event;
   if not found then raise exception 'Mesa no disponible'; end if;
  end if;result:=jsonb_build_object('id',v_id);
 elsif p_action='assign_table' then
  select * into m from public.event_social_members where event_social_members.id=(p_data->>'member_id')::uuid and event_id=p_event for update;
  if m.id is null then raise exception 'Integrante no disponible'; end if;
  target:=nullif(p_data->>'table_id','')::uuid;
  if target is not null then
   if m.rsvp<>'accepted' then raise exception 'Confirma al invitado antes de asignar mesa'; end if;
   select capacity into qty from public.event_social_tables where event_social_tables.id=target and event_id=p_event for update;
   if qty is null or (select count(*) from public.event_social_members where table_id=target and event_social_members.id<>m.id)>=qty then raise exception 'Mesa no disponible o completa'; end if;
  end if;
  update public.event_social_members set table_id=target,updated_by=auth.uid() where event_social_members.id=m.id;
 elsif p_action='task_status' then
  v_id:=(p_data->>'id')::uuid;
  if p_data->>'status'='done' and exists(select 1 from public.event_production_tasks t join public.event_production_tasks d on d.id=t.dependency_id where t.id=v_id and d.status<>'done') then raise exception 'Completa primero la dependencia';end if;
  if p_data->>'status'<>'done' and exists(select 1 from public.event_production_tasks where dependency_id=v_id and status='done') then raise exception 'Reabre primero las tareas dependientes';end if;
  update public.event_production_tasks set status=p_data->>'status',revision=revision+1 where event_production_tasks.id=v_id and event_id=p_event and revision=(p_data->>'revision')::int;
  if not found then raise exception 'La tarea cambió; recarga antes de guardar' using errcode='40001';end if;
 elsif p_action='task' then
  v_id:=nullif(p_data->>'id','')::uuid;target:=nullif(p_data->>'dependency_id','')::uuid;
  if target is not null and (target=v_id or not exists(select 1 from public.event_production_tasks where event_production_tasks.id=target and event_id=p_event)) then raise exception 'Dependencia no válida'; end if;
  if v_id is not null and target is not null and exists(with recursive chain as(select dependency_id from public.event_production_tasks where event_production_tasks.id=target union select t.dependency_id from public.event_production_tasks t join chain c on t.id=c.dependency_id) select 1 from chain where dependency_id=v_id) then raise exception 'Dependencia circular'; end if;
  if p_data->>'status'='done' and target is not null and not exists(select 1 from public.event_production_tasks where event_production_tasks.id=target and status='done') then raise exception 'Completa primero la dependencia'; end if;
  row_id:=nullif(p_data->>'assigned_user_id','')::uuid;
  if nullif(btrim(p_data->>'assigned_email'),'') is not null then select u.id into row_id from auth.users u where lower(u.email)=lower(btrim(p_data->>'assigned_email'));if row_id is null then raise exception 'El responsable debe crear primero su cuenta';end if;end if;
  if v_id is null then
   insert into public.event_production_tasks(organization_id,event_id,title,provider,responsible,due_at,dependency_id,status,assigned_user_id) values(e.organization_id,p_event,btrim(p_data->>'title'),coalesce(p_data->>'provider',''),coalesce(p_data->>'responsible',''),nullif(p_data->>'due_at','')::timestamptz,target,coalesce(p_data->>'status','open'),row_id) returning event_production_tasks.id into v_id;
  else
   if p_data->>'status'<>'done' and exists(select 1 from public.event_production_tasks where dependency_id=v_id and status='done') then raise exception 'Reabre primero las tareas dependientes'; end if;
   update public.event_production_tasks set title=btrim(p_data->>'title'),provider=coalesce(p_data->>'provider',''),responsible=coalesce(p_data->>'responsible',''),due_at=nullif(p_data->>'due_at','')::timestamptz,dependency_id=target,status=p_data->>'status',assigned_user_id=row_id,revision=revision+1 where event_production_tasks.id=v_id and event_id=p_event and revision=(p_data->>'revision')::int;
   if not found then raise exception 'La tarea cambió; recarga antes de guardar' using errcode='40001'; end if;
  end if;result:=jsonb_build_object('id',v_id);
 elsif p_action='budget' then
  if nullif(p_data->>'request_key','') is null then raise exception 'Falta identificador de operación'; end if;
  select event_organizer_budget.id into v_id from public.event_organizer_budget where request_key=(p_data->>'request_key')::uuid and event_id=p_event;
  if v_id is not null and exists(select 1 from public.event_organizer_budget where event_organizer_budget.id=v_id and request_payload is distinct from (p_data-'request_key')) then raise exception 'El identificador ya se utilizó para una partida distinta';end if;
  if v_id is null then
   insert into public.event_organizer_budget(organization_id,event_id,title,provider,kind,stage,amount,currency,ves_per_usd,rate_source,rate_date,request_key,request_payload)
   values(e.organization_id,p_event,btrim(p_data->>'title'),coalesce(p_data->>'provider',''),p_data->>'kind',p_data->>'stage',(p_data->>'amount')::numeric,p_data->>'currency',(p_data->>'ves_per_usd')::numeric,btrim(p_data->>'rate_source'),(p_data->>'rate_date')::date,(p_data->>'request_key')::uuid,p_data-'request_key') returning event_organizer_budget.id into v_id;
  end if;result:=jsonb_build_object('id',v_id);
 elsif p_action='budget_stage' then
  update public.event_organizer_budget set stage=p_data->>'stage',revision=revision+1 where event_organizer_budget.id=(p_data->>'id')::uuid and event_id=p_event and revision=(p_data->>'revision')::int and voided_at is null;
  if not found then raise exception 'La partida cambió; recarga antes de guardar' using errcode='40001'; end if;
 elsif p_action='budget_void' then
  if length(btrim(coalesce(p_data->>'reason','')))<3 then raise exception 'Indica el motivo'; end if;
  update public.event_organizer_budget set voided_at=now(),void_reason=p_data->>'reason',revision=revision+1 where event_organizer_budget.id=(p_data->>'id')::uuid and event_id=p_event and revision=(p_data->>'revision')::int and voided_at is null;
  if not found then raise exception 'La partida cambió' using errcode='40001'; end if;
 elsif p_action='review' then
  v_id:=nullif(p_data->>'id','')::uuid;
  if v_id is null then insert into public.event_product_reviews(organization_id,event_id,segment,title,category,status,notes) values(e.organization_id,p_event,p_data->>'segment',btrim(p_data->>'title'),p_data->>'category',coalesce(p_data->>'status','pending'),coalesce(p_data->>'notes','')) returning event_product_reviews.id into v_id;
  else update public.event_product_reviews set status=p_data->>'status',notes=coalesce(p_data->>'notes',''),revision=revision+1 where event_product_reviews.id=v_id and event_id=p_event and revision=(p_data->>'revision')::int;
   if not found then raise exception 'La observación cambió' using errcode='40001'; end if;
  end if;result:=jsonb_build_object('id',v_id);
 else raise exception 'Operación no disponible';
 end if;
 perform event_ops_private.audit(p_event,p_action,coalesce(v_id,(p_data->>'id')::uuid),p_data-'code'-'secret'-'email'-'contact_email'-'rows'-'distributor_email'-'assigned_email');
 return result;
end $$;

create or replace function public.event_public_visible(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=p_event and (coalesce((e.config->>'private_listing')::boolean,false)=false or public.is_org_member(e.organization_id) or public.is_platform_admin()));
$$;
revoke all on function public.event_public_visible(uuid) from public;
grant execute on function public.event_public_visible(uuid) to anon,authenticated;
-- Restrictive policies intersect, rather than OR with, existing public policies.
do $$declare t record;begin
 drop policy if exists event_private_visibility on public.events;
 create policy event_private_visibility on public.events as restrictive for select to anon,authenticated using(public.event_public_visible(id));
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='event_id' and table_name in(select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE') loop
  execute format('drop policy if exists event_private_visibility on public.%I',t.table_name);
  execute format('create policy event_private_visibility on public.%I as restrictive for select to anon,authenticated using(event_id is null or public.event_public_visible(event_id))',t.table_name);
 end loop;
end $$;
-- Public SECURITY DEFINER catalogs do not inherit RLS. Wrap those explicitly.
do $migration$declare f record;args text;guard text;body text;old_name text;definition text;begin
 for f in select p.*,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['get_published_exhibition_directory','get_public_forum_agenda','get_public_event_lead_form','get_public_event_sponsors','get_public_program_agenda','get_public_ticket_categories','get_public_event_registration_state','get_public_program_registration_catalog','get_public_event_session_catalog']) loop
  old_name:='original_'||f.proname;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='event_ops_private' and p.proname=old_name and p.proargtypes=f.proargtypes) then continue;end if;
  select string_agg(format('%I',f.proargnames[x]),',' order by x) into args from generate_series(1,f.pronargs)x;
  guard:='false';
  if 'p_event_id'=any(f.proargnames) then guard:='(p_event_id is not null and not public.event_public_visible(p_event_id))';end if;
  if 'p_program_id'=any(f.proargnames) then guard:=guard||' or (p_program_id is not null and exists(select 1 from public.program_events pe where pe.program_id=p_program_id and not public.event_public_visible(pe.event_id)))';end if;
  definition:=format('create or replace function public.%I(%s) returns %s language plpgsql stable security definer set search_path='''' as $wrapped$ begin if %s then %s end if; %s end $wrapped$;',f.proname,pg_get_function_arguments(f.oid),pg_get_function_result(f.oid),guard,case when f.proretset then 'return;' else 'return null;' end,case when f.proretset then format('return query select * from event_ops_private.%I(%s);',old_name,args) else format('return event_ops_private.%I(%s);',old_name,args) end);
  execute format('alter function public.%I(%s) set schema event_ops_private',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('alter function event_ops_private.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),old_name);
  execute definition;
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to anon,authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 if to_regprocedure('public.get_platform_event_catalog()') is not null then
  select pg_get_functiondef('public.get_platform_event_catalog()'::regprocedure) into definition;
  definition:=replace(definition,'where e.platform_featured and','where e.platform_featured and coalesce((e.config->>''private_listing'')::boolean,false)=false and');execute definition;
 end if;
end $migration$;

create or replace function public.get_event_operations(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean;out jsonb;begin
 manager:=event_ops_private.manager(p_event);
 if auth.uid() is null or exists(select 1 from public.platform_user_controls where user_id=auth.uid() and suspended_at is not null) or exists(select 1 from public.events e join public.organizations o on o.id=e.organization_id where e.id=p_event and o.status='suspended') then raise exception 'No autorizado' using errcode='42501';end if;
 if not manager and not exists(select 1 from public.event_invitation_allocations where event_id=p_event and distributor_id=auth.uid()) and not exists(select 1 from public.event_production_tasks where event_id=p_event and assigned_user_id=auth.uid()) then raise exception 'No autorizado' using errcode='42501'; end if;
 select jsonb_build_object('event',jsonb_build_object('id',e.id,'name',e.name,'event_type',e.event_type,'total_slots',e.total_slots,'registration_mode',e.config->>'registration_mode','demo',coalesce((e.config->>'ops_demo')::boolean,false)),'manager',manager,
 'settings',(select to_jsonb(s) from public.event_invitation_settings s where event_id=p_event),
 'production_member',exists(select 1 from public.event_production_tasks where event_id=p_event and assigned_user_id=auth.uid()),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.event_production_tasks t where event_id=p_event and (manager or assigned_user_id=auth.uid())),
 'allocations',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.event_invitation_allocations a where event_id=p_event and (manager or distributor_id=auth.uid())),
 'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'allocation_id',i.allocation_id,'state',case when i.state='available' and i.expires_at<=now() then 'expired' else i.state end,'distributed_at',i.distributed_at,'redeemed_at',i.redeemed_at,'registration_id',case when manager then i.registration_id end,'participant_name',case when manager or s.inviter_identity then concat_ws(' ',r.first_name,r.last_name) end,'cancelled',r.status='rejected' or r.badge_cancelled_at is not null,'attended',r.attendance_status::text='checked_in')),'[]') from public.event_private_invitations i join public.event_invitation_allocations a on a.id=i.allocation_id left join public.event_invitation_settings s on s.event_id=i.event_id left join public.registrations r on r.id=i.registration_id where i.event_id=p_event and (manager or a.distributor_id=auth.uid()))) into out from public.events e where e.id=p_event;
 if manager then out:=out||jsonb_build_object(
 'benefits',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from public.event_invitation_benefits b where event_id=p_event),
 'components',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)),'[]') from public.events c join public.events parent on parent.id=p_event where c.organization_id=parent.organization_id and c.id<>p_event and c.status<>'archived'),
 'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'event_id',s.event_id)),'[]') from public.event_sessions s join public.events parent on parent.id=p_event where s.organization_id=parent.organization_id and s.status='scheduled'),
 'households',(select coalesce(jsonb_agg(to_jsonb(h)-'secret_hash'),'[]') from public.event_social_households h where event_id=p_event),
 'members',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('first_name',coalesce(r.first_name,m.first_name),'last_name',coalesce(r.last_name,m.last_name))),'[]') from public.event_social_members m join public.event_private_invitations inv on inv.id=m.invitation_id left join public.registrations r on r.id=inv.registration_id where m.event_id=p_event),
 'tables',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.event_social_tables t where event_id=p_event),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.event_production_tasks t where event_id=p_event),
 'budget',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('usd',round(b.amount/b.ves_per_usd,2))),'[]') from public.event_organizer_budget b where event_id=p_event),
 'reviews',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.event_product_reviews r where event_id=p_event),
 'audit',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select action,target_id,created_at,actor_id from public.event_operations_audit where event_id=p_event order by created_at desc limit 100)x));end if;
 return out;
end $$;

-- Internal redemption is shared with RSVP; caller already holds the event mutex.
create or replace function event_ops_private.redeem(p_invitation uuid,p_first text,p_last text,p_email text,p_phone text,p_request text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.event_private_invitations;a public.event_invitation_allocations;e public.events;r public.registrations;begin
 select * into i from public.event_private_invitations where id=p_invitation for update;
 select * into e from public.events where id=i.event_id;
 if i.state='redeemed' and i.request_hash=p_request then select * into r from public.registrations where id=i.registration_id;return jsonb_build_object('registration_id',r.id,'credential_token',r.credential_token);end if;
 if i.id is null or i.state<>'available' or i.expires_at<=now() then raise exception 'Invitación no disponible'; end if;
 if e.status<>'published' or coalesce(e.config->>'registration_mode','')<>'invitation' or e.end_date<=now() or e.registration_deadline<=now() then raise exception 'Registro no disponible'; end if;
 if length(btrim(coalesce(p_first,'')))<2 or length(coalesce(p_first,''))>120 or length(coalesce(p_last,''))>120 or length(coalesce(p_phone,''))>60 or (nullif(p_email,'') is not null and (length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'Datos de registro no válidos';end if;
 select * into a from public.event_invitation_allocations where id=i.allocation_id;
 if nullif(p_email,'') is not null and exists(select 1 from public.registrations where event_id=e.id and lower(email)=lower(btrim(p_email))) then raise exception 'Ya existe un registro con ese correo; recupera tu registro o consulta al organizador';end if;
 if not exists(select 1 from public.event_social_members where invitation_id=i.id) and nullif(p_email,'') is null then raise exception 'Indica tu correo';end if;
 -- The outstanding issued reservation is exchanged for one real participant.
 perform event_ops_private.allocation_capacity(i.allocation_id,1,i.id);
 perform set_config('event_ops.redeeming',i.id::text,true);
 insert into public.registrations(organization_id,event_id,first_name,last_name,email,phone,status,payment_confirmed_at,participation_type,registration_source,purchase_snapshot)
 values(e.organization_id,e.id,btrim(p_first),nullif(btrim(p_last),''),nullif(lower(btrim(p_email)),''),nullif(btrim(p_phone),''),'confirmed',now(),case when 'vip'=any(a.rights) then 'vip' else 'guest' end,'invite',jsonb_build_object('amount',0,'currency','USD','invitation_id',i.id,'rights',a.rights)) returning * into r;
 insert into public.session_reservations(organization_id,event_id,session_id,registration_id,status) select s.organization_id,s.event_id,s.id,r.id,'confirmed' from public.event_sessions s where s.id=any(a.session_ids);
 perform set_config('event_ops.redeeming','',true);
 update public.event_private_invitations set state='redeemed',registration_id=r.id,request_hash=p_request,redeemed_at=now() where id=i.id;
 perform event_ops_private.audit(e.id,'redeem',i.id,jsonb_build_object('registration_id',r.id));
 return jsonb_build_object('registration_id',r.id,'credential_token',r.credential_token);
end $$;

create or replace function public.redeem_event_invitation(p_event uuid,p_code text,p_request text,p_first text,p_last text,p_email text,p_phone text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.event_private_invitations;e public.events;begin
 e:=event_ops_private.lock_event(p_event);
 if p_code !~ '^[a-f0-9]{64}$' or p_request !~ '^[a-f0-9]{64}$' then raise exception 'Invitación no disponible';end if;
 select * into i from public.event_private_invitations where event_id=p_event and secret_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex');
 if i.id is null or exists(select 1 from public.event_social_members where invitation_id=i.id) then raise exception 'Invitación no disponible';end if;
 return event_ops_private.redeem(i.id,p_first,p_last,p_email,p_phone,encode(sha256(convert_to(p_request,'UTF8')),'hex'));
end $$;

create or replace function public.social_household_access(p_event uuid,p_code text,p_member uuid default null,p_response text default null,p_first text default null,p_last text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.event_social_households;m public.event_social_members;i public.event_private_invitations;e public.events;result jsonb;deadline timestamptz;begin
 e:=event_ops_private.lock_event(p_event);
 if p_code is null and event_ops_private.manager(p_event) then
  select hh.* into h from public.event_social_households hh join public.event_social_members sm on sm.household_id=hh.id where sm.id=p_member and hh.event_id=p_event;
 else
  select * into h from public.event_social_households where event_id=p_event and secret_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex') and expires_at>now();
  if p_code is null or p_code !~ '^[a-f0-9]{64}$' then raise exception 'Enlace no disponible';end if;
 end if;
 if h.id is null then raise exception 'Enlace no disponible';end if;
 select rsvp_deadline into deadline from public.event_invitation_settings where event_id=p_event;
 if p_member is not null then
  select rsvp_deadline into deadline from public.event_invitation_settings where event_id=p_event;
  if deadline<=now() and not event_ops_private.manager(p_event) then raise exception 'El plazo de confirmación terminó';end if;
  select * into m from public.event_social_members where id=p_member and household_id=h.id for update;
  if m.id is null or p_response not in('accepted','declined') then raise exception 'Respuesta no válida';end if;
  if length(btrim(coalesce(p_first,m.first_name)))<2 then raise exception 'Indica el nombre';end if;
  select * into i from public.event_private_invitations where id=m.invitation_id;
  if p_response='accepted' then
   if i.state='redeemed' then
    if m.rsvp='declined' then raise exception 'Solicita al planner reactivar tu participación';end if;
   else perform event_ops_private.redeem(i.id,coalesce(p_first,m.first_name),coalesce(p_last,m.last_name),m.email,null,'household:'||m.id);end if;
  elsif i.state='redeemed' then
   update public.registrations set status='rejected',badge_cancelled_at=now(),badge_cancelled_reason='RSVP declinado',updated_at=now() where id=i.registration_id;
  else update public.event_private_invitations set state='revoked' where id=i.id;end if;
  update public.event_social_members set first_name=case when i.state='redeemed' then first_name else coalesce(p_first,first_name) end,last_name=case when i.state='redeemed' then last_name else coalesce(p_last,last_name) end,rsvp=p_response,responded_at=now(),updated_by=auth.uid(),table_id=case when p_response='declined' then null else table_id end where id=m.id;
  perform event_ops_private.audit(p_event,'rsvp',m.id,jsonb_build_object('response',p_response));
 end if;
 return jsonb_build_object('event_name',e.name,'household_name',h.name,'deadline',deadline,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',sm.id,'first_name',coalesce(r.first_name,sm.first_name),'last_name',coalesce(r.last_name,sm.last_name),'rsvp',sm.rsvp,'table_name',t.name,'credential_token',case when sm.rsvp='accepted' and r.badge_cancelled_at is null then r.credential_token end)),'[]') from public.event_social_members sm join public.event_private_invitations inv on inv.id=sm.invitation_id left join public.registrations r on r.id=inv.registration_id left join public.event_social_tables t on t.id=sm.table_id where sm.household_id=h.id));
end $$;

-- Private registrations cannot be created by an obsolete public RPC or direct insert.
create or replace function event_ops_private.guard_private_registration() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce((select config->>'registration_mode' from public.events where id=new.event_id),'')='invitation'
 and not event_ops_private.manager(new.event_id) and not exists(select 1 from public.event_private_invitations i where i.id=nullif(new.purchase_snapshot->>'invitation_id','')::uuid and i.id::text=current_setting('event_ops.redeeming',true) and i.event_id=new.event_id and i.state='available') then
  raise exception 'Este evento requiere una invitación válida' using errcode='42501';
 end if;return new;
end $$;
drop trigger if exists private_registration_guard on public.registrations;
create trigger private_registration_guard before insert on public.registrations for each row execute function event_ops_private.guard_private_registration();

-- The existing checkout snapshot trigger normally replaces the caller's snapshot.
-- Only the internal atomic invitation operation may capture its zero-price rights.
do $migration$declare definition text;begin
 if to_regprocedure('public.capture_registration_purchase()') is not null then
  select pg_get_functiondef('public.capture_registration_purchase()'::regprocedure) into definition;
  if position('event_ops.redeeming' in definition)=0 then
   definition:=regexp_replace(definition,'\mbegin\M',$insert$begin
  if TG_OP='INSERT' and nullif(current_setting('event_ops.redeeming',true),'')=new.purchase_snapshot->>'invitation_id'
   and exists(select 1 from public.event_private_invitations inv where inv.id::text=new.purchase_snapshot->>'invitation_id' and inv.event_id=new.event_id and inv.organization_id=new.organization_id and inv.state='available') then
    select * into e from public.events where id=new.event_id for update;
    new.purchase_snapshot:=new.purchase_snapshot||jsonb_build_object('event_name',e.name,'starts_at',e.start_date,'timezone',coalesce(e.config->>'timezone','America/Caracas'),'venue',coalesce(e.config->>'venue_name',e.config->>'location'),'amount',0,'currency','USD','price_policy','private_invitation');
    new.status:='confirmed';new.ticket_category_id:=null;new.seat_id:=null;new.payment_deadline:=null;new.payment_confirmed_at:=now();return new;
  end if;
 $insert$,'i');execute definition;
  end if;
 end if;
end $migration$;

create or replace function event_ops_private.guard_program_invitation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_id is not null and coalesce((select config->>'registration_mode' from public.events where id=new.event_id),'')='invitation' and not event_ops_private.manager(new.event_id) then raise exception 'El componente requiere una invitación individual' using errcode='42501';end if;
 return new;
end $$;
drop trigger if exists private_program_registration_guard on public.event_participations;
create trigger private_program_registration_guard before insert on public.event_participations for each row execute function event_ops_private.guard_program_invitation();

create or replace function event_ops_private.guard_private_program_item() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 if TG_TABLE_NAME='program_registration_order_items' then
  for target in select coalesce(en.event_id,s.event_id,z.event_id) from public.program_registration_entitlements en left join public.event_sessions s on s.id=en.session_id left join public.event_zones z on z.id=en.zone_id where en.item_id=new.item_id loop
   if coalesce((select config->>'registration_mode' from public.events where id=target),'')='invitation' and not event_ops_private.manager(target) then raise exception 'El componente requiere una invitación individual' using errcode='42501';end if;
  end loop;
 else
  for target in select coalesce(en.event_id,s.event_id,z.event_id) from public.pass_entitlements en left join public.event_sessions s on s.id=en.session_id left join public.event_zones z on z.id=en.zone_id where en.pass_id=new.pass_id loop
   if coalesce((select config->>'registration_mode' from public.events where id=target),'')='invitation' and not event_ops_private.manager(target) then raise exception 'El componente requiere una invitación individual' using errcode='42501';end if;
  end loop;
 end if;return new;
end $$;
drop trigger if exists private_program_item_guard on public.program_registration_order_items;
create trigger private_program_item_guard before insert on public.program_registration_order_items for each row execute function event_ops_private.guard_private_program_item();
drop trigger if exists private_program_pass_guard on public.participation_passes;
create trigger private_program_pass_guard before insert on public.participation_passes for each row execute function event_ops_private.guard_private_program_item();

-- Check-in for invited registration credentials. Session-specific admission is not inferred.
create or replace function public.validate_invitation_checkin(p_token text,p_point uuid,p_session uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.registrations;i public.event_private_invitations;a public.event_invitation_allocations;p public.access_points;scope text;table_name text;begin
 select * into r from public.registrations where credential_token=p_token;
 select * into i from public.event_private_invitations where registration_id=r.id;
 if i.id is null then return null;end if;
 select * into p from public.access_points where id=p_point;
 if p.id is null or not public.has_event_staff_scope(p.event_id,p.id,'checkin.perform') then raise exception 'Selecciona un punto de acceso autorizado' using errcode='42501';end if;
 if exists(select 1 from public.events where id=p.event_id and (status<>'published' or end_date<=now())) then return jsonb_build_object('result','denied','reason','El evento no está abierto para ingreso');end if;
 select * into a from public.event_invitation_allocations where id=i.allocation_id;
 if (p.event_id<>i.event_id and not p.event_id=any(a.access_event_ids)) or p.organization_id<>i.organization_id then return jsonb_build_object('result','denied','reason','Credencial de otro evento');end if;
 if cardinality(a.access_dates)>0 and not (now() at time zone 'America/Caracas')::date=any(a.access_dates) then return jsonb_build_object('result','denied','reason','Invitación no válida para la fecha de hoy');end if;
 if p_session is not null and not exists(select 1 from public.session_reservations sr join public.event_sessions s on s.id=sr.session_id where sr.registration_id=r.id and sr.session_id=p_session and sr.status in('confirmed','checked_in') and s.event_id=p.event_id and s.status='scheduled') then return jsonb_build_object('result','denied','reason','Esta invitación no incluye una reserva de la sesión');end if;
 if r.status<>'confirmed' or r.badge_cancelled_at is not null then return jsonb_build_object('result','denied','reason','Credencial cancelada o sin confirmar');end if;
 if coalesce((select (config->>'checkin_enabled')::boolean from public.events where id=p.event_id),true) is false then return jsonb_build_object('result','denied','reason','Check-in desactivado');end if;
 select * into a from public.event_invitation_allocations where id=i.allocation_id;
 if p.zone_id is not null then select case kind when 'general' then null else kind end into scope from public.event_zones where id=p.zone_id;end if;
 if scope is null then select case event_type when 'exhibition' then 'exhibition' when 'forum' then 'forum' when 'social' then 'social' else 'unsupported' end into scope from public.events where id=p.event_id;end if;
 if not scope=any(a.rights) then return jsonb_build_object('result','denied','reason','La invitación no habilita esta zona');end if;
 perform pg_advisory_xact_lock(hashtextextended(i.id::text||p.id::text,19));
 perform set_config('event_ops.checkin',r.id::text,true);
 if exists(select 1 from public.checkin_records where registration_id=r.id and access_point_id=p.id and invitation_session_id is not distinct from p_session and result='allowed') then return jsonb_build_object('result','duplicate','reason','Acceso ya registrado');end if;
 insert into public.checkin_records(organization_id,registration_id,event_id,access_point_id,result,scanned_by,invitation_session_id) values(i.organization_id,r.id,p.event_id,p.id,'allowed',auth.uid(),p_session);
 update public.registrations set attendance_status='checked_in' where id=r.id;
 if p_session is not null then update public.session_reservations set status='checked_in',checked_in_at=now() where registration_id=r.id and session_id=p_session;end if;
 perform set_config('event_ops.checkin','',true);
 select t.name into table_name from public.event_social_members m join public.event_social_tables t on t.id=m.table_id where m.invitation_id=i.id;
 return jsonb_build_object('result','allowed','participant_name',concat_ws(' ',r.first_name,r.last_name),'reason',concat('Acceso autorizado',case when table_name is not null then ' · Mesa: '||table_name end));
end $$;

create or replace function event_ops_private.guard_session_reservation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in('confirmed','checked_in','pending_payment') then
  perform event_ops_private.session_capacity(new.session_id,1,nullif(current_setting('event_ops.redeeming',true),'')::uuid,new.id);
 end if;return new;
end $$;
drop trigger if exists private_invitation_session_capacity on public.session_reservations;
create trigger private_invitation_session_capacity before insert or update of status on public.session_reservations for each row execute function event_ops_private.guard_session_reservation();

create or replace function event_ops_private.guard_invited_checkin_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.result in('allowed','validated') and exists(select 1 from public.event_private_invitations where registration_id=new.registration_id) and current_setting('event_ops.checkin',true) is distinct from new.registration_id::text then raise exception 'Valida la invitación en su punto de acceso';end if;return new;
end $$;
drop trigger if exists invited_checkin_record_guard on public.checkin_records;
create trigger invited_checkin_record_guard before insert on public.checkin_records for each row execute function event_ops_private.guard_invited_checkin_record();

create or replace function event_ops_private.guard_event_capacity() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.events;n int;begin
 if nullif(current_setting('event_ops.redeeming',true),'') is not null then return new;end if;
 select * into e from public.events where id=new.event_id for update;
 select count(*) into n from public.registrations where event_id=e.id and status<>'rejected' and badge_cancelled_at is null;
 select n+count(*) into n from public.event_private_invitations inv join public.event_invitation_allocations a on a.id=inv.allocation_id join public.registrations r on r.id=inv.registration_id where inv.event_id<>e.id and e.id=any(a.access_event_ids) and r.status='confirmed' and r.badge_cancelled_at is null;
 select n+count(*) into n from public.event_private_invitations inv join public.event_invitation_allocations a on a.id=inv.allocation_id join public.event_invitation_settings s on s.event_id=inv.event_id where (inv.event_id=e.id or e.id=any(a.access_event_ids)) and inv.state='available' and (inv.expires_at is null or inv.expires_at>now()) and s.capacity_policy='issue';
 if e.total_slots>0 and n+1>e.total_slots then raise exception 'El aforo incluye reservas de invitaciones y está agotado';end if;return new;
end $$;
drop trigger if exists private_invitation_event_capacity on public.registrations;
create trigger private_invitation_event_capacity before insert on public.registrations for each row execute function event_ops_private.guard_event_capacity();

create or replace function event_ops_private.guard_capacity_change() returns trigger language plpgsql security definer set search_path='' as $$
declare n int;begin
 if new.total_slots=old.total_slots or new.total_slots<=0 then return new;end if;
 select count(*) into n from public.registrations where event_id=new.id and status<>'rejected' and badge_cancelled_at is null;
 select n+count(*) into n from public.event_private_invitations inv join public.event_invitation_allocations a on a.id=inv.allocation_id join public.registrations r on r.id=inv.registration_id where inv.event_id<>new.id and new.id=any(a.access_event_ids) and r.status='confirmed' and r.badge_cancelled_at is null;
 select n+count(*) into n from public.event_private_invitations inv join public.event_invitation_allocations a on a.id=inv.allocation_id join public.event_invitation_settings s on s.event_id=inv.event_id where (inv.event_id=new.id or new.id=any(a.access_event_ids)) and inv.state='available' and (inv.expires_at is null or inv.expires_at>now()) and s.capacity_policy='issue';
 if n>new.total_slots then raise exception 'El aforo no puede quedar por debajo de participantes y reservas vigentes (%)',n;end if;return new;
end $$;
drop trigger if exists private_invitation_capacity_change on public.events;
create trigger private_invitation_capacity_change before update of total_slots on public.events for each row execute function event_ops_private.guard_capacity_change();

-- Prevent old direct attendance updates from bypassing the selected point/zone.
create or replace function event_ops_private.guard_invited_attendance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.attendance_status::text='checked_in' and old.attendance_status is distinct from new.attendance_status and exists(select 1 from public.event_private_invitations where registration_id=new.id)
 and current_setting('event_ops.checkin',true) is distinct from new.id::text then raise exception 'Valida esta invitación en un punto de acceso autorizado';end if;return new;
end $$;
drop trigger if exists invited_attendance_guard on public.registrations;
create trigger invited_attendance_guard before update of attendance_status on public.registrations for each row execute function event_ops_private.guard_invited_attendance();

-- Printing stays operational; an invitation is admitted only at an authorized point.
do $$declare definition text;begin
 if to_regprocedure('badge_private.transition_job(uuid,text,text,text,text,uuid)') is not null then
  select pg_get_functiondef('badge_private.transition_job(uuid,text,text,text,text,uuid)'::regprocedure) into definition;
  definition:=replace(definition,'if job.fulfillment_mode=''onsite'' then','if job.fulfillment_mode=''onsite'' and not exists(select 1 from public.event_private_invitations where registration_id=job.registration_id) then');
  execute definition;
 end if;
end $$;

-- Existing scanning clients receive the same checks, including old cached frontends.
do $migration$declare f record;definition text;old_name text;args text;begin
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('validate_program_checkin','validate_session_checkin') loop
  old_name:='original_'||f.proname;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='event_ops_private' and p.proname=old_name and p.proargtypes=f.proargtypes) then continue;end if;
  select string_agg(format('%I',f.proargnames[x]),',' order by x) into args from generate_series(1,f.pronargs)x;
  definition:=format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as $wrapped$ declare v jsonb;begin v:=public.validate_invitation_checkin(p_credential_token,p_access_point_id,%s);if v is not null then return query select v->>''result'',v->>''participant_name'',v->>''reason'',%s;return;end if;return query select * from event_ops_private.%I(%s);end $wrapped$;',f.proname,pg_get_function_arguments(f.oid),pg_get_function_result(f.oid),case when f.proname='validate_session_checkin' then 'p_session_id' else 'null' end,case when f.proname='validate_session_checkin' then 'null::int' else '(select a.event_id from public.access_points a where a.id=p_access_point_id)' end,old_name,args);
  execute format('alter function public.%I(%s) set schema event_ops_private',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('alter function event_ops_private.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),old_name);
  execute definition;
  execute format('revoke all on function public.%I(%s) from public,anon',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
end $migration$;

revoke all on all functions in schema event_ops_private from public,anon,authenticated;
grant execute on function event_ops_private.manager(uuid) to authenticated;
revoke all on function public.event_operations_command(uuid,text,jsonb),public.get_event_operations(uuid),public.validate_invitation_checkin(text,uuid,uuid),public.redeem_event_invitation(uuid,text,text,text,text,text,text),public.social_household_access(uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.event_operations_command(uuid,text,jsonb),public.get_event_operations(uuid),public.validate_invitation_checkin(text,uuid,uuid) to authenticated;
grant execute on function public.redeem_event_invitation(uuid,text,text,text,text,text,text),public.social_household_access(uuid,text,uuid,text,text,text) to service_role;
create or replace function public.get_invitation_credential_details(p_token text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('rights',a.rights,'dates',a.access_dates,'components',(select coalesce(jsonb_agg(e.name),'[]') from public.events e where e.id=i.event_id or e.id=any(a.access_event_ids)),
 'sessions',(select coalesce(jsonb_agg(s.name),'[]') from public.event_sessions s where s.id=any(a.session_ids)),'table_name',(select t.name from public.event_social_members m join public.event_social_tables t on t.id=m.table_id where m.invitation_id=i.id))
 from public.registrations r join public.event_private_invitations i on i.registration_id=r.id join public.event_invitation_allocations a on a.id=i.allocation_id where r.credential_token=p_token and r.status='confirmed' and r.badge_cancelled_at is null;
$$;
revoke all on function public.get_invitation_credential_details(text) from public;
grant execute on function public.get_invitation_credential_details(text) to anon,authenticated;
notify pgrst,'reload schema';
