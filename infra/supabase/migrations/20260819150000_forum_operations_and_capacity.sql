-- EventPass VE — Fase 5: operación de sesiones y cupo atómico de talleres.

create table if not exists public.session_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  responsibility text not null default 'support' check (responsibility in ('host','moderator','checkin','support')),
  shift_starts_at timestamptz,
  shift_ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  check (shift_ends_at is null or shift_starts_at is null or shift_ends_at > shift_starts_at),
  unique(session_id, user_id, responsibility)
);
create index if not exists idx_session_staff_assignments_session on public.session_staff_assignments(session_id, shift_starts_at);

create table if not exists public.session_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  participation_id uuid references public.event_participations(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','checked_in')),
  reserved_at timestamptz not null default now(),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  check ((participation_id is not null)::int + (registration_id is not null)::int = 1)
);
create unique index if not exists uq_session_reservation_participation on public.session_reservations(session_id, participation_id) where participation_id is not null;
create unique index if not exists uq_session_reservation_registration on public.session_reservations(session_id, registration_id) where registration_id is not null;
create index if not exists idx_session_reservations_capacity on public.session_reservations(session_id, status);

grant select, insert, update, delete on public.session_staff_assignments to authenticated;
grant select, insert, update, delete on public.session_reservations to authenticated;
alter table public.session_staff_assignments enable row level security;
alter table public.session_reservations enable row level security;

drop policy if exists session_staff_member_all on public.session_staff_assignments;
create policy session_staff_member_all on public.session_staff_assignments for all to authenticated
using ((public.is_org_member(organization_id) or public.is_platform_admin()) and exists (
  select 1 from public.event_sessions s where s.id = public.session_staff_assignments.session_id
  and s.event_id = public.session_staff_assignments.event_id and s.organization_id = public.session_staff_assignments.organization_id
)) with check ((public.is_org_member(organization_id) or public.is_platform_admin()) and exists (
  select 1 from public.event_sessions s where s.id = public.session_staff_assignments.session_id
  and s.event_id = public.session_staff_assignments.event_id and s.organization_id = public.session_staff_assignments.organization_id
));

drop policy if exists session_reservation_member_all on public.session_reservations;
create policy session_reservation_member_all on public.session_reservations for all to authenticated
using ((public.is_org_member(organization_id) or public.is_platform_admin()) and exists (
  select 1 from public.event_sessions s where s.id = public.session_reservations.session_id
  and s.event_id = public.session_reservations.event_id and s.organization_id = public.session_reservations.organization_id
)) with check ((public.is_org_member(organization_id) or public.is_platform_admin()) and exists (
  select 1 from public.event_sessions s where s.id = public.session_reservations.session_id
  and s.event_id = public.session_reservations.event_id and s.organization_id = public.session_reservations.organization_id
));

create or replace function public.list_event_staff(p_event_id uuid)
returns table(user_id uuid, email text, role public.member_role)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, u.email::text, m.role
  from public.events e
  join public.memberships m on m.organization_id = e.organization_id
  join auth.users u on u.id = m.user_id
  where e.id = p_event_id
    and (public.is_org_member(e.organization_id) or public.is_platform_admin())
  order by u.email;
$$;
revoke all on function public.list_event_staff(uuid) from public;
grant execute on function public.list_event_staff(uuid) to authenticated;

create or replace function public.reserve_workshop_seat(
  p_session_id uuid,
  p_participation_id uuid default null,
  p_registration_id uuid default null
) returns table(result text, reservation_id uuid, reason text, remaining int)
language plpgsql security definer set search_path = public as $$
declare v_session public.event_sessions; v_taken int; v_existing uuid; v_org uuid;
begin
  if ((p_participation_id is not null)::int + (p_registration_id is not null)::int) <> 1 then
    raise exception 'Indica exactamente un participante o registro' using errcode = '22023';
  end if;
  select * into v_session from public.event_sessions where id = p_session_id for update;
  if v_session is null or not (public.is_org_member(v_session.organization_id) or public.is_platform_admin()) then
    raise exception 'Sesión no disponible' using errcode = '42501';
  end if;
  if v_session.session_type <> 'workshop' or v_session.capacity is null or v_session.capacity < 1 then
    return query select 'denied'::text, null::uuid, 'La sesión no tiene cupo de taller administrable.'::text, null::int; return;
  end if;
  v_org := v_session.organization_id;
  if p_participation_id is not null and not exists (select 1 from public.event_participations ep where ep.id = p_participation_id and ep.event_id = v_session.event_id and ep.status = 'approved') then
    return query select 'denied'::text, null::uuid, 'El participante no está aprobado para este evento.'::text, null::int; return;
  end if;
  if p_registration_id is not null and not exists (select 1 from public.registrations r where r.id = p_registration_id and r.event_id = v_session.event_id and r.organization_id = v_org and r.status = 'confirmed') then
    return query select 'denied'::text, null::uuid, 'El registro no está confirmado para este evento.'::text, null::int; return;
  end if;
  select id into v_existing from public.session_reservations where session_id = p_session_id and ((p_participation_id is not null and participation_id = p_participation_id) or (p_registration_id is not null and registration_id = p_registration_id)) and status in ('confirmed','checked_in') limit 1;
  if v_existing is not null then
    select count(*)::int into v_taken from public.session_reservations where session_id = p_session_id and status in ('confirmed','checked_in');
    return query select 'already_reserved'::text, v_existing, 'La reserva ya estaba confirmada.'::text, greatest(v_session.capacity - v_taken, 0); return;
  end if;
  select count(*)::int into v_taken from public.session_reservations where session_id = p_session_id and status in ('confirmed','checked_in');
  if v_taken >= v_session.capacity then
    return query select 'full'::text, null::uuid, 'El taller alcanzó su cupo.'::text, 0; return;
  end if;
  insert into public.session_reservations(organization_id,event_id,session_id,participation_id,registration_id)
  values(v_org,v_session.event_id,p_session_id,p_participation_id,p_registration_id) returning id into v_existing;
  return query select 'reserved'::text, v_existing, 'Reserva confirmada.'::text, v_session.capacity - v_taken - 1;
end $$;
revoke all on function public.reserve_workshop_seat(uuid, uuid, uuid) from public;
grant execute on function public.reserve_workshop_seat(uuid, uuid, uuid) to authenticated;

create or replace function public.validate_session_checkin(
  p_credential_token text,
  p_access_point_id uuid,
  p_session_id uuid,
  p_device_label text default null
) returns table(result text, participant_name text, reason text, remaining int)
language plpgsql security definer set search_path = public as $$
declare v_point public.access_points; v_session public.event_sessions; v_part public.event_participations; v_person public.people; v_remaining int;
begin
  select * into v_point from public.access_points where id = p_access_point_id;
  select * into v_session from public.event_sessions where id = p_session_id;
  if v_point is null or v_session is null or v_point.event_id <> v_session.event_id then
    raise exception 'Punto de acceso o sesión no disponibles' using errcode = '42501';
  end if;
  if not (public.has_org_role(v_session.organization_id, array['owner','admin']::public.member_role[]) or exists (
    select 1 from public.session_staff_assignments a where a.session_id = p_session_id and a.user_id = auth.uid()
    and a.responsibility in ('host','moderator','checkin')
  )) then raise exception 'No tienes turno operativo para esta sesión' using errcode = '42501'; end if;
  select ep.* into v_part from public.event_participations ep where ep.credential_token = trim(p_credential_token) and ep.event_id = v_session.event_id and ep.status = 'approved' limit 1;
  if v_part is null then return query select 'denied'::text, null::text, 'Código no válido para esta sesión.'::text, null::int; return; end if;
  select * into v_person from public.people where id = v_part.person_id;
  if not exists (select 1 from public.participation_passes pp join public.passes pa on pa.id = pp.pass_id join public.pass_entitlements en on en.pass_id = pa.id where pp.participation_id = v_part.id and (en.session_id = p_session_id or en.event_id = v_session.event_id)) then
    return query select 'denied'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name,'')), 'El pase no habilita esta sesión.'::text, null::int; return;
  end if;
  if v_session.session_type = 'workshop' and not exists (select 1 from public.session_reservations r where r.session_id = p_session_id and r.participation_id = v_part.id and r.status in ('confirmed','checked_in')) then
    return query select 'denied'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name,'')), 'Requiere una reserva confirmada para este taller.'::text, null::int; return;
  end if;
  if exists (select 1 from public.checkin_records where participation_id = v_part.id and access_point_id = v_point.id and result in ('allowed','validated')) then
    return query select 'duplicate'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name,'')), 'Ya fue validado en este punto.'::text, null::int; return;
  end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(v_session.organization_id,v_part.id,v_session.event_id,v_point.id,'validated',auth.uid(),nullif(trim(p_device_label),''));
  update public.session_reservations set status = 'checked_in', checked_in_at = now() where session_id = p_session_id and participation_id = v_part.id and status = 'confirmed';
  if v_session.capacity is not null then select greatest(v_session.capacity - count(*)::int, 0) into v_remaining from public.session_reservations where session_id = p_session_id and status in ('confirmed','checked_in'); end if;
  return query select 'allowed'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name,'')), 'Acceso a la sesión autorizado.'::text, v_remaining;
end $$;
revoke all on function public.validate_session_checkin(text, uuid, uuid, text) from public;
grant execute on function public.validate_session_checkin(text, uuid, uuid, text) to authenticated;
