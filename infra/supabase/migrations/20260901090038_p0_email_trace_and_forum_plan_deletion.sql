-- P0 posterior a la revisión con cliente:
-- 1) trazabilidad mínima de cada intento de correo;
-- 2) eliminación atómica del plano de foro, sin borrar registros activos.

alter table public.email_log
  add column if not exists recipient text,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_status text,
  add column if not exists error_code text,
  add column if not exists error_detail text,
  add column if not exists attempt_number integer not null default 1;

create index if not exists idx_email_log_registration_type_created
  on public.email_log(registration_id, email_type, created_at desc);

-- Una reserva manual sí puede liberarse; un asiento unido a un registro activo no.
create or replace function public.reserve_seat_for_name(p_seat_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seat public.seats;
begin
  select * into v_seat from public.seats where id = p_seat_id for update;
  if v_seat.id is null then
    raise exception 'Asiento no encontrado' using errcode = 'P0002';
  end if;

  if not (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships membership
      where membership.organization_id = v_seat.organization_id
        and membership.user_id = (select auth.uid())
    )
  ) then
    raise exception 'No tienes permisos para administrar este asiento' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.registrations registration
    where registration.seat_id = p_seat_id
      and registration.status <> 'rejected'
  ) then
    raise exception 'El asiento está vinculado a un registro activo y no se puede liberar manualmente'
      using errcode = 'check_violation';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    update public.seats
    set status = 'available'::public.seat_status, reserved_for = null
    where id = p_seat_id;
  else
    if v_seat.status <> 'available'::public.seat_status then
      raise exception 'Libera primero la reserva actual' using errcode = 'check_violation';
    end if;
    update public.seats
    set status = 'reserved'::public.seat_status, reserved_for = btrim(p_name)
    where id = p_seat_id;
  end if;
end
$$;

revoke all on function public.reserve_seat_for_name(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_seat_for_name(uuid, text) to authenticated;

create or replace function public.delete_forum_floorplan(
  p_map_id uuid,
  p_release_manual_reservations boolean default false
)
returns table(released_manual_reservations integer, deleted_seats integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_map public.venue_maps;
  v_manual integer := 0;
  v_blocked integer := 0;
  v_deleted integer := 0;
begin
  select * into v_map
  from public.venue_maps
  where id = p_map_id
  for update;

  if v_map.id is null then
    raise exception 'Plano no encontrado' using errcode = 'P0002';
  end if;

  if not (
    public.is_platform_admin()
    or exists (
      select 1
      from public.memberships membership
      where membership.organization_id = v_map.organization_id
        and membership.user_id = (select auth.uid())
        and membership.role in ('owner', 'admin')
    )
  ) then
    raise exception 'No tienes permisos para eliminar este plano' using errcode = '42501';
  end if;

  select count(*)::integer into v_blocked
  from public.seats seat
  where seat.event_id = v_map.event_id
    and seat.map_element_id in (
      select element.id from public.venue_map_elements element where element.map_id = p_map_id
    )
    and (
      seat.status = 'confirmed'
      or exists (
        select 1 from public.registrations registration
        where registration.seat_id = seat.id and registration.status <> 'rejected'
      )
    );

  if v_blocked > 0 then
    raise exception 'El plano tiene % asiento(s) vinculados a registros activos o confirmados. Reasígnalos o cancélalos antes de eliminar.', v_blocked
      using errcode = 'check_violation';
  end if;

  select count(*)::integer into v_manual
  from public.seats seat
  where seat.event_id = v_map.event_id
    and seat.map_element_id in (
      select element.id from public.venue_map_elements element where element.map_id = p_map_id
    )
    and seat.status = 'reserved'
    and not exists (
      select 1 from public.registrations registration
      where registration.seat_id = seat.id and registration.status <> 'rejected'
    );

  if v_manual > 0 and not p_release_manual_reservations then
    raise exception 'El plano tiene % reserva(s) manual(es). Confirma su liberación antes de eliminar.', v_manual
      using errcode = 'check_violation';
  end if;

  if p_release_manual_reservations then
    update public.seats seat
    set status = 'available'::public.seat_status,
        reserved_for = null
    where seat.event_id = v_map.event_id
      and seat.map_element_id in (
        select element.id from public.venue_map_elements element where element.map_id = p_map_id
      )
      and seat.status = 'reserved'
      and not exists (
        select 1 from public.registrations registration
        where registration.seat_id = seat.id and registration.status <> 'rejected'
      );
  end if;

  update public.registrations registration
  set seat_id = null
  where registration.status = 'rejected'
    and registration.seat_id in (
      select seat.id
      from public.seats seat
      where seat.event_id = v_map.event_id
        and seat.map_element_id in (
          select element.id from public.venue_map_elements element where element.map_id = p_map_id
        )
    );

  delete from public.seats seat
  where seat.event_id = v_map.event_id
    and seat.map_element_id in (
      select element.id from public.venue_map_elements element where element.map_id = p_map_id
    );
  get diagnostics v_deleted = row_count;

  delete from public.venue_maps where id = p_map_id;

  return query select v_manual, v_deleted;
end
$$;

revoke all on function public.delete_forum_floorplan(uuid, boolean) from public, anon, authenticated;
grant execute on function public.delete_forum_floorplan(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
