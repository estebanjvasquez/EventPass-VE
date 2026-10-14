-- Credential workflow integrity: scoped mutations, immutable attempts and station recovery.
create schema if not exists badge_private;
revoke all on schema badge_private from public, anon, authenticated;

drop policy if exists badge_assets_member_write on public.badge_assets;
create policy badge_assets_member_write on public.badge_assets for all to authenticated
using (public.has_event_staff_scope(badge_assets.event_id,null,'badges.print') or public.is_platform_admin())
with check ((public.has_event_staff_scope(badge_assets.event_id,null,'badges.print') or public.is_platform_admin())
  and exists(select 1 from public.events e where e.id=badge_assets.event_id and e.organization_id=badge_assets.organization_id));
drop policy if exists badge_template_versions_member_insert on public.badge_template_versions;
create policy badge_template_versions_member_insert on public.badge_template_versions for insert to authenticated
with check ((public.has_org_role(badge_template_versions.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin())
  and exists(select 1 from public.events e where e.id=badge_template_versions.event_id and e.organization_id=badge_template_versions.organization_id));
drop policy if exists badge_templates_admin_manage on public.badge_templates;
create policy badge_templates_admin_manage on public.badge_templates for all to authenticated
using (public.has_org_role(badge_templates.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin())
with check ((public.has_org_role(badge_templates.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin())
  and exists(select 1 from public.events e where e.id=badge_templates.event_id and e.organization_id=badge_templates.organization_id));

alter table public.badge_print_jobs add column if not exists station_key uuid,
  add column if not exists previous_credential_token text,
  add column if not exists template_snapshot jsonb;
create index if not exists badge_print_jobs_station_pending on public.badge_print_jobs(station_key,id)
  where status in ('rendering','sent');
create unique index if not exists badge_print_jobs_one_pending_registration on public.badge_print_jobs(registration_id)
  where registration_id is not null and status in ('queued','rendering','sent');
create unique index if not exists badge_print_jobs_one_pending_participation on public.badge_print_jobs(participation_id)
  where participation_id is not null and status in ('queued','rendering','sent');
alter table public.accreditation_service_sessions add column if not exists print_job_id uuid references public.badge_print_jobs(id);
create unique index if not exists accreditation_service_job_outcome on public.accreditation_service_sessions(print_job_id,outcome)
  where print_job_id is not null;

-- A bounded credential can report only transport outcomes for one station/event.
-- It cannot read participants, create jobs, confirm payments, or mark delivery.
create table if not exists badge_private.station_sync_credentials(
  token_hash text primary key,event_id uuid not null references public.events(id) on delete cascade,
  station_key uuid not null,issued_by uuid not null references auth.users(id) on delete cascade,expires_at timestamptz not null
);
alter table badge_private.station_sync_credentials enable row level security;
revoke all on badge_private.station_sync_credentials from public,anon,authenticated;

create or replace function badge_private.operation_event(p_record_type text,p_record_id uuid,p_event_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_record_type='registration' then
    select r.event_id into target from public.registrations r where r.id=p_record_id and (p_event_id is null or r.event_id=p_event_id);
  elsif p_record_type='participation' then
    select e.id into target from public.event_participations p join public.event_programs program on program.id=p.program_id
    join public.events e on e.organization_id=program.organization_id and (e.id=p.event_id or exists(
      select 1 from public.program_registration_orders o join public.program_registration_order_items i on i.order_id=o.id
      join public.program_registration_entitlements en on en.item_id=i.item_id
      left join public.event_sessions s on s.id=en.session_id left join public.event_zones z on z.id=en.zone_id
      where o.participation_id=p.id and o.status='confirmed' and coalesce(en.event_id,s.event_id,z.event_id)=e.id
    )) where p.id=p_record_id and (p_event_id is null or e.id=p_event_id)
      and (public.has_event_staff_scope(e.id,null,'badges.print') or public.is_platform_admin()) order by e.id limit 1;
  else raise exception 'Tipo de registro invalido'; end if;
  if target is null or not(public.has_event_staff_scope(target,null,'badges.print') or public.is_platform_admin()) then
    raise exception 'No autorizado para esta credencial y evento' using errcode='42501';
  end if;
  return target;
end $$;
revoke all on function badge_private.operation_event(text,uuid,uuid) from public,anon,authenticated;

-- Return the requested event's attendance and participant, without a global QR lookup.
create or replace function public.get_event_badge_for_print(p_event_id uuid,p_token text)
returns table(id uuid,record_type text,first_name text,last_name text,cedula text,company text,job_title text,participation_type text,status text,attendance_status text,credential_token text,seat_label text,badge_cancelled_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  return query
  select r.id,'registration'::text,r.first_name,r.last_name,r.cedula,r.company,r.job_title,r.participation_type,r.status::text,r.attendance_status::text,r.credential_token,
    coalesce(s.seat_number,nullif(concat_ws('',s.row_label,s.column_number::text),'')),r.badge_cancelled_at
  from public.registrations r left join public.seats s on s.id=r.seat_id where r.event_id=p_event_id and r.credential_token=btrim(p_token)
  union all
  select p.id,'participation'::text,person.first_name,person.last_name,person.cedula,person.company,person.job_title,p.participation_type,p.status,
    case when exists(select 1 from public.checkin_records c where c.participation_id=p.id and c.event_id=p_event_id and c.result in ('allowed','validated')) then 'checked_in' else 'no_attendance' end,
    p.credential_token,null::text,p.badge_cancelled_at
  from public.event_participations p join public.people person on person.id=p.person_id
  join public.event_programs program on program.id=p.program_id join public.events e on e.id=p_event_id and e.organization_id=program.organization_id
  where p.credential_token=btrim(p_token) and (p.event_id=p_event_id or exists(
    select 1 from public.program_registration_orders o join public.program_registration_order_items i on i.order_id=o.id
    join public.program_registration_entitlements en on en.item_id=i.item_id left join public.event_sessions s on s.id=en.session_id left join public.event_zones z on z.id=en.zone_id
    where o.participation_id=p.id and o.status='confirmed' and coalesce(en.event_id,s.event_id,z.event_id)=p_event_id
  ));
end $$;

drop function if exists public.confirm_event_badge(text,uuid);
create or replace function public.confirm_event_badge(p_record_type text,p_record_id uuid,p_event_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform badge_private.operation_event(p_record_type,p_record_id,p_event_id);
  if p_record_type='registration' then
    update public.registrations set status='confirmed',payment_confirmed_at=coalesce(payment_confirmed_at,now()),updated_at=now()
      where id=p_record_id and badge_cancelled_at is null;
  else update public.event_participations set status='approved' where id=p_record_id and badge_cancelled_at is null; end if;
  if not found then raise exception 'La credencial esta cancelada'; end if;
end $$;

create or replace function public.create_walk_in_badge(p_event_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text,p_cedula text,p_company text,p_job_title text,p_participation_type text default 'attendee')
returns table(id uuid,credential_token text) language plpgsql security definer set search_path='' as $$
declare org uuid; created public.registrations;
begin
  select e.organization_id into org from public.events e where e.id=p_event_id;
  if auth.uid() is null or org is null or not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if nullif(btrim(p_first_name),'') is null then raise exception 'El nombre es obligatorio'; end if;
  if p_participation_type not in ('attendee','guest','vip','speaker','exhibitor','staff','security') then raise exception 'Tipo de participante invalido'; end if;
  insert into public.registrations(organization_id,event_id,first_name,last_name,email,phone,cedula,company,job_title,participation_type,registration_source,status,payment_confirmed_at)
  values(org,p_event_id,btrim(p_first_name),nullif(btrim(p_last_name),''),coalesce(nullif(lower(btrim(p_email)),''),'walkin+'||gen_random_uuid()::text||'@invalid.eventosfacil.local'),nullif(btrim(p_phone),''),nullif(btrim(p_cedula),''),nullif(btrim(p_company),''),nullif(btrim(p_job_title),''),p_participation_type,'walk_in','confirmed',now()) returning * into created;
  return query select created.id,created.credential_token;
end $$;

drop function if exists public.update_event_badge_identity(text,uuid,text,text,text,text,text);
create or replace function public.update_event_badge_identity(p_record_type text,p_record_id uuid,p_first_name text,p_last_name text,p_cedula text,p_company text,p_job_title text,p_event_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid; org uuid; person uuid; previous jsonb; updated jsonb;
begin
  target:=badge_private.operation_event(p_record_type,p_record_id,p_event_id);
  select e.organization_id into org from public.events e where e.id=target;
  if nullif(btrim(p_first_name),'') is null then raise exception 'El nombre es obligatorio'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_record_type||':'||p_record_id::text,0));
  if exists(select 1 from public.badge_print_jobs j where (j.registration_id=p_record_id or j.participation_id=p_record_id) and j.status in ('queued','rendering','sent')) then raise exception 'Espera a que termine el trabajo pendiente antes de corregir los datos'; end if;
  if p_record_type='registration' then
    select jsonb_build_object('first_name',r.first_name,'last_name',r.last_name,'cedula',r.cedula,'company',r.company,'job_title',r.job_title) into previous from public.registrations r where r.id=p_record_id for update;
    update public.registrations set first_name=btrim(p_first_name),last_name=nullif(btrim(p_last_name),''),cedula=nullif(btrim(p_cedula),''),company=nullif(btrim(p_company),''),job_title=nullif(btrim(p_job_title),''),updated_at=now() where id=p_record_id;
  else
    select p.person_id into person from public.event_participations p where p.id=p_record_id;
    select jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'cedula',p.cedula,'company',p.company,'job_title',p.job_title) into previous from public.people p where p.id=person for update;
    update public.people set first_name=btrim(p_first_name),last_name=nullif(btrim(p_last_name),''),cedula=nullif(btrim(p_cedula),''),company=nullif(btrim(p_company),''),job_title=nullif(btrim(p_job_title),''),updated_at=now() where id=person;
  end if;
  updated:=jsonb_build_object('first_name',btrim(p_first_name),'last_name',nullif(btrim(p_last_name),''),'cedula',nullif(btrim(p_cedula),''),'company',nullif(btrim(p_company),''),'job_title',nullif(btrim(p_job_title),''));
  insert into public.badge_identity_audit(organization_id,event_id,registration_id,participation_id,previous_data,new_data,changed_by)
  values(org,target,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,previous,updated,auth.uid());
end $$;

drop function if exists public.cancel_event_badge(text,uuid,text,text);
create or replace function public.cancel_event_badge(p_record_type text,p_record_id uuid,p_reason text,p_device_label text default null,p_event_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid; org uuid;
begin
  target:=badge_private.operation_event(p_record_type,p_record_id,p_event_id);
  if nullif(btrim(p_reason),'') is null then raise exception 'La cancelacion requiere un motivo'; end if;
  select e.organization_id into org from public.events e where e.id=target;
  perform pg_advisory_xact_lock(hashtextextended(p_record_type||':'||p_record_id::text,0));
  if exists(select 1 from public.badge_print_jobs j where (j.registration_id=p_record_id or j.participation_id=p_record_id) and j.status in ('queued','rendering','sent')) then raise exception 'Cancela primero el trabajo pendiente en su estacion'; end if;
  if p_record_type='registration' then update public.registrations set badge_cancelled_at=now(),badge_cancelled_reason=btrim(p_reason),updated_at=now() where id=p_record_id;
  else update public.event_participations set badge_cancelled_at=now(),badge_cancelled_reason=btrim(p_reason) where id=p_record_id; end if;
  insert into public.badge_print_logs(organization_id,event_id,registration_id,participation_id,print_kind,reason,printed_by,device_label)
  values(org,target,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,'cancelled',btrim(p_reason),auth.uid(),left(p_device_label,120));
end $$;

create or replace function public.prepare_badge_print_job(p_event_id uuid,p_record_type text,p_record_id uuid,p_template_id uuid,p_station_label text,p_printer_name text,p_reason text default null,p_output_sides integer default 1,p_profile_snapshot jsonb default '{}'::jsonb)
returns table(job_id uuid,print_kind text,credential_token text) language plpgsql security definer set search_path='' as $$
declare org uuid; valid boolean; current_token text; new_token text; kind text; created_job uuid; operator_name text; operator_email text; snapshot jsonb;
begin
  perform badge_private.operation_event(p_record_type,p_record_id,p_event_id);
  select e.organization_id into org from public.events e where e.id=p_event_id;
  if nullif(btrim(p_station_label),'') is null or nullif(btrim(p_printer_name),'') is null then raise exception 'Selecciona una estacion y una impresora'; end if;
  if p_output_sides is null or p_output_sides not in (1,2) then raise exception 'Cantidad de caras invalida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_record_type||':'||p_record_id::text,0));
  if exists(select 1 from public.badge_print_jobs j where (j.registration_id=p_record_id or j.participation_id=p_record_id) and j.status in ('queued','rendering','sent')) then raise exception 'La persona ya tiene un trabajo pendiente; consulta la cola antes de reimprimir'; end if;
  if p_record_type='registration' then
    select r.status='confirmed' and r.badge_cancelled_at is null,r.credential_token into valid,current_token from public.registrations r where r.id=p_record_id for update;
  else select p.status='approved' and p.badge_cancelled_at is null,p.credential_token into valid,current_token from public.event_participations p where p.id=p_record_id for update; end if;
  if not coalesce(valid,false) then raise exception 'La credencial no esta confirmada o ya fue cancelada'; end if;
  if p_template_id is not null then
    select to_jsonb(t) into snapshot from public.badge_templates t where t.id=p_template_id and t.event_id=p_event_id and t.organization_id=org and t.active and t.template_status='published';
    if snapshot is null then raise exception 'Plantilla publicada no disponible'; end if;
  end if;
  select case when exists(select 1 from public.badge_print_logs l where l.event_id=p_event_id and l.print_kind in ('initial','reprint') and (l.registration_id=p_record_id or l.participation_id=p_record_id)) then 'reprint' else 'initial' end into kind;
  if kind='reprint' and nullif(btrim(p_reason),'') is null then raise exception 'La reimpresion requiere un motivo'; end if;
  -- The replacement QR is provisional until Windows accepts the job.
  new_token:=case when kind='reprint' then encode(extensions.gen_random_bytes(16),'hex') else current_token end;
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),u.email::text into operator_name,operator_email from auth.users u where u.id=auth.uid();
  insert into public.badge_print_jobs(organization_id,event_id,registration_id,participation_id,template_id,template_snapshot,status,print_kind,reason,station_label,station_key,printer_name,requested_by,requested_by_name,requested_by_email,output_sides,profile_snapshot,credential_token_snapshot,previous_credential_token)
  values(org,p_event_id,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,p_template_id,snapshot,'queued',kind,nullif(btrim(p_reason),''),left(btrim(p_station_label),120),nullif(p_profile_snapshot->>'stationKey','')::uuid,left(btrim(p_printer_name),240),auth.uid(),operator_name,operator_email,p_output_sides,coalesce(p_profile_snapshot,'{}'),new_token,current_token) returning id into created_job;
  insert into public.badge_print_job_events(job_id,status,message,actor_id,actor_name) values(created_job,'queued','Trabajo preparado',auth.uid(),operator_name);
  return query select created_job,kind,new_token;
end $$;

-- Retire the earlier job-creation entry point so it cannot bypass deduplication.
create or replace function public.create_badge_print_job(p_event_id uuid,p_record_type text,p_record_id uuid,p_template_id uuid,p_station_label text,p_printer_name text,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
  select p.job_id into created from public.prepare_badge_print_job(p_event_id,p_record_type,p_record_id,p_template_id,p_station_label,p_printer_name,p_reason) p;
  return created;
end $$;

create or replace function public.create_badge_print_batch(p_event_id uuid,p_name text,p_records jsonb,p_station_label text,p_printer_name text,p_profile_snapshot jsonb default '{}'::jsonb,p_allow_reprints boolean default false,p_filter_snapshot jsonb default '{}'::jsonb)
returns table(batch_id uuid,job_id uuid,record_type text,record_id uuid,credential_token text,template_id uuid,batch_sequence integer)
language plpgsql security definer set search_path='' as $$
declare org uuid; created_batch uuid; item jsonb; seq integer:=0; item_type text; item_id uuid; person_type text; template public.badge_templates; prepared record; operator_name text;
begin
  select e.organization_id into org from public.events e where e.id=p_event_id;
  if auth.uid() is null or org is null or not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_records is null or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 250 then raise exception 'Selecciona entre 1 y 250 credenciales'; end if;
  if (select count(*) from (select distinct v->>'record_type',v->>'id' from jsonb_array_elements(p_records) v) unique_people)<>jsonb_array_length(p_records) then raise exception 'El lote contiene personas duplicadas'; end if;
  select coalesce(u.raw_user_meta_data->>'display_name',u.email::text) into operator_name from auth.users u where u.id=auth.uid();
  insert into public.badge_print_batches(organization_id,event_id,name,status,station_label,printer_name,allow_reprints,filter_snapshot,created_by,created_by_name)
  values(org,p_event_id,left(coalesce(nullif(btrim(p_name),''),'Preimpresion'),160),'preparing',left(p_station_label,120),left(p_printer_name,240),p_allow_reprints,coalesce(p_filter_snapshot,'{}'),auth.uid(),operator_name) returning id into created_batch;
  -- Stable record ordering avoids deadlocks between overlapping batches.
  for item in select v from jsonb_array_elements(p_records) v order by v->>'record_type',v->>'id' loop
    seq:=seq+1;item_type:=item->>'record_type';item_id:=(item->>'id')::uuid;
    perform badge_private.operation_event(item_type,item_id,p_event_id);
    if item_type='registration' then select r.participation_type into person_type from public.registrations r where r.id=item_id;
    else select p.participation_type into person_type from public.event_participations p where p.id=item_id; end if;
    select t.* into template from public.badge_templates t where t.event_id=p_event_id and t.organization_id=org and t.participation_type=person_type and t.active and t.template_status='published' order by t.version desc limit 1;
    if template.id is null then raise exception 'Falta una plantilla publicada para %',person_type; end if;
    select * into prepared from public.prepare_badge_print_job(p_event_id,item_type,item_id,template.id,p_station_label,p_printer_name,case when p_allow_reprints then 'Reimpresion masiva autorizada' end,case when template.double_sided then 2 else 1 end,p_profile_snapshot);
    update public.badge_print_jobs set batch_id=created_batch,batch_sequence=seq,fulfillment_mode='preprint' where id=prepared.job_id;
    batch_id:=created_batch;job_id:=prepared.job_id;record_type:=item_type;record_id:=item_id;credential_token:=prepared.credential_token;template_id:=template.id;batch_sequence:=seq;return next;
  end loop;
end $$;

create or replace function public.refresh_badge_print_batch() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; totals record; next_status text;
begin
  target:=coalesce(new.batch_id,old.batch_id);if target is null then return null;end if;
  select count(*) total,count(*) filter(where j.status in ('queued','rendering','sent')) pending,
    count(*) filter(where j.status in ('rendering','sent')) processing,count(*) filter(where j.status in ('spooled','delivered')) printed,
    count(*) filter(where j.status='failed') failed,count(*) filter(where j.status='cancelled') cancelled into totals
  from public.badge_print_jobs j where j.batch_id=target and not exists(select 1 from public.badge_print_jobs replacement where replacement.retry_of=j.id and replacement.batch_id=target);
  next_status:=case when totals.total=0 or totals.cancelled=totals.total then 'cancelled' when totals.printed=totals.total then 'completed' when totals.failed=totals.total then 'failed' when totals.pending=0 then 'partial' when totals.processing>0 then 'processing' else 'queued' end;
  update public.badge_print_batches set total_jobs=totals.total,queued_jobs=totals.pending,spooled_jobs=totals.printed,failed_jobs=totals.failed,cancelled_jobs=totals.cancelled,status=next_status,completed_at=case when next_status in ('completed','partial','failed','cancelled') then coalesce(completed_at,now()) end where id=target;
  return null;
end $$;
drop trigger if exists trg_refresh_badge_print_batch on public.badge_print_jobs;
create trigger trg_refresh_badge_print_batch after insert or update of status,batch_id or delete on public.badge_print_jobs for each row execute function public.refresh_badge_print_batch();

create or replace function badge_private.transition_job(p_job_id uuid,p_status text,p_bridge_job_id text,p_payload_hash text,p_error_message text,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare job public.badge_print_jobs; current_attempt integer; current_token text; valid boolean; actor_name text;
begin
  select * into job from public.badge_print_jobs where id=p_job_id;
  if job.id is null then raise exception 'Trabajo no encontrado'; end if;
  perform pg_advisory_xact_lock(hashtextextended(case when job.registration_id is not null then 'registration:'||job.registration_id::text else 'participation:'||job.participation_id::text end,0));
  select * into job from public.badge_print_jobs where id=p_job_id for update;
  if p_status=job.status then return; end if;
  if not coalesce((job.status='queued' and p_status in ('rendering','cancelled','failed'))
    or (job.status='rendering' and p_status in ('sent','failed','cancelled'))
    or (job.status='sent' and p_status in ('spooled','failed','cancelled'))
    or (job.status='spooled' and p_status in ('delivered','failed')),false) then raise exception 'Transicion de impresion invalida: % -> %',job.status,p_status; end if;
  select coalesce(u.raw_user_meta_data->>'display_name',u.email::text) into actor_name from auth.users u where u.id=p_actor;
  current_attempt:=case when p_status='rendering' then job.attempt_count+1 else greatest(job.attempt_count,1) end;
  if p_status='spooled' then
    if job.registration_id is not null then
      select r.status='confirmed' and r.badge_cancelled_at is null,r.credential_token into valid,current_token from public.registrations r where r.id=job.registration_id for update;
    else select p.status='approved' and p.badge_cancelled_at is null,p.credential_token into valid,current_token from public.event_participations p where p.id=job.participation_id for update; end if;
    if not coalesce(valid,false) then raise exception 'La credencial ya no esta disponible'; end if;
    if job.previous_credential_token is not null and current_token is distinct from job.previous_credential_token and current_token is distinct from job.credential_token_snapshot then raise exception 'El QR cambio durante la impresion; solicita una nueva credencial'; end if;
    if job.registration_id is not null then update public.registrations set credential_token=job.credential_token_snapshot,updated_at=now() where id=job.registration_id;
    else update public.event_participations set credential_token=job.credential_token_snapshot where id=job.participation_id; end if;
  end if;
  update public.badge_print_jobs set status=p_status,attempt_count=current_attempt,bridge_job_id=coalesce(nullif(p_bridge_job_id,''),bridge_job_id),payload_hash=coalesce(nullif(p_payload_hash,''),payload_hash),error_message=case when p_status='failed' then left(coalesce(p_error_message,'Fallo de impresion'),1000) end,sent_at=case when p_status='sent' then coalesce(sent_at,now()) else sent_at end,spooled_at=case when p_status='spooled' then now() else spooled_at end,delivered_at=case when p_status='delivered' then now() else delivered_at end,failed_at=case when p_status='failed' then now() else failed_at end,cancelled_at=case when p_status='cancelled' then now() else cancelled_at end,updated_at=now() where id=p_job_id;
  insert into public.badge_print_job_events(job_id,status,message,actor_id,actor_name) values(p_job_id,p_status,left(p_error_message,1000),p_actor,actor_name);
  insert into public.badge_print_job_attempts(job_id,attempt_number,bridge_job_id,printer_name,status,payload_hash,error_message,completed_at)
  values(job.id,current_attempt,coalesce(p_bridge_job_id,job.bridge_job_id),job.printer_name,p_status,p_payload_hash,p_error_message,case when p_status in ('spooled','delivered','failed','cancelled') then now() end)
  on conflict(job_id,attempt_number) do update set status=excluded.status,bridge_job_id=coalesce(excluded.bridge_job_id,public.badge_print_job_attempts.bridge_job_id),payload_hash=coalesce(excluded.payload_hash,public.badge_print_job_attempts.payload_hash),error_message=excluded.error_message,completed_at=coalesce(excluded.completed_at,public.badge_print_job_attempts.completed_at);
  if p_status='spooled' then
    insert into public.badge_print_logs(organization_id,event_id,registration_id,participation_id,print_kind,reason,printed_by,device_label,print_job_id)
    values(job.organization_id,job.event_id,job.registration_id,job.participation_id,job.print_kind,job.reason,p_actor,left(job.station_label||' / '||job.printer_name,120),job.id)
    on conflict(print_job_id) where print_job_id is not null do nothing;
    if job.fulfillment_mode='onsite' then
      if job.registration_id is not null then update public.registrations set attendance_status='checked_in',updated_at=now() where id=job.registration_id and attendance_status='no_attendance'; end if;
      if not exists(select 1 from public.checkin_records c where c.event_id=job.event_id and c.result in ('allowed','validated') and (c.registration_id=job.registration_id or c.participation_id=job.participation_id)) then
        insert into public.checkin_records(organization_id,participation_id,registration_id,event_id,result,scanned_by,device_label) values(job.organization_id,job.participation_id,job.registration_id,job.event_id,'validated',p_actor,left(job.station_label,120));
      end if;
      update public.badge_print_jobs set checked_in_at=coalesce(checked_in_at,now()) where id=job.id;
    end if;
  end if;
  -- Delivery and failure metrics come from the same atomic transaction as job status.
  if p_status in ('delivered','failed') and job.fulfillment_mode='onsite' then
    insert into public.accreditation_service_sessions(organization_id,event_id,registration_id,participation_id,outcome,duration_ms,failure_reason,operator_id,device_label,print_job_id)
    values(job.organization_id,job.event_id,job.registration_id,job.participation_id,p_status,greatest(0,least(2147483647,extract(epoch from now()-job.queued_at)*1000))::integer,p_error_message,p_actor,left(job.station_label,120),job.id)
    on conflict(print_job_id,outcome) where print_job_id is not null do nothing;
  end if;
end $$;
revoke all on function badge_private.transition_job(uuid,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.update_badge_print_job(p_job_id uuid,p_status text,p_bridge_job_id text default null,p_payload_hash text default null,p_error_message text default null)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  select j.event_id into target from public.badge_print_jobs j where j.id=p_job_id;
  if auth.uid() is null or target is null or not(public.has_event_staff_scope(target,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  perform badge_private.transition_job(p_job_id,p_status,p_bridge_job_id,p_payload_hash,p_error_message,auth.uid());
end $$;

create or replace function public.manage_badge_print_job(p_job_id uuid,p_action text,p_printer_name text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare job public.badge_print_jobs; prepared record; operator_name text;
begin
  select * into job from public.badge_print_jobs where id=p_job_id;
  if auth.uid() is null or job.id is null or not(public.has_event_staff_scope(job.event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(case when job.registration_id is not null then 'registration:'||job.registration_id::text else 'participation:'||job.participation_id::text end,0));
  select * into job from public.badge_print_jobs where id=p_job_id for update;
  if p_action='cancel' then
    perform badge_private.transition_job(job.id,'cancelled',null,null,null,auth.uid());return job.id;
  elsif p_action='prioritize' then
    if job.status not in ('queued','rendering','sent') then raise exception 'El trabajo ya no admite prioridad'; end if;
    update public.badge_print_jobs set priority=1,updated_at=now() where id=job.id;
    insert into public.badge_print_job_events(job_id,status,message,actor_id) values(job.id,job.status,'Prioridad elevada',auth.uid());return job.id;
  elsif p_action in ('retry','reassign') then
    if job.status not in ('failed','cancelled') then raise exception 'El trabajo sigue pendiente; comprueba su estado antes de reintentar'; end if;
    if exists(select 1 from public.badge_print_jobs j where j.retry_of=job.id) then raise exception 'Este trabajo ya tiene un reintento; utiliza el ultimo intento'; end if;
    select * into prepared from public.prepare_badge_print_job(job.event_id,case when job.registration_id is not null then 'registration' else 'participation' end,coalesce(job.registration_id,job.participation_id),job.template_id,job.station_label,coalesce(nullif(btrim(p_printer_name),''),job.printer_name),coalesce(job.reason,'Reintento operativo'),job.output_sides,job.profile_snapshot);
    update public.badge_print_jobs set priority=1,retry_of=job.id,batch_id=job.batch_id,batch_sequence=job.batch_sequence,fulfillment_mode=job.fulfillment_mode,template_snapshot=coalesce(job.template_snapshot,template_snapshot) where id=prepared.job_id;
    return prepared.job_id;
  else raise exception 'Accion de cola invalida'; end if;
end $$;

create or replace function public.assign_badge_print_job_station(p_job_id uuid,p_station_key uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  select j.event_id into target from public.badge_print_jobs j where j.id=p_job_id;
  if auth.uid() is null or p_station_key is null or not(public.has_event_staff_scope(target,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  update public.badge_print_jobs set station_key=p_station_key,profile_snapshot=profile_snapshot||jsonb_build_object('stationKey',p_station_key) where id=p_job_id and status='queued';
  if not found then raise exception 'Solo se pueden asignar trabajos aun no enviados'; end if;
end $$;

create or replace function public.get_badge_print_pending_jobs(p_station_key uuid,p_after_id uuid default null,p_limit integer default 100)
returns setof public.badge_print_jobs language sql stable security definer set search_path='' as $$
  select j.* from public.badge_print_jobs j where auth.uid() is not null and j.station_key=p_station_key
    and j.status in ('rendering','sent') and j.printer_name<>'Diálogo del sistema' and (p_after_id is null or j.id>p_after_id)
    and (public.has_event_staff_scope(j.event_id,null,'badges.print') or public.is_platform_admin()) order by j.id limit least(greatest(coalesce(p_limit,100),1),250);
$$;

create or replace function public.register_badge_print_station_sync(p_event_id uuid,p_station_key uuid)
returns table(sync_token text,expires_at timestamptz) language plpgsql security definer set search_path='' as $$
declare secret text; expiry timestamptz:=now()+interval '8 hours';
begin
  if auth.uid() is null or p_station_key is null or not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  delete from badge_private.station_sync_credentials c where c.expires_at<now();
  secret:=encode(extensions.gen_random_bytes(32),'hex');
  insert into badge_private.station_sync_credentials(token_hash,event_id,station_key,issued_by,expires_at) values(encode(extensions.digest(secret,'sha256'),'hex'),p_event_id,p_station_key,auth.uid(),expiry);
  return query select secret,expiry;
end $$;

create or replace function badge_private.report_transport(p_job_id uuid,p_status text,p_bridge_job_id text,p_payload_hash text,p_error_message text,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare job public.badge_print_jobs;
begin
  select * into job from public.badge_print_jobs where id=p_job_id;
  perform pg_advisory_xact_lock(hashtextextended(case when job.registration_id is not null then 'registration:'||job.registration_id::text else 'participation:'||job.participation_id::text end,0));
  select * into job from public.badge_print_jobs where id=p_job_id for update;
  if p_status is null or p_status not in ('sent','spooled','failed','cancelled') or nullif(p_bridge_job_id,'') is null then raise exception 'Reporte de transporte invalido'; end if;
  if job.status in ('spooled','delivered','failed','cancelled') then return; end if;
  if job.status='rendering' then perform badge_private.transition_job(job.id,'sent',p_bridge_job_id,p_payload_hash,null,p_actor); end if;
  if p_status<>'sent' then perform badge_private.transition_job(job.id,p_status,p_bridge_job_id,p_payload_hash,p_error_message,p_actor);
  else update public.badge_print_jobs set bridge_job_id=p_bridge_job_id,payload_hash=coalesce(p_payload_hash,payload_hash) where id=job.id; end if;
end $$;
revoke all on function badge_private.report_transport(uuid,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.acknowledge_badge_print_job(p_job_id uuid,p_station_key uuid,p_status text,p_bridge_job_id text,p_payload_hash text default null,p_error_message text default null)
returns void language plpgsql security definer set search_path='' as $$
declare job public.badge_print_jobs;
begin
  select * into job from public.badge_print_jobs where id=p_job_id and station_key=p_station_key;
  if auth.uid() is null or job.id is null or not(public.has_event_staff_scope(job.event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado para esta estacion' using errcode='42501'; end if;
  perform badge_private.report_transport(job.id,p_status,p_bridge_job_id,p_payload_hash,p_error_message,auth.uid());
end $$;

create or replace function public.sync_badge_print_job(p_sync_token text,p_job_id uuid,p_status text,p_bridge_job_id text,p_payload_hash text default null,p_error_message text default null)
returns void language plpgsql security definer set search_path='' as $$
declare credential badge_private.station_sync_credentials; job public.badge_print_jobs;
begin
  if p_sync_token is null or length(p_sync_token)<>64 or p_status is null or p_status not in ('sent','spooled','failed','cancelled') then raise exception 'Reporte de estacion invalido' using errcode='42501'; end if;
  select * into credential from badge_private.station_sync_credentials c where c.token_hash=encode(extensions.digest(p_sync_token,'sha256'),'hex') and c.expires_at>now();
  select * into job from public.badge_print_jobs j where j.id=p_job_id and j.event_id=credential.event_id and j.station_key=credential.station_key;
  if credential.token_hash is null or job.id is null or nullif(p_bridge_job_id,'') is null then raise exception 'Reporte no autorizado para esta estacion' using errcode='42501'; end if;
  perform badge_private.report_transport(job.id,p_status,p_bridge_job_id,p_payload_hash,p_error_message,credential.issued_by);
end $$;

drop function if exists public.record_accreditation_service(text,uuid,text,integer,text,text);
create or replace function public.record_accreditation_service(p_record_type text,p_record_id uuid,p_outcome text,p_duration_ms integer,p_failure_reason text default null,p_device_label text default null,p_event_id uuid default null,p_job_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; org uuid; result uuid; job public.badge_print_jobs;
begin
  target:=badge_private.operation_event(p_record_type,p_record_id,p_event_id);
  if p_outcome not in ('delivered','failed','cancelled') then raise exception 'Resultado invalido'; end if;
  select e.organization_id into org from public.events e where e.id=target;
  -- Older clients omit the job id; bind them to an already-delivered job, never
  -- create a free-standing delivery or count the atomic session twice.
  if p_outcome='delivered' and p_job_id is null then
    select j.id into p_job_id from public.badge_print_jobs j where j.event_id=target and j.status='delivered'
      and (j.registration_id=p_record_id or j.participation_id=p_record_id) order by j.delivered_at desc,j.id limit 1;
    if p_job_id is null then raise exception 'La entrega requiere un trabajo impreso'; end if;
  end if;
  if p_job_id is not null then
    select * into job from public.badge_print_jobs j where j.id=p_job_id and j.event_id=target and (j.registration_id=p_record_id or j.participation_id=p_record_id);
    if job.id is null or job.status<>p_outcome then raise exception 'La atencion no coincide con el trabajo'; end if;
  end if;
  insert into public.accreditation_service_sessions(organization_id,event_id,registration_id,participation_id,outcome,duration_ms,failure_reason,operator_id,device_label,print_job_id)
  values(org,target,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,p_outcome,greatest(coalesce(p_duration_ms,0),0),p_failure_reason,auth.uid(),left(p_device_label,120),p_job_id)
  on conflict(print_job_id,outcome) where print_job_id is not null do update set duration_ms=excluded.duration_ms returning id into result;
  return result;
end $$;

revoke all on function public.confirm_event_badge(text,uuid,uuid),public.update_event_badge_identity(text,uuid,text,text,text,text,text,uuid),public.cancel_event_badge(text,uuid,text,text,uuid),public.record_accreditation_service(text,uuid,text,integer,text,text,uuid,uuid),public.assign_badge_print_job_station(uuid,uuid),public.get_badge_print_pending_jobs(uuid,uuid,integer),public.register_badge_print_station_sync(uuid,uuid) from public,anon;
grant execute on function public.confirm_event_badge(text,uuid,uuid),public.update_event_badge_identity(text,uuid,text,text,text,text,text,uuid),public.cancel_event_badge(text,uuid,text,text,uuid),public.record_accreditation_service(text,uuid,text,integer,text,text,uuid,uuid),public.assign_badge_print_job_station(uuid,uuid),public.get_badge_print_pending_jobs(uuid,uuid,integer),public.register_badge_print_station_sync(uuid,uuid) to authenticated;
revoke all on function public.sync_badge_print_job(text,uuid,text,text,text,text) from public;
grant execute on function public.sync_badge_print_job(text,uuid,text,text,text,text) to anon,authenticated;
revoke all on function public.acknowledge_badge_print_job(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.acknowledge_badge_print_job(uuid,uuid,text,text,text,text) to authenticated;
revoke all on function public.get_event_badge_for_print(uuid,text) from public,anon;
grant execute on function public.get_event_badge_for_print(uuid,text) to authenticated;
revoke all on function public.prepare_badge_print_job(uuid,text,uuid,uuid,text,text,text,integer,jsonb),public.create_badge_print_job(uuid,text,uuid,uuid,text,text,text),public.create_badge_print_batch(uuid,text,jsonb,text,text,jsonb,boolean,jsonb),public.update_badge_print_job(uuid,text,text,text,text),public.manage_badge_print_job(uuid,text,text),public.create_walk_in_badge(uuid,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.prepare_badge_print_job(uuid,text,uuid,uuid,text,text,text,integer,jsonb),public.create_badge_print_job(uuid,text,uuid,uuid,text,text,text),public.create_badge_print_batch(uuid,text,jsonb,text,text,jsonb,boolean,jsonb),public.update_badge_print_job(uuid,text,text,text,text),public.manage_badge_print_job(uuid,text,text),public.create_walk_in_badge(uuid,text,text,text,text,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
