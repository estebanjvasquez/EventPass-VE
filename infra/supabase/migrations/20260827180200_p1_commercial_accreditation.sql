-- P1 comercial: diseñador de credenciales, mostrador, walk-ins y métricas.
alter table public.registrations
  add column if not exists company text,
  add column if not exists job_title text,
  add column if not exists participation_type text not null default 'attendee',
  add column if not exists registration_source text not null default 'public',
  add column if not exists badge_cancelled_at timestamptz,
  add column if not exists badge_cancelled_reason text;

alter table public.event_participations
  add column if not exists badge_cancelled_at timestamptz,
  add column if not exists badge_cancelled_reason text;

alter table public.badge_print_logs drop constraint if exists badge_print_logs_print_kind_check;
alter table public.badge_print_logs add constraint badge_print_logs_print_kind_check
  check (print_kind in ('initial','reprint','cancelled'));

create table if not exists public.badge_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  participation_type text not null,
  name text not null,
  size_key text not null default 'etiqueta' check (size_key in ('etiqueta','credencial','a6','media_carta')),
  primary_color text not null default '#047857',
  background_color text not null default '#ffffff',
  text_color text not null default '#18181b',
  header_text text,
  footer_text text,
  show_company boolean not null default true,
  show_job_title boolean not null default true,
  show_identification boolean not null default false,
  show_qr boolean not null default true,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(event_id, participation_type)
);

create table if not exists public.badge_identity_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  participation_id uuid references public.event_participations(id) on delete set null,
  previous_data jsonb not null,
  new_data jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((registration_id is not null) <> (participation_id is not null))
);

create table if not exists public.accreditation_service_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  participation_id uuid references public.event_participations(id) on delete set null,
  outcome text not null check (outcome in ('delivered','failed','cancelled')),
  duration_ms integer not null check (duration_ms >= 0),
  failure_reason text,
  operator_id uuid references auth.users(id) on delete set null,
  device_label text,
  created_at timestamptz not null default now(),
  check ((registration_id is not null) <> (participation_id is not null))
);

create index if not exists idx_badge_templates_event_type on public.badge_templates(event_id, participation_type);
create index if not exists idx_badge_identity_audit_event on public.badge_identity_audit(event_id, created_at desc);
create index if not exists idx_accreditation_sessions_event on public.accreditation_service_sessions(event_id, created_at desc);

alter table public.badge_templates enable row level security;
alter table public.badge_identity_audit enable row level security;
alter table public.accreditation_service_sessions enable row level security;

drop policy if exists badge_templates_member_all on public.badge_templates;
create policy badge_templates_member_all on public.badge_templates for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists badge_identity_audit_member_read on public.badge_identity_audit;
create policy badge_identity_audit_member_read on public.badge_identity_audit for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists accreditation_sessions_member_read on public.accreditation_service_sessions;
create policy accreditation_sessions_member_read on public.accreditation_service_sessions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

grant select, insert, update, delete on public.badge_templates to authenticated;
grant select on public.badge_identity_audit, public.accreditation_service_sessions to authenticated;

drop function if exists public.search_event_badges(uuid,text);
create or replace function public.search_event_badges(p_event_id uuid, p_query text)
returns table(id uuid, record_type text, first_name text, last_name text, cedula text, company text, job_title text, participation_type text, status text, attendance_status text, credential_token text, seat_label text, badge_cancelled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_term text;
begin
  select organization_id into v_org from public.events where events.id=p_event_id;
  if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  v_term := '%' || replace(replace(trim(coalesce(p_query,'')),'%',''),'_','') || '%';
  return query
  select r.id,'registration'::text,r.first_name,r.last_name,r.cedula,r.company,r.job_title,r.participation_type,r.status::text,r.attendance_status::text,r.credential_token,
    coalesce(s.seat_number,nullif(concat_ws('',s.row_label,s.column_number::text),'')),r.badge_cancelled_at
  from public.registrations r left join public.seats s on s.id=r.seat_id
  where r.event_id=p_event_id and (r.first_name ilike v_term or coalesce(r.last_name,'') ilike v_term or coalesce(r.cedula,'') ilike v_term or r.email ilike v_term or coalesce(r.company,'') ilike v_term)
  union all
  select ep.id,'participation'::text,pe.first_name,pe.last_name,pe.cedula,pe.company,pe.job_title,ep.participation_type,ep.status,
    case when exists(select 1 from public.checkin_records cr where cr.participation_id=ep.id and cr.result in ('allowed','validated')) then 'checked_in' else 'no_attendance' end,
    ep.credential_token,null::text,ep.badge_cancelled_at
  from public.event_participations ep join public.people pe on pe.id=ep.person_id
  where ep.event_id=p_event_id and (pe.first_name ilike v_term or coalesce(pe.last_name,'') ilike v_term or coalesce(pe.cedula,'') ilike v_term or coalesce(pe.email,'') ilike v_term or coalesce(pe.company,'') ilike v_term)
  order by first_name,last_name limit 30;
end $$;

drop function if exists public.get_event_badge_by_token(text);
create or replace function public.get_event_badge_by_token(p_token text)
returns table(id uuid, record_type text, first_name text, last_name text, cedula text, company text, job_title text, participation_type text, status text, attendance_status text, credential_token text, seat_label text, badge_cancelled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select x.organization_id into v_org from (
    select r.organization_id from public.registrations r where r.credential_token=trim(p_token)
    union all
    select pr.organization_id from public.event_participations ep join public.event_programs pr on pr.id=ep.program_id where ep.credential_token=trim(p_token)
  ) x limit 1;
  if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  return query
  select r.id,'registration'::text,r.first_name,r.last_name,r.cedula,r.company,r.job_title,r.participation_type,r.status::text,r.attendance_status::text,r.credential_token,
    coalesce(s.seat_number,nullif(concat_ws('',s.row_label,s.column_number::text),'')),r.badge_cancelled_at
  from public.registrations r left join public.seats s on s.id=r.seat_id where r.credential_token=trim(p_token)
  union all
  select ep.id,'participation'::text,pe.first_name,pe.last_name,pe.cedula,pe.company,pe.job_title,ep.participation_type,ep.status,
    case when exists(select 1 from public.checkin_records cr where cr.participation_id=ep.id and cr.result in ('allowed','validated')) then 'checked_in' else 'no_attendance' end,
    ep.credential_token,null::text,ep.badge_cancelled_at
  from public.event_participations ep join public.people pe on pe.id=ep.person_id where ep.credential_token=trim(p_token)
  limit 1;
end $$;

create or replace function public.create_walk_in_badge(p_event_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_cedula text, p_company text, p_job_title text, p_participation_type text default 'attendee')
returns table(id uuid, credential_token text)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_row public.registrations; v_email text;
begin
  select organization_id into v_org from public.events where events.id=p_event_id;
  if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if nullif(trim(p_first_name),'') is null then raise exception 'El nombre es obligatorio' using errcode='22023'; end if;
  v_email := coalesce(nullif(lower(trim(p_email)),''), 'walkin+' || gen_random_uuid()::text || '@invalid.eventosfacil.local');
  insert into public.registrations(organization_id,event_id,first_name,last_name,email,phone,cedula,company,job_title,participation_type,registration_source,status,payment_confirmed_at)
  values(v_org,p_event_id,trim(p_first_name),nullif(trim(p_last_name),''),v_email,nullif(trim(p_phone),''),nullif(trim(p_cedula),''),nullif(trim(p_company),''),nullif(trim(p_job_title),''),coalesce(nullif(trim(p_participation_type),''),'attendee'),'walk_in','confirmed',now())
  returning * into v_row;
  return query select v_row.id,v_row.credential_token;
end $$;

create or replace function public.update_event_badge_identity(p_record_type text, p_record_id uuid, p_first_name text, p_last_name text, p_cedula text, p_company text, p_job_title text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_event uuid; v_person uuid; v_old jsonb; v_new jsonb;
begin
  if p_record_type='registration' then
    select organization_id,event_id,jsonb_build_object('first_name',first_name,'last_name',last_name,'cedula',cedula,'company',company,'job_title',job_title) into v_org,v_event,v_old from public.registrations where id=p_record_id for update;
    if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
    update public.registrations set first_name=trim(p_first_name),last_name=nullif(trim(p_last_name),''),cedula=nullif(trim(p_cedula),''),company=nullif(trim(p_company),''),job_title=nullif(trim(p_job_title),''),updated_at=now() where id=p_record_id;
  elsif p_record_type='participation' then
    select pr.organization_id,ep.event_id,ep.person_id,jsonb_build_object('first_name',pe.first_name,'last_name',pe.last_name,'cedula',pe.cedula,'company',pe.company,'job_title',pe.job_title) into v_org,v_event,v_person,v_old from public.event_participations ep join public.event_programs pr on pr.id=ep.program_id join public.people pe on pe.id=ep.person_id where ep.id=p_record_id for update of ep,pe;
    if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
    update public.people set first_name=trim(p_first_name),last_name=nullif(trim(p_last_name),''),cedula=nullif(trim(p_cedula),''),company=nullif(trim(p_company),''),job_title=nullif(trim(p_job_title),''),updated_at=now() where id=v_person;
  else raise exception 'Tipo de registro inválido' using errcode='22023'; end if;
  if nullif(trim(p_first_name),'') is null then raise exception 'El nombre es obligatorio' using errcode='22023'; end if;
  v_new:=jsonb_build_object('first_name',trim(p_first_name),'last_name',nullif(trim(p_last_name),''),'cedula',nullif(trim(p_cedula),''),'company',nullif(trim(p_company),''),'job_title',nullif(trim(p_job_title),''));
  insert into public.badge_identity_audit(organization_id,event_id,registration_id,participation_id,previous_data,new_data,changed_by) values(v_org,v_event,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,v_old,v_new,auth.uid());
end $$;

create or replace function public.confirm_event_badge(p_record_type text, p_record_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if p_record_type='registration' then select organization_id into v_org from public.registrations where id=p_record_id; if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if; update public.registrations set status='confirmed',payment_confirmed_at=coalesce(payment_confirmed_at,now()),updated_at=now() where id=p_record_id and badge_cancelled_at is null;
  elsif p_record_type='participation' then select pr.organization_id into v_org from public.event_participations ep join public.event_programs pr on pr.id=ep.program_id where ep.id=p_record_id; if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if; update public.event_participations set status='approved' where id=p_record_id and badge_cancelled_at is null;
  else raise exception 'Tipo de registro inválido' using errcode='22023'; end if;
end $$;

create or replace function public.cancel_event_badge(p_record_type text, p_record_id uuid, p_reason text, p_device_label text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_event uuid;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'La cancelación requiere un motivo' using errcode='22023'; end if;
  if p_record_type='registration' then select organization_id,event_id into v_org,v_event from public.registrations where id=p_record_id; if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if; update public.registrations set badge_cancelled_at=now(),badge_cancelled_reason=trim(p_reason),updated_at=now() where id=p_record_id;
  elsif p_record_type='participation' then select pr.organization_id,ep.event_id into v_org,v_event from public.event_participations ep join public.event_programs pr on pr.id=ep.program_id where ep.id=p_record_id; if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if; update public.event_participations set badge_cancelled_at=now(),badge_cancelled_reason=trim(p_reason) where id=p_record_id;
  else raise exception 'Tipo de registro inválido' using errcode='22023'; end if;
  insert into public.badge_print_logs(organization_id,event_id,registration_id,participation_id,print_kind,reason,printed_by,device_label) values(v_org,v_event,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,'cancelled',trim(p_reason),auth.uid(),left(p_device_label,120));
end $$;

create or replace function public.record_accreditation_service(p_record_type text, p_record_id uuid, p_outcome text, p_duration_ms integer, p_failure_reason text default null, p_device_label text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_event uuid; v_id uuid;
begin
  if p_outcome not in ('delivered','failed','cancelled') then raise exception 'Resultado inválido' using errcode='22023'; end if;
  if p_record_type='registration' then select organization_id,event_id into v_org,v_event from public.registrations where id=p_record_id;
  elsif p_record_type='participation' then select pr.organization_id,ep.event_id into v_org,v_event from public.event_participations ep join public.event_programs pr on pr.id=ep.program_id where ep.id=p_record_id;
  else raise exception 'Tipo de registro inválido' using errcode='22023'; end if;
  if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  insert into public.accreditation_service_sessions(organization_id,event_id,registration_id,participation_id,outcome,duration_ms,failure_reason,operator_id,device_label) values(v_org,v_event,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,p_outcome,greatest(coalesce(p_duration_ms,0),0),nullif(trim(p_failure_reason),''),auth.uid(),left(p_device_label,120)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_accreditation_metrics(p_event_id uuid)
returns table(initial_prints bigint,reprints bigint,cancellations bigint,walk_ins bigint,delivered bigint,failures bigint,average_service_seconds numeric)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.events where id=p_event_id;
  if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  return query select
    count(*) filter(where l.print_kind='initial'),count(*) filter(where l.print_kind='reprint'),count(*) filter(where l.print_kind='cancelled'),
    (select count(*) from public.registrations r where r.event_id=p_event_id and r.registration_source='walk_in' and r.created_at>=date_trunc('day',now())),
    (select count(*) from public.accreditation_service_sessions s where s.event_id=p_event_id and s.outcome='delivered' and s.created_at>=date_trunc('day',now())),
    (select count(*) from public.accreditation_service_sessions s where s.event_id=p_event_id and s.outcome='failed' and s.created_at>=date_trunc('day',now())),
    (select round(avg(s.duration_ms)/1000.0,1) from public.accreditation_service_sessions s where s.event_id=p_event_id and s.outcome='delivered' and s.created_at>=date_trunc('day',now()))
  from public.badge_print_logs l where l.event_id=p_event_id and l.created_at>=date_trunc('day',now());
end $$;

revoke all on function public.search_event_badges(uuid,text) from public,anon;
revoke all on function public.get_event_badge_by_token(text) from public,anon;
revoke all on function public.create_walk_in_badge(uuid,text,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.update_event_badge_identity(text,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.confirm_event_badge(text,uuid) from public,anon;
revoke all on function public.cancel_event_badge(text,uuid,text,text) from public,anon;
revoke all on function public.record_accreditation_service(text,uuid,text,integer,text,text) from public,anon;
revoke all on function public.get_accreditation_metrics(uuid) from public,anon;
grant execute on function public.search_event_badges(uuid,text),public.get_event_badge_by_token(text),public.create_walk_in_badge(uuid,text,text,text,text,text,text,text,text),public.update_event_badge_identity(text,uuid,text,text,text,text,text),public.confirm_event_badge(text,uuid),public.cancel_event_badge(text,uuid,text,text),public.record_accreditation_service(text,uuid,text,integer,text,text),public.get_accreditation_metrics(uuid) to authenticated;
