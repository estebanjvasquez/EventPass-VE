-- Lotes de sillas con un rango explícito de columnas y patrones de fila/columna.
create or replace function public.add_forum_seat_batch(
  p_map_id uuid,
  p_quantity integer,
  p_x integer,
  p_y integer,
  p_end_column integer,
  p_mode text default 'block'
) returns integer language plpgsql security definer set search_path=public as $$
declare
  v_map public.venue_maps; v_columns integer; v_rows integer; v_x integer; v_y integer;
  v_created integer:=0; v_sequence integer; v_element uuid; v_seat uuid;
begin
  select * into v_map from public.venue_maps where id=p_map_id for update;
  if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then
    raise exception 'Plano no disponible' using errcode='42501';
  end if;
  if p_quantity not between 1 and 1000 or p_x < 0 or p_y < 0 or p_mode not in ('block','row','column') then
    raise exception 'Indica una cantidad válida y el patrón de distribución' using errcode='22023';
  end if;
  v_columns:=coalesce((v_map.metadata->>'grid_columns')::integer,18);
  v_rows:=coalesce((v_map.metadata->>'grid_rows')::integer,12);
  if p_x>=v_columns or p_end_column<p_x or p_end_column>=v_columns then
    raise exception 'El rango de columnas debe estar dentro del plano y terminar después de la columna inicial' using errcode='22023';
  end if;
  v_y:=p_y;
  if v_y>=v_rows then
    v_rows:=v_y+1;
    update public.venue_maps set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{grid_rows}',to_jsonb(v_rows),true) where id=p_map_id;
  end if;

  while v_created<p_quantity loop
    if p_mode='column' then
      v_x:=p_x;
      if not exists (
        select 1 from public.venue_map_elements e
        where e.map_id=p_map_id and v_x<e.x+e.width and v_x+1>e.x and v_y<e.y+e.height and v_y+1>e.y
      ) then
        v_sequence:=(select count(*) from public.seats where event_id=v_map.event_id)+1;
        insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata)
        values(p_map_id,'seat','Asiento '||v_sequence,v_x,v_y,1,1,'available','{}'::jsonb) returning id into v_element;
        insert into public.seats(organization_id,event_id,row_label,column_number,seat_number,status,map_element_id)
        values(v_map.organization_id,v_map.event_id,'F'||(v_y+1),v_x+1,'S'||v_sequence,'available',v_element) returning id into v_seat;
        update public.venue_map_elements set metadata=jsonb_build_object('seat_id',v_seat) where id=v_element;
        v_created:=v_created+1;
      end if;
    else
      -- Cada fila vuelve exactamente a p_x y nunca usa columnas fuera del rango elegido.
      for v_x in p_x..p_end_column loop
        exit when v_created=p_quantity;
        if not exists (
          select 1 from public.venue_map_elements e
          where e.map_id=p_map_id and v_x<e.x+e.width and v_x+1>e.x and v_y<e.y+e.height and v_y+1>e.y
        ) then
          v_sequence:=(select count(*) from public.seats where event_id=v_map.event_id)+1;
          insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata)
          values(p_map_id,'seat','Asiento '||v_sequence,v_x,v_y,1,1,'available','{}'::jsonb) returning id into v_element;
          insert into public.seats(organization_id,event_id,row_label,column_number,seat_number,status,map_element_id)
          values(v_map.organization_id,v_map.event_id,'F'||(v_y+1),v_x+1,'S'||v_sequence,'available',v_element) returning id into v_seat;
          update public.venue_map_elements set metadata=jsonb_build_object('seat_id',v_seat) where id=v_element;
          v_created:=v_created+1;
        end if;
      end loop;
    end if;

    exit when v_created=p_quantity;
    if p_mode='row' then
      raise exception 'No caben % sillas libres en la fila y rango seleccionados', p_quantity using errcode='check_violation';
    end if;
    v_y:=v_y+1;
    if v_y>=v_rows then
      v_rows:=v_y+1;
      update public.venue_maps set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{grid_rows}',to_jsonb(v_rows),true) where id=p_map_id;
    end if;
  end loop;
  return v_created;
end $$;

revoke all on function public.add_forum_seat_batch(uuid,integer,integer,integer,integer,text) from public;
grant execute on function public.add_forum_seat_batch(uuid,integer,integer,integer,integer,text) to authenticated;
