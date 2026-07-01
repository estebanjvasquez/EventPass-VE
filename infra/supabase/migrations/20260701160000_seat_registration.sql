-- EventPass VE — Registro con selección de asiento
-- ----------------------------------------------------------------------
-- El alta pública (anon) no puede actualizar seats (solo miembros por RLS).
-- Para reservar un asiento de forma atómica y evitar choques (dos personas
-- eligiendo el mismo asiento), se usa una función security definer que bloquea
-- la fila del asiento (FOR UPDATE), valida disponibilidad, crea el registro y
-- marca el asiento como reservado, todo en una sola transacción.

create or replace function public.register_with_seat(
  p_event_id   uuid,
  p_seat_id    uuid,
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_phone      text,
  p_cedula     text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid;
  v_status public.seat_status;
  v_reg_id uuid;
begin
  select organization_id into v_org
  from public.events
  where id = p_event_id and status = 'published';
  if v_org is null then
    raise exception 'Evento no disponible' using errcode = 'check_violation';
  end if;

  -- Bloquea el asiento para evitar reservas concurrentes.
  select status into v_status
  from public.seats
  where id = p_seat_id and event_id = p_event_id
  for update;
  if not found then
    raise exception 'Asiento no encontrado' using errcode = 'no_data_found';
  end if;
  if v_status <> 'available' then
    raise exception 'El asiento ya no está disponible' using errcode = 'check_violation';
  end if;

  insert into public.registrations
    (organization_id, event_id, first_name, last_name, email, phone, cedula, seat_id)
  values
    (v_org, p_event_id, p_first_name, nullif(p_last_name, ''), p_email,
     nullif(p_phone, ''), nullif(p_cedula, ''), p_seat_id)
  returning id into v_reg_id;

  update public.seats set status = 'reserved' where id = p_seat_id;

  return v_reg_id;
end;
$$;

revoke all on function public.register_with_seat(uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.register_with_seat(uuid, uuid, text, text, text, text, text) to anon, authenticated;
