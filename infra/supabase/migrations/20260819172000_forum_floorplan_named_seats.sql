-- Plano de foro: reserva nominada de asientos y metadatos físicos reutilizables.
alter table public.seats add column if not exists reserved_for text;

create or replace function public.reserve_seat_for_name(p_seat_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_seat public.seats;
begin
  select * into v_seat from public.seats where id = p_seat_id for update;
  if v_seat is null or not (public.is_org_member(v_seat.organization_id) or public.is_platform_admin()) then raise exception 'Asiento no disponible' using errcode = '42501'; end if;
  if v_seat.status = 'confirmed' then raise exception 'El asiento ya está confirmado por un registro' using errcode = 'check_violation'; end if;
  update public.seats set status = case when nullif(trim(p_name),'') is null then 'available' else 'reserved' end, reserved_for = nullif(trim(p_name),'') where id = p_seat_id;
end $$;
revoke all on function public.reserve_seat_for_name(uuid,text) from public;
grant execute on function public.reserve_seat_for_name(uuid,text) to authenticated;
