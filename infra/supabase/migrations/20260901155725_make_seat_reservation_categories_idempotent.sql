-- Evita duplicados al guardar una categoria con el mismo nombre en un evento.
-- La misma accion actualiza la categoria existente y conserva sus sillas ya asignadas.

create or replace function public.manage_seat_reservation_category(
  p_event_id uuid,
  p_name text,
  p_color text,
  p_reserved_capacity integer,
  p_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_category public.seat_reservation_categories;
  v_other_capacity integer;
  v_public_taken integer;
  v_result uuid;
  v_action text;
  v_name text := btrim(coalesce(p_name, ''));
begin
  -- Serializa los cambios de categorias por evento y evita carreras de altas iguales.
  select * into v_event from public.events where id = p_event_id for update;
  if v_event.id is null then raise exception 'Evento no encontrado' using errcode = 'P0002'; end if;
  if not (public.is_platform_admin() or exists (
    select 1 from public.memberships m where m.organization_id = v_event.organization_id
      and m.user_id = (select auth.uid()) and m.role::text in ('owner','admin')
  )) then raise exception 'No tienes permisos para gestionar reservas' using errcode = '42501'; end if;
  if char_length(v_name) < 2 then raise exception 'Indica un nombre de categoria valido' using errcode = '22023'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'El color no es valido' using errcode = '22023'; end if;
  if coalesce(p_reserved_capacity,-1) < 0 then raise exception 'La cantidad reservada no puede ser negativa' using errcode = '22023'; end if;

  if p_category_id is not null then
    select * into v_category from public.seat_reservation_categories
      where id = p_category_id and event_id = p_event_id for update;
    if v_category.id is null then raise exception 'Categoria no encontrada' using errcode = 'P0002'; end if;
  else
    -- Reusar el registro protege al usuario de un doble clic o de volver a guardar
    -- "Patrocinantes"/"patrocinantes" en el mismo evento.
    select * into v_category from public.seat_reservation_categories
      where event_id = p_event_id and lower(name) = lower(v_name) for update;
    if v_category.id is not null then p_category_id := v_category.id; end if;
  end if;

  if p_category_id is not null and p_reserved_capacity < (
    select count(*) from public.seats where reservation_category_id = p_category_id
  ) then
    raise exception 'Libera asientos antes de reducir la cantidad reservada' using errcode = 'check_violation';
  end if;

  select coalesce(sum(reserved_capacity),0)::integer into v_other_capacity
  from public.seat_reservation_categories
  where event_id = p_event_id and is_active and id is distinct from p_category_id;
  select count(*)::integer into v_public_taken from public.registrations
  where event_id = p_event_id and status <> 'rejected';
  if v_event.total_slots > 0 and v_other_capacity + p_reserved_capacity + v_public_taken > v_event.total_slots then
    raise exception 'La reserva supera el aforo disponible. Ya hay % registro(s) y % cupo(s) en otras categorias.', v_public_taken, v_other_capacity using errcode = 'check_violation';
  end if;

  if p_category_id is null then
    insert into public.seat_reservation_categories(organization_id,event_id,name,color,reserved_capacity,created_by)
    values(v_event.organization_id,p_event_id,v_name,upper(p_color),p_reserved_capacity,(select auth.uid()))
    returning id into v_result;
    v_action := 'category_created';
  else
    update public.seat_reservation_categories
    set name=v_name, color=upper(p_color), reserved_capacity=p_reserved_capacity,
      is_active=true, updated_at=now()
    where id=p_category_id returning id into v_result;
    v_action := 'category_updated';
  end if;
  insert into public.seat_reservation_audit(organization_id,event_id,category_id,action,actor_user_id,details)
  values(v_event.organization_id,p_event_id,v_result,v_action,(select auth.uid()),jsonb_build_object('name',v_name,'color',upper(p_color),'reserved_capacity',p_reserved_capacity));
  return v_result;
end $$;

notify pgrst, 'reload schema';
