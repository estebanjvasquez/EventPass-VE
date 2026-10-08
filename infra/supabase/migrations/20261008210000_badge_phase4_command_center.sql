-- Fase 4: centro de control operativo, telemetria de estaciones y exportacion auditable.

create table if not exists public.badge_print_stations(
  station_key uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  station_label text not null,
  bridge_state text not null check(bridge_state in ('connected','offline','unknown')),
  bridge_version text,
  printer_name text,
  local_queue integer not null default 0,
  printer_count integer not null default 0,
  offline_printer_count integer not null default 0,
  operator_id uuid references auth.users(id) on delete set null,
  operator_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(event_id,station_key)
);
create index if not exists idx_badge_print_stations_event_seen on public.badge_print_stations(event_id,last_seen_at desc);
alter table public.badge_print_stations enable row level security;
drop policy if exists badge_print_stations_member_read on public.badge_print_stations;
create policy badge_print_stations_member_read on public.badge_print_stations for select to authenticated
using(public.is_org_member(organization_id) or public.is_platform_admin());
grant select on public.badge_print_stations to authenticated;

create or replace function public.report_badge_print_station(
  p_event_id uuid,p_station_key uuid,p_station_label text,p_bridge_state text,
  p_bridge_version text default null,p_printer_name text default null,p_local_queue integer default 0,
  p_printer_count integer default 0,p_offline_printer_count integer default 0
) returns void language plpgsql security definer set search_path='' as $$
declare org_id uuid; operator_name text;
begin
  select event.organization_id into org_id from public.events event where event.id=p_event_id;
  if org_id is null or not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_bridge_state not in ('connected','offline','unknown') then raise exception 'Estado de bridge invalido'; end if;
  if p_station_key is null or nullif(btrim(p_station_label),'') is null then raise exception 'Identifica la estacion'; end if;
  select coalesce(nullif(btrim(account.raw_user_meta_data->>'display_name'),''),nullif(btrim(account.raw_user_meta_data->>'full_name'),''),account.email::text)
    into operator_name from auth.users account where account.id=auth.uid();
  insert into public.badge_print_stations(station_key,organization_id,event_id,station_label,bridge_state,bridge_version,printer_name,local_queue,printer_count,offline_printer_count,operator_id,operator_name,last_seen_at)
  values(p_station_key,org_id,p_event_id,left(btrim(p_station_label),120),p_bridge_state,left(nullif(p_bridge_version,''),40),left(nullif(p_printer_name,''),240),greatest(coalesce(p_local_queue,0),0),greatest(coalesce(p_printer_count,0),0),greatest(coalesce(p_offline_printer_count,0),0),auth.uid(),operator_name,now())
  on conflict(event_id,station_key) do update set station_label=excluded.station_label,bridge_state=excluded.bridge_state,bridge_version=excluded.bridge_version,printer_name=excluded.printer_name,local_queue=excluded.local_queue,printer_count=excluded.printer_count,offline_printer_count=excluded.offline_printer_count,operator_id=excluded.operator_id,operator_name=excluded.operator_name,last_seen_at=now();
end $$;

create or replace function public.get_badge_operations_dashboard(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.events event where event.id=p_event_id and (public.has_event_staff_scope(event.id,null,'badges.print') or public.is_platform_admin())) then raise exception 'No autorizado' using errcode='42501'; end if;
  with ready_people as(
    select registration.participation_type from public.registrations registration where registration.event_id=p_event_id and registration.status='confirmed' and registration.badge_cancelled_at is null
    union all
    select participation.participation_type from public.event_participations participation where participation.status='approved' and participation.badge_cancelled_at is null and (
      participation.event_id=p_event_id or exists(
        select 1 from public.program_registration_orders orders join public.program_registration_order_items item on item.order_id=orders.id
        join public.program_registration_entitlements entitlement on entitlement.item_id=item.item_id
        left join public.event_sessions session on session.id=entitlement.session_id left join public.event_zones zone on zone.id=entitlement.zone_id
        where orders.participation_id=participation.id and orders.status='confirmed' and coalesce(entitlement.event_id,session.event_id,zone.event_id)=p_event_id
      )
    )
  ), job_base as(
    select job.*,coalesce(registration.participation_type,participation.participation_type,'unknown') participant_type
    from public.badge_print_jobs job left join public.registrations registration on registration.id=job.registration_id
    left join public.event_participations participation on participation.id=job.participation_id where job.event_id=p_event_id
  ), hours as(
    select generate_series(date_trunc('hour',now())-interval '11 hours',date_trunc('hour',now()),interval '1 hour') as hour_bucket
  ), hourly as(
    select hours.hour_bucket,count(job.id)::integer total,count(job.id) filter(where job.status in ('spooled','delivered'))::integer printed,
      count(job.id) filter(where job.status='failed')::integer failed
    from hours left join job_base job on date_trunc('hour',job.queued_at)=hours.hour_bucket group by hours.hour_bucket order by hours.hour_bucket
  ), by_type as(
    select job.participant_type label,count(*)::integer total,count(*) filter(where job.status in ('spooled','delivered'))::integer printed
    from job_base job group by job.participant_type order by count(*) desc
  ), by_station as(
    select job.station_label label,count(*)::integer total,count(*) filter(where job.status in ('spooled','delivered'))::integer printed,count(*) filter(where job.status='failed')::integer failed
    from job_base job group by job.station_label order by count(*) desc
  ), totals as(
    select count(*)::integer total,count(*) filter(where status in ('queued','rendering','sent'))::integer pending,
      count(*) filter(where status in ('spooled','delivered'))::integer printed,count(*) filter(where status='failed')::integer failed,
      count(*) filter(where print_kind='reprint' and status in ('spooled','delivered'))::integer reprints,
      count(*) filter(where fulfillment_mode='preprint' and status in ('spooled','delivered'))::integer preprinted,
      coalesce(round(avg(extract(epoch from (coalesce(spooled_at,failed_at)-queued_at))) filter(where coalesce(spooled_at,failed_at) is not null)::numeric,1),0) average_seconds
    from job_base
  )
  select jsonb_build_object(
    'summary',jsonb_build_object('ready', (select count(*) from ready_people),'total_jobs',totals.total,'pending',totals.pending,'printed',totals.printed,'failed',totals.failed,'reprints',totals.reprints,'preprinted',totals.preprinted,'average_seconds',totals.average_seconds,'failure_rate',case when totals.total=0 then 0 else round(totals.failed::numeric*100/totals.total,1) end),
    'hourly',(select coalesce(jsonb_agg(jsonb_build_object('hour',to_char(hour_bucket,'HH24:00'),'total',total,'printed',printed,'failed',failed)),'[]'::jsonb) from hourly),
    'by_type',(select coalesce(jsonb_agg(jsonb_build_object('label',label,'total',total,'printed',printed)),'[]'::jsonb) from by_type),
    'by_station',(select coalesce(jsonb_agg(jsonb_build_object('label',label,'total',total,'printed',printed,'failed',failed)),'[]'::jsonb) from by_station),
    'stations',(select coalesce(jsonb_agg(jsonb_build_object('station_key',station.station_key,'label',station.station_label,'state',station.bridge_state,'version',station.bridge_version,'printer',station.printer_name,'queue',station.local_queue,'printer_count',station.printer_count,'offline_printers',station.offline_printer_count,'operator',station.operator_name,'last_seen_at',station.last_seen_at) order by station.last_seen_at desc),'[]'::jsonb) from public.badge_print_stations station where station.event_id=p_event_id),
    'readiness',jsonb_build_object('participant_types',(select count(distinct participation_type) from ready_people),'published_templates',(select count(distinct template.participation_type) from public.badge_templates template where template.event_id=p_event_id and template.active and template.template_status='published'),'open_batches',(select count(*) from public.badge_print_batches batch where batch.event_id=p_event_id and batch.status in ('preparing','queued','processing')))
  ) into result from totals;
  return result;
end $$;

create or replace function public.get_badge_operations_export(p_event_id uuid)
returns table(job_id uuid,participant_name text,participation_type text,batch_name text,print_kind text,fulfillment_mode text,status text,station_label text,printer_name text,operator_name text,queued_at timestamptz,spooled_at timestamptz,delivered_at timestamptz,error_message text)
language sql stable security definer set search_path='' as $$
  select job.id,trim(coalesce(registration.first_name,person.first_name,'')||' '||coalesce(registration.last_name,person.last_name,'')),
    coalesce(registration.participation_type,participation.participation_type,'unknown'),batch.name,job.print_kind,job.fulfillment_mode,job.status,
    job.station_label,job.printer_name,job.requested_by_name,job.queued_at,job.spooled_at,job.delivered_at,job.error_message
  from public.badge_print_jobs job left join public.registrations registration on registration.id=job.registration_id
  left join public.event_participations participation on participation.id=job.participation_id left join public.people person on person.id=participation.person_id
  left join public.badge_print_batches batch on batch.id=job.batch_id
  where job.event_id=p_event_id and exists(select 1 from public.events event where event.id=p_event_id and (public.has_event_staff_scope(event.id,null,'badges.print') or public.is_platform_admin()))
  order by job.queued_at desc limit 10000;
$$;

revoke all on function public.report_badge_print_station(uuid,uuid,text,text,text,text,integer,integer,integer),public.get_badge_operations_dashboard(uuid),public.get_badge_operations_export(uuid) from public,anon;
grant execute on function public.report_badge_print_station(uuid,uuid,text,text,text,text,integer,integer,integer),public.get_badge_operations_dashboard(uuid),public.get_badge_operations_export(uuid) to authenticated;
notify pgrst,'reload schema';
