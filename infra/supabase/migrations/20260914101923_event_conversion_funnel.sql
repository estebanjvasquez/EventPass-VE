-- Fases 2 y 3: métricas operativas y embudo de conversión por evento.
-- El tráfico público se registra exclusivamente mediante una RPC validada.

create table if not exists public.event_conversion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_kind text not null check (event_kind in ('landing_view','cta_registration','registration_started','registration_completed')),
  campaign text,
  source text,
  medium text,
  referrer_host text,
  created_at timestamptz not null default now()
);

create index if not exists event_conversion_events_event_time_idx
  on public.event_conversion_events(event_id, created_at desc);
create index if not exists event_conversion_events_event_kind_idx
  on public.event_conversion_events(event_id, event_kind, created_at desc);

alter table public.event_conversion_events enable row level security;
revoke all on public.event_conversion_events from anon, authenticated;
grant select on public.event_conversion_events to authenticated;

drop policy if exists event_conversion_events_member_read on public.event_conversion_events;
create policy event_conversion_events_member_read
on public.event_conversion_events for select to authenticated
using (public.is_org_member(organization_id) or public.is_platform_admin());

create or replace function public.track_event_conversion(
  p_event_id uuid,
  p_event_kind text,
  p_campaign text default null,
  p_source text default null,
  p_medium text default null,
  p_referrer_host text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  if p_event_kind not in ('landing_view','cta_registration','registration_started','registration_completed') then
    raise exception 'Evento de conversión no válido' using errcode = 'check_violation';
  end if;
  select organization_id into v_org from public.events where id = p_event_id and status = 'published';
  if v_org is null then
    raise exception 'Evento no disponible' using errcode = 'check_violation';
  end if;
  insert into public.event_conversion_events(organization_id,event_id,event_kind,campaign,source,medium,referrer_host)
  values (
    v_org, p_event_id, p_event_kind,
    nullif(left(trim(coalesce(p_campaign,'')),100),''),
    nullif(left(trim(coalesce(p_source,'')),100),''),
    nullif(left(trim(coalesce(p_medium,'')),100),''),
    nullif(left(trim(coalesce(p_referrer_host,'')),255),'')
  );
end;
$$;

revoke all on function public.track_event_conversion(uuid,text,text,text,text,text) from public;
grant execute on function public.track_event_conversion(uuid,text,text,text,text,text) to anon, authenticated;

create or replace function public.get_event_growth_metrics(p_event_id uuid)
returns table(
  total_registrations bigint,
  pending_payments bigint,
  confirmed_registrations bigint,
  attended_registrations bigint,
  landing_views bigint,
  registration_starts bigint,
  registration_completions bigint,
  exhibitor_profiles_pending bigint,
  stands_unassigned bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.events e
    where e.id = p_event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())
  ) then raise exception 'No autorizado para este evento' using errcode = '42501'; end if;

  return query select
    (select count(*) from public.registrations r where r.event_id=p_event_id),
    (select count(*) from public.registrations r where r.event_id=p_event_id and r.status='pending_payment'),
    (select count(*) from public.registrations r where r.event_id=p_event_id and r.status='confirmed'),
    (select count(*) from public.registrations r where r.event_id=p_event_id and r.attendance_status='attended'),
    (select count(*) from public.event_conversion_events c where c.event_id=p_event_id and c.event_kind='landing_view'),
    (select count(*) from public.event_conversion_events c where c.event_id=p_event_id and c.event_kind='registration_started'),
    (select count(*) from public.event_conversion_events c where c.event_id=p_event_id and c.event_kind='registration_completed'),
    (select count(*) from public.companies c where c.event_id=p_event_id and c.kind='exhibitor' and coalesce(c.public_profile_status,'draft') <> 'approved'),
    (select count(*) from public.venue_map_elements element join public.venue_maps map on map.id=element.map_id where map.event_id=p_event_id and element.element_type='stand' and not exists(select 1 from public.booth_assignments assignment where assignment.element_id=element.id and assignment.status <> 'cancelled'));
end;
$$;

revoke all on function public.get_event_growth_metrics(uuid) from public, anon;
grant execute on function public.get_event_growth_metrics(uuid) to authenticated;

-- Conserva compatibilidad del registro público y permite atribuir la conversión
-- sin almacenar identificadores de visitante ni datos personales adicionales.
drop function if exists public.register_event_participant(uuid,text,text,text,text,text,uuid);
create or replace function public.register_event_participant(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_cedula text default null,
  p_seat_id uuid default null,
  p_campaign text default null,
  p_source text default null,
  p_medium text default null
) returns table(registration_id uuid, registration_status public.registration_status, credential_token text, payment_required boolean)
language plpgsql security definer set search_path = '' as $$
declare v_event public.events; v_mode text; v_seat_mode text; v_taken integer; v_seat_status public.seat_status; v_registration public.registrations;
begin
  select * into v_event from public.events where id=p_event_id for update;
  if not found or v_event.status <> 'published' then raise exception 'Evento no disponible' using errcode='check_violation'; end if;
  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then raise exception 'El período de registro finalizó' using errcode='check_violation'; end if;
  if length(trim(coalesce(p_first_name,''))) < 2 or position('@' in trim(coalesce(p_email,''))) < 2 then raise exception 'Datos de registro no válidos' using errcode='check_violation'; end if;
  v_mode:=coalesce(v_event.config->>'registration_mode','paid');
  if v_mode='invitation' then raise exception 'Este evento solo admite registros por invitación' using errcode='insufficient_privilege'; end if;
  if exists(select 1 from public.registrations r where r.event_id=p_event_id and lower(r.email)=lower(trim(p_email)) and r.status <> 'rejected') then raise exception 'Ya existe un registro con ese correo para este evento' using errcode='unique_violation'; end if;
  if coalesce(v_event.total_slots,0)>0 then select count(*) into v_taken from public.registrations r where r.event_id=p_event_id and r.status <> 'rejected'; if v_taken>=v_event.total_slots then raise exception 'Este evento alcanzó su capacidad' using errcode='check_violation'; end if; end if;
  v_seat_mode:=coalesce(v_event.config->>'seat_assignment_mode','admin');
  if p_seat_id is not null then
    if coalesce((v_event.config->>'public_seat_selection_enabled')::boolean,false) is not true or v_seat_mode <> 'attendee' then raise exception 'La selección pública de puestos no está habilitada' using errcode='insufficient_privilege'; end if;
    select s.status into v_seat_status from public.seats s where s.id=p_seat_id and s.event_id=p_event_id for update;
    if not found or v_seat_status <> 'available' then raise exception 'El puesto ya no está disponible' using errcode='check_violation'; end if;
  end if;
  insert into public.registrations(organization_id,event_id,first_name,last_name,email,phone,cedula,seat_id,status,payment_deadline,payment_confirmed_at)
  values(v_event.organization_id,p_event_id,trim(p_first_name),nullif(trim(p_last_name),''),lower(trim(p_email)),nullif(trim(p_phone),''),nullif(trim(p_cedula),''),p_seat_id,case when v_mode='free' then 'confirmed'::public.registration_status else 'pending_payment'::public.registration_status end,case when v_mode='paid' then now()+make_interval(days=>v_event.payment_timeout_days) else null end,case when v_mode='free' then now() else null end) returning * into v_registration;
  if p_seat_id is not null then update public.seats set status=case when v_mode='free' then 'confirmed'::public.seat_status else 'reserved'::public.seat_status end where id=p_seat_id; end if;
  insert into public.event_conversion_events(organization_id,event_id,event_kind,campaign,source,medium) values(v_event.organization_id,p_event_id,'registration_completed',nullif(left(trim(coalesce(p_campaign,'')),100),''),nullif(left(trim(coalesce(p_source,'')),100),''),nullif(left(trim(coalesce(p_medium,'')),100),''));
  return query select v_registration.id,v_registration.status,v_registration.credential_token,v_mode='paid';
end; $$;

revoke all on function public.register_event_participant(uuid,text,text,text,text,text,uuid,text,text,text) from public;
grant execute on function public.register_event_participant(uuid,text,text,text,text,text,uuid,text,text,text) to anon, authenticated;
