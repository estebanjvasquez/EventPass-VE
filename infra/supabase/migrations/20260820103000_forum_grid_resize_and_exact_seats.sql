-- Controles de tamaño del plano y alta de una cantidad exacta de sillas.
-- Ambas operaciones bloquean el plano para que no haya solapamientos por ediciones concurrentes.
create or replace function public.add_forum_seats_by_quantity(
  p_map_id uuid,
  p_quantity integer,
  p_x integer default 0,
  p_y integer default 0
) returns integer language plpgsql security definer set search_path=public as $$
declare
  v_map public.venue_maps; v_columns integer; v_rows integer; v_x integer; v_y integer;
  v_created integer:=0; v_sequence integer; v_element uuid; v_seat uuid;
begin
  select * into v_map from public.venue_maps where id=p_map_id for update;
  if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then
    raise exception 'Plano no disponible' using errcode='42501';
  end if;
  if p_quantity not between 1 and 1000 or p_x < 0 or p_y < 0 then
    raise exception 'Indica una cantidad entre 1 y 1000 sillas y una posición válida' using errcode='22023';
  end if;
  v_columns:=coalesce((v_map.metadata->>'grid_columns')::integer,18);
  v_rows:=coalesce((v_map.metadata->>'grid_rows')::integer,12);
  if p_x >= v_columns then raise exception 'La columna inicial queda fuera del plano' using errcode='22023'; end if;
  v_y:=p_y;
  while v_created < p_quantity loop
    for v_x in
      select gs from generate_series(p_x,v_columns-1) as gs
      union all
      select gs from generate_series(0,p_x-1) as gs
    loop
      exit when v_created = p_quantity;
      if not exists (
        select 1 from public.venue_map_elements e
        where e.map_id=p_map_id and v_x < e.x+e.width and v_x+1 > e.x and v_y < e.y+e.height and v_y+1 > e.y
      ) then
        v_sequence:=coalesce((select count(*) from public.seats where event_id=v_map.event_id),0)+1;
        insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata)
        values(p_map_id,'seat','Asiento '||v_sequence,v_x,v_y,1,1,'available','{}'::jsonb) returning id into v_element;
        insert into public.seats(organization_id,event_id,row_label,column_number,seat_number,status,map_element_id)
        values(v_map.organization_id,v_map.event_id,'F'||(v_y+1),v_x+1,'S'||v_sequence,'available',v_element) returning id into v_seat;
        update public.venue_map_elements set metadata=jsonb_build_object('seat_id',v_seat) where id=v_element;
        v_created:=v_created+1;
      end if;
    end loop;
    v_y:=v_y+1;
    if v_created < p_quantity and v_y >= v_rows then
      v_rows:=v_y+1;
      update public.venue_maps set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{grid_rows}',to_jsonb(v_rows),true) where id=p_map_id;
    end if;
  end loop;
  return v_created;
end $$;

create or replace function public.resize_forum_grid(p_map_id uuid, p_axis text, p_delta integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_map public.venue_maps; v_columns integer; v_rows integer; v_new_columns integer; v_new_rows integer;
  v_item public.venue_map_elements; v_x integer; v_y integer; v_found boolean;
begin
  select * into v_map from public.venue_maps where id=p_map_id for update;
  if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then
    raise exception 'Plano no disponible' using errcode='42501';
  end if;
  if p_axis not in ('columns','rows') or p_delta not in (-1,1) then raise exception 'Cambio de cuadrícula inválido' using errcode='22023'; end if;
  v_columns:=coalesce((v_map.metadata->>'grid_columns')::integer,18);
  v_rows:=coalesce((v_map.metadata->>'grid_rows')::integer,12);
  v_new_columns:=case when p_axis='columns' then v_columns+p_delta else v_columns end;
  v_new_rows:=case when p_axis='rows' then v_rows+p_delta else v_rows end;
  if v_new_columns < 2 or v_new_rows < 2 then raise exception 'El plano debe conservar al menos 2 filas y 2 columnas' using errcode='22023'; end if;

  -- Al crecer basta con ampliar el área disponible.
  if p_delta=1 then
    update public.venue_maps set metadata=jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb),'{grid_columns}',to_jsonb(v_new_columns),true),'{grid_rows}',to_jsonb(v_new_rows),true) where id=p_map_id;
    return jsonb_build_object('columns',v_new_columns,'rows',v_new_rows,'relocated',0);
  end if;

  -- Los elementos que tocarían el borde eliminado se reubican en un hueco libre.
  -- No se elimina ni una silla ni su reserva: si el plano ya no tiene capacidad, toda la transacción se cancela.
  for v_item in
    select * from public.venue_map_elements
    where map_id=p_map_id and (x+width>v_new_columns or y+height>v_new_rows)
    order by y desc, x desc
  loop
    if v_item.width>v_new_columns or v_item.height>v_new_rows then
      raise exception 'No es posible reducir: % es mayor que el nuevo plano', v_item.label using errcode='check_violation';
    end if;
    v_found:=false;
    for v_y in 0..(v_new_rows-v_item.height)::integer loop
      for v_x in 0..(v_new_columns-v_item.width)::integer loop
        if not exists (
          select 1 from public.venue_map_elements e
          where e.map_id=p_map_id and e.id<>v_item.id
            and v_x < e.x+e.width and v_x+v_item.width > e.x and v_y < e.y+e.height and v_y+v_item.height > e.y
        ) then
          update public.venue_map_elements set x=v_x,y=v_y where id=v_item.id;
          v_found:=true;
          exit;
        end if;
      end loop;
      exit when v_found;
    end loop;
    if not v_found then
      raise exception 'No hay espacio para reubicar %; añade una fila o columna antes de reducir', v_item.label using errcode='check_violation';
    end if;
  end loop;
  update public.venue_maps set metadata=jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb),'{grid_columns}',to_jsonb(v_new_columns),true),'{grid_rows}',to_jsonb(v_new_rows),true) where id=p_map_id;
  return jsonb_build_object('columns',v_new_columns,'rows',v_new_rows,'relocated',true);
end $$;

revoke all on function public.add_forum_seats_by_quantity(uuid,integer,integer,integer), public.resize_forum_grid(uuid,text,integer) from public;
grant execute on function public.add_forum_seats_by_quantity(uuid,integer,integer,integer), public.resize_forum_grid(uuid,text,integer) to authenticated;
