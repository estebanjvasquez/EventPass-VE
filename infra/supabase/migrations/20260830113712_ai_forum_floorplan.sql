-- Propuesta de IA para el plano de foro. La IA no escribe en la base: el
-- navegador muestra una propuesta y esta RPC la valida de nuevo al aplicarla.

create or replace function public.sync_forum_seat_position()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.element_type = 'seat' and (tg_op = 'INSERT' or new.x is distinct from old.x or new.y is distinct from old.y) then
    update public.seats
    set row_label = 'F' || (new.y::integer + 1),
        column_number = new.x::integer + 1,
        seat_number = 'F' || (new.y::integer + 1) || '-C' || (new.x::integer + 1)
    where map_element_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists sync_forum_seat_position on public.venue_map_elements;
create trigger sync_forum_seat_position
after insert or update of x, y on public.venue_map_elements
for each row execute function public.sync_forum_seat_position();
revoke all on function public.sync_forum_seat_position() from public;

create or replace function public.delete_forum_aisle_and_adjust(p_map_id uuid, p_aisle_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_map public.venue_maps;
  v_aisle public.venue_map_elements;
  v_axis text;
  v_columns integer;
  v_rows integer;
begin
  select * into v_map from public.venue_maps where id = p_map_id for update;
  if v_map is null or not (
    exists(select 1 from public.memberships m where m.organization_id = v_map.organization_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
    or public.is_platform_admin()
  ) then raise exception 'No tienes permiso para modificar este plano' using errcode = '42501'; end if;

  select * into v_aisle from public.venue_map_elements
  where id = p_aisle_id and map_id = p_map_id and element_type = 'aisle' for update;
  if v_aisle is null then raise exception 'El pasillo ya no existe' using errcode = '22023'; end if;

  v_axis := coalesce(v_aisle.metadata->>'axis', case when v_aisle.width >= v_aisle.height then 'horizontal' else 'vertical' end);
  v_columns := coalesce((v_map.metadata->>'grid_columns')::integer, 18);
  v_rows := coalesce((v_map.metadata->>'grid_rows')::integer, 12);

  if v_axis = 'vertical' then
    if v_columns - v_aisle.width::integer < 2 then raise exception 'El plano debe conservar al menos 2 columnas' using errcode = 'check_violation'; end if;
    update public.venue_map_elements set x = x - v_aisle.width
    where map_id = p_map_id and id <> p_aisle_id and x >= v_aisle.x + v_aisle.width;
    v_columns := v_columns - v_aisle.width::integer;
  elsif v_axis = 'horizontal' then
    if v_rows - v_aisle.height::integer < 2 then raise exception 'El plano debe conservar al menos 2 filas' using errcode = 'check_violation'; end if;
    update public.venue_map_elements set y = y - v_aisle.height
    where map_id = p_map_id and id <> p_aisle_id and y >= v_aisle.y + v_aisle.height;
    v_rows := v_rows - v_aisle.height::integer;
  else
    raise exception 'El pasillo no tiene una orientación válida' using errcode = '22023';
  end if;

  delete from public.venue_map_elements where id = p_aisle_id;
  update public.venue_maps set metadata = jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb), '{grid_columns}', to_jsonb(v_columns), true), '{grid_rows}', to_jsonb(v_rows), true) where id = p_map_id;
  return jsonb_build_object('columns', v_columns, 'rows', v_rows, 'adjusted', true);
end $$;

create or replace function public.apply_ai_forum_floorplan(p_event_id uuid, p_plan jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_event public.events;
  v_map public.venue_maps;
  v_map_id uuid;
  v_columns integer := (p_plan->>'columns')::integer;
  v_rows integer := (p_plan->>'rows')::integer;
  v_expected integer := (p_plan->>'capacity')::integer;
  v_capacity integer := 0;
  v_item jsonb;
  v_block jsonb;
  v_element_id uuid;
  v_seat_id uuid;
  v_x integer;
  v_y integer;
  v_width integer;
  v_height integer;
  v_row integer;
  v_column integer;
  v_index integer := 0;
  v_block_label text;
  v_label text;
begin
  select * into v_event from public.events where id = p_event_id;
  if v_event is null or not (
    exists(select 1 from public.memberships m where m.organization_id = v_event.organization_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
    or public.is_platform_admin()
  ) then raise exception 'No tienes permiso para aplicar este plano' using errcode = '42501'; end if;

  if v_columns not between 6 and 100 or v_rows not between 6 and 100 or v_expected not between 1 and 5000
    or jsonb_typeof(p_plan->'stage') <> 'object'
    or jsonb_typeof(p_plan->'aisles') <> 'array'
    or jsonb_typeof(p_plan->'entrances') <> 'array'
    or jsonb_typeof(p_plan->'seating_blocks') <> 'array' then
    raise exception 'La propuesta de IA no tiene una estructura válida' using errcode = '22023';
  end if;

  select * into v_map from public.venue_maps where event_id = p_event_id and name = 'Plano de foro' order by created_at limit 1 for update;
  if v_map is null then
    insert into public.venue_maps(organization_id, event_id, name, metadata)
    values(v_event.organization_id, p_event_id, 'Plano de foro', '{}'::jsonb) returning * into v_map;
  end if;
  v_map_id := v_map.id;

  if exists(
    select 1 from public.seats s join public.venue_map_elements e on e.id = s.map_element_id
    where e.map_id = v_map_id and s.status <> 'available'
  ) then raise exception 'Libera las sillas reservadas o confirmadas antes de reemplazar el plano con IA' using errcode = 'check_violation'; end if;

  delete from public.seats where map_element_id in (select id from public.venue_map_elements where map_id = v_map_id);
  delete from public.venue_map_elements where map_id = v_map_id;
  update public.venue_maps set metadata = jsonb_build_object('grid_columns', v_columns, 'grid_rows', v_rows, 'plan_type', 'forum', 'created_with_ai', true) where id = v_map_id;

  for v_item in
    select p_plan->'stage'
    union all select value from jsonb_array_elements(p_plan->'aisles')
    union all select value from jsonb_array_elements(p_plan->'entrances')
  loop
    v_index := v_index + 1;
    v_x := (v_item->>'x')::integer; v_y := (v_item->>'y')::integer;
    v_width := (v_item->>'width')::integer; v_height := (v_item->>'height')::integer;
    if v_x < 0 or v_y < 0 or v_width < 1 or v_height < 1 or v_x + v_width > v_columns or v_y + v_height > v_rows then
      raise exception 'Un elemento de la propuesta queda fuera del plano' using errcode = '22023';
    end if;
    if exists(select 1 from public.venue_map_elements e where e.map_id = v_map_id and v_x < e.x + e.width and v_x + v_width > e.x and v_y < e.y + e.height and v_y + v_height > e.y) then
      raise exception 'La propuesta de IA tiene elementos superpuestos' using errcode = 'check_violation';
    end if;
    if v_item = p_plan->'stage' then
      insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata,geometry,layer)
      values(v_map_id,'stage',coalesce(nullif(trim(v_item->>'label'),''),'Escenario'),v_x,v_y,v_width,v_height,'blocked',jsonb_build_object('object_type','stage'),jsonb_build_object('x',v_x,'y',v_y,'width',v_width,'height',v_height,'rotation',0),'architecture');
    elsif v_item ? 'axis' then
      insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata,geometry,layer)
      values(v_map_id,'aisle',coalesce(nullif(trim(v_item->>'label'),''),'Pasillo') || ' ' || v_index,v_x,v_y,v_width,v_height,'blocked',jsonb_build_object('axis',v_item->>'axis','color','#94a3b8'),jsonb_build_object('x',v_x,'y',v_y,'width',v_width,'height',v_height,'rotation',0),'circulation');
    else
      insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata,geometry,layer)
      values(v_map_id,'access_point',coalesce(nullif(trim(v_item->>'label'),''),'Entrada') || ' ' || v_index,v_x,v_y,v_width,v_height,'blocked',jsonb_build_object('object_type','access','purpose','Acceso de asistentes'),jsonb_build_object('x',v_x,'y',v_y,'width',v_width,'height',v_height,'rotation',0),'circulation');
    end if;
  end loop;

  for v_block in select value from jsonb_array_elements(p_plan->'seating_blocks') loop
    v_x := (v_block->>'x')::integer; v_y := (v_block->>'y')::integer;
    v_width := (v_block->>'columns')::integer; v_height := (v_block->>'rows')::integer;
    v_block_label := coalesce(nullif(trim(v_block->>'label'),''), 'Bloque');
    if v_x < 0 or v_y < 0 or v_width not between 1 and 80 or v_height not between 1 and 80 or v_x + v_width > v_columns or v_y + v_height > v_rows then
      raise exception 'Un bloque de sillas queda fuera del plano' using errcode = '22023';
    end if;
    for v_row in 0..v_height - 1 loop
      for v_column in 0..v_width - 1 loop
        if exists(select 1 from public.venue_map_elements e where e.map_id = v_map_id and v_x + v_column < e.x + e.width and v_x + v_column + 1 > e.x and v_y + v_row < e.y + e.height and v_y + v_row + 1 > e.y) then
          raise exception 'Un bloque de sillas se superpone con otro elemento' using errcode = 'check_violation';
        end if;
        v_label := 'Asiento ' || v_block_label || '-' || (v_row + 1) || '-' || (v_column + 1);
        insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata,geometry,layer)
        values(v_map_id,'seat',v_label,v_x + v_column,v_y + v_row,1,1,'available','{}'::jsonb,jsonb_build_object('x',v_x + v_column,'y',v_y + v_row,'width',1,'height',1,'rotation',0),'layout') returning id into v_element_id;
        insert into public.seats(organization_id,event_id,row_label,column_number,seat_number,status,map_element_id)
        values(v_event.organization_id,p_event_id,'F' || (v_y + v_row + 1),v_x + v_column + 1,'F' || (v_y + v_row + 1) || '-C' || (v_x + v_column + 1),'available',v_element_id) returning id into v_seat_id;
        update public.venue_map_elements set metadata = jsonb_build_object('seat_id', v_seat_id) where id = v_element_id;
        v_capacity := v_capacity + 1;
      end loop;
    end loop;
  end loop;

  if v_capacity <> v_expected then
    raise exception 'La capacidad calculada no coincide con la propuesta de IA' using errcode = '22023';
  end if;
  return v_map_id;
end $$;

revoke all on function public.delete_forum_aisle_and_adjust(uuid,uuid), public.apply_ai_forum_floorplan(uuid,jsonb) from public;
grant execute on function public.delete_forum_aisle_and_adjust(uuid,uuid), public.apply_ai_forum_floorplan(uuid,jsonb) to authenticated;
