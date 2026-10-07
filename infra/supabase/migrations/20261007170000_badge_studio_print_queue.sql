-- Badge Studio, cola auditable y estaciones de impresion locales.

alter table public.badge_templates
  add column if not exists width_mm numeric(7,2),
  add column if not exists height_mm numeric(7,2),
  add column if not exists dpi integer not null default 300,
  add column if not exists double_sided boolean not null default false,
  add column if not exists layout jsonb not null default '{"version":1,"elements":[]}'::jsonb,
  add column if not exists back_layout jsonb not null default '{"version":1,"elements":[]}'::jsonb,
  add column if not exists template_status text not null default 'published',
  add column if not exists version integer not null default 1,
  add column if not exists published_at timestamptz default now();

update public.badge_templates set
  width_mm=coalesce(width_mm,case size_key when 'etiqueta' then 100 when 'credencial' then 90 when 'a6' then 105 else 140 end),
  height_mm=coalesce(height_mm,case size_key when 'etiqueta' then 60 when 'credencial' then 130 when 'a6' then 148 else 216 end);

alter table public.badge_templates alter column width_mm set default 100;
alter table public.badge_templates alter column height_mm set default 60;
alter table public.badge_templates alter column width_mm set not null;
alter table public.badge_templates alter column height_mm set not null;
alter table public.badge_templates drop constraint if exists badge_templates_dimensions_check;
alter table public.badge_templates add constraint badge_templates_dimensions_check
  check(width_mm between 20 and 400 and height_mm between 20 and 400 and dpi between 150 and 600);
alter table public.badge_templates drop constraint if exists badge_templates_status_check;
alter table public.badge_templates add constraint badge_templates_status_check check(template_status in ('draft','published','archived'));

create table if not exists public.badge_print_jobs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  participation_id uuid references public.event_participations(id) on delete set null,
  template_id uuid references public.badge_templates(id) on delete set null,
  status text not null default 'queued' check(status in ('queued','rendering','sent','spooled','failed','cancelled')),
  print_kind text not null check(print_kind in ('initial','reprint')),
  reason text,
  station_label text not null,
  printer_name text not null,
  bridge_job_id text,
  payload_hash text,
  error_message text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  requested_by_email text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  spooled_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  check((registration_id is not null) <> (participation_id is not null)),
  check(print_kind='initial' or nullif(btrim(reason),'') is not null)
);
create index if not exists idx_badge_print_jobs_event_queue on public.badge_print_jobs(event_id,status,queued_at desc);
create index if not exists idx_badge_print_jobs_station_queue on public.badge_print_jobs(station_label,status,queued_at);

create table if not exists public.badge_print_job_events(
  id bigint generated always as identity primary key,
  job_id uuid not null references public.badge_print_jobs(id) on delete cascade,
  status text not null,
  message text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_badge_print_job_events_job on public.badge_print_job_events(job_id,created_at);

alter table public.badge_print_logs add column if not exists print_job_id uuid references public.badge_print_jobs(id) on delete set null;
create unique index if not exists uq_badge_print_logs_job on public.badge_print_logs(print_job_id) where print_job_id is not null;

alter table public.badge_print_jobs enable row level security;
alter table public.badge_print_job_events enable row level security;
drop policy if exists badge_print_jobs_member_read on public.badge_print_jobs;
create policy badge_print_jobs_member_read on public.badge_print_jobs for select to authenticated
using(public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists badge_print_job_events_member_read on public.badge_print_job_events;
create policy badge_print_job_events_member_read on public.badge_print_job_events for select to authenticated
using(exists(select 1 from public.badge_print_jobs j where j.id=job_id and (public.is_org_member(j.organization_id) or public.is_platform_admin())));
grant select on public.badge_print_jobs,public.badge_print_job_events to authenticated;

create or replace function public.create_badge_print_job(
  p_event_id uuid,p_record_type text,p_record_id uuid,p_template_id uuid,
  p_station_label text,p_printer_name text,p_reason text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_job uuid; v_kind text; v_valid boolean:=false; v_name text; v_email text;
begin
  select e.organization_id into v_org from public.events e where e.id=p_event_id;
  if v_org is null or not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if nullif(btrim(p_station_label),'') is null or nullif(btrim(p_printer_name),'') is null then raise exception 'Selecciona una estacion y una impresora'; end if;
  if p_record_type='registration' then
    select exists(select 1 from public.registrations r where r.id=p_record_id and r.event_id=p_event_id and r.status='confirmed' and r.badge_cancelled_at is null) into v_valid;
  elsif p_record_type='participation' then
    select exists(
      select 1 from public.event_participations ep where ep.id=p_record_id and ep.status='approved' and ep.badge_cancelled_at is null and (
        ep.event_id=p_event_id or exists(
          select 1 from public.program_registration_orders o
          join public.program_registration_order_items oi on oi.order_id=o.id
          join public.program_registration_entitlements en on en.item_id=oi.item_id
          left join public.event_sessions s on s.id=en.session_id
          left join public.event_zones z on z.id=en.zone_id
          where o.participation_id=ep.id and o.status='confirmed' and coalesce(en.event_id,s.event_id,z.event_id)=p_event_id
        )
      )
    ) into v_valid;
  else raise exception 'Tipo de registro invalido'; end if;
  if not v_valid then raise exception 'La credencial no esta confirmada o ya fue cancelada'; end if;
  if p_template_id is not null and not exists(select 1 from public.badge_templates t where t.id=p_template_id and t.event_id=p_event_id and t.active) then raise exception 'Plantilla no disponible'; end if;
  select case when exists(select 1 from public.badge_print_logs l where l.event_id=p_event_id and l.print_kind in ('initial','reprint') and ((p_record_type='registration' and l.registration_id=p_record_id) or (p_record_type='participation' and l.participation_id=p_record_id))) then 'reprint' else 'initial' end into v_kind;
  if v_kind='reprint' and nullif(btrim(p_reason),'') is null then raise exception 'La reimpresion requiere un motivo'; end if;
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),u.email::text into v_name,v_email from auth.users u where u.id=auth.uid();
  insert into public.badge_print_jobs(organization_id,event_id,registration_id,participation_id,template_id,print_kind,reason,station_label,printer_name,requested_by,requested_by_name,requested_by_email)
  values(v_org,p_event_id,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,p_template_id,v_kind,nullif(btrim(p_reason),''),left(btrim(p_station_label),120),left(btrim(p_printer_name),240),auth.uid(),v_name,v_email)
  returning id into v_job;
  insert into public.badge_print_job_events(job_id,status,message,actor_id,actor_name) values(v_job,'queued','Trabajo creado',auth.uid(),v_name);
  return v_job;
end $$;

create or replace function public.update_badge_print_job(
  p_job_id uuid,p_status text,p_bridge_job_id text default null,p_payload_hash text default null,p_error_message text default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_job public.badge_print_jobs; v_name text;
begin
  select * into v_job from public.badge_print_jobs where id=p_job_id for update;
  if v_job.id is null or not(public.has_event_staff_scope(v_job.event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_status not in ('rendering','sent','spooled','failed','cancelled') then raise exception 'Estado de impresion invalido'; end if;
  if v_job.status in ('spooled','cancelled') and p_status<>v_job.status then raise exception 'El trabajo ya fue finalizado'; end if;
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text) into v_name from auth.users u where u.id=auth.uid();
  update public.badge_print_jobs set status=p_status,bridge_job_id=coalesce(nullif(p_bridge_job_id,''),bridge_job_id),payload_hash=coalesce(nullif(p_payload_hash,''),payload_hash),error_message=case when p_status='failed' then left(coalesce(p_error_message,'Fallo de impresion'),1000) else null end,sent_at=case when p_status in ('sent','spooled') then coalesce(sent_at,now()) else sent_at end,spooled_at=case when p_status='spooled' then now() else spooled_at end,failed_at=case when p_status='failed' then now() else failed_at end,updated_at=now() where id=p_job_id;
  insert into public.badge_print_job_events(job_id,status,message,actor_id,actor_name) values(p_job_id,p_status,left(p_error_message,1000),auth.uid(),v_name);
  if p_status='spooled' then
    insert into public.badge_print_logs(organization_id,event_id,registration_id,participation_id,print_kind,reason,printed_by,device_label,print_job_id)
    values(v_job.organization_id,v_job.event_id,v_job.registration_id,v_job.participation_id,v_job.print_kind,v_job.reason,auth.uid(),left(v_job.station_label||' / '||v_job.printer_name,120),v_job.id)
    on conflict(print_job_id) where print_job_id is not null do nothing;
  end if;
end $$;

create or replace function public.get_event_badge_for_print(p_event_id uuid,p_token text)
returns table(id uuid,record_type text,first_name text,last_name text,cedula text,company text,job_title text,participation_type text,status text,attendance_status text,credential_token text,seat_label text,badge_cancelled_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if not exists(
    select 1 from public.registrations r where r.event_id=p_event_id and r.credential_token=trim(p_token)
    union all
    select 1 from public.event_participations ep where ep.credential_token=trim(p_token) and (
      ep.event_id=p_event_id or exists(
        select 1 from public.program_registration_orders o
        join public.program_registration_order_items oi on oi.order_id=o.id
        join public.program_registration_entitlements en on en.item_id=oi.item_id
        left join public.event_sessions s on s.id=en.session_id
        left join public.event_zones z on z.id=en.zone_id
        where o.participation_id=ep.id and o.status='confirmed' and coalesce(en.event_id,s.event_id,z.event_id)=p_event_id
      )
    )
  ) then raise exception 'La credencial no pertenece a este evento'; end if;
  return query select * from public.get_event_badge_by_token(trim(p_token));
end $$;

revoke all on function public.create_badge_print_job(uuid,text,uuid,uuid,text,text,text),public.update_badge_print_job(uuid,text,text,text,text),public.get_event_badge_for_print(uuid,text) from public,anon;
grant execute on function public.create_badge_print_job(uuid,text,uuid,uuid,text,text,text),public.update_badge_print_job(uuid,text,text,text,text),public.get_event_badge_for_print(uuid,text) to authenticated;
notify pgrst,'reload schema';
