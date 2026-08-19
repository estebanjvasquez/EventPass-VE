-- Plano físico de foro: los asientos conservan una referencia estable al elemento visual.
alter table public.seats
  add column if not exists map_element_id uuid unique references public.venue_map_elements(id) on delete set null;

create or replace function public.create_forum_floorplan(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_event public.events; v_map_id uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  if v_event is null or not (public.is_org_member(v_event.organization_id) or public.is_platform_admin()) then
    raise exception 'No tienes permiso para crear este plano' using errcode = '42501';
  end if;
  select id into v_map_id from public.venue_maps where event_id=p_event_id and name='Plano de foro' order by created_at limit 1;
  if v_map_id is null then
    insert into public.venue_maps(organization_id,event_id,name)
    values (v_event.organization_id,p_event_id,'Plano de foro') returning id into v_map_id;
    update public.venue_maps set metadata=jsonb_build_object('grid_columns',18,'grid_rows',12,'plan_type','forum') where id=v_map_id;
    insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata)
    values(v_map_id,'stage','Escenario',4,0,10,1,'blocked','{"object_type":"stage"}'::jsonb);
  end if;
  return v_map_id;
end $$;

create or replace function public.add_forum_seat_block(
  p_map_id uuid, p_rows integer, p_columns integer, p_x integer default 4, p_y integer default 2
) returns integer language plpgsql security definer set search_path = public as $$
declare v_map public.venue_maps; v_element_id uuid; v_seat_id uuid; r integer; c integer; v_row text; v_label text; v_total integer:=0; v_start integer;
begin
  select * into v_map from public.venue_maps where id=p_map_id for update;
  if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then raise exception 'Plano no disponible' using errcode='42501'; end if;
  if p_rows not between 1 and 26 or p_columns not between 1 and 40 then raise exception 'Bloque de asientos inválido' using errcode='22023'; end if;
  select count(distinct row_label)::integer into v_start from public.seats where event_id=v_map.event_id;
  if v_start+p_rows > 26 then raise exception 'El plano admite hasta 26 filas identificadas con letras' using errcode='22023'; end if;
  for r in 1..p_rows loop
    v_row := chr(64 + v_start + r);
    for c in 1..p_columns loop
      v_label := 'Asiento ' || v_row || c;
      if exists(select 1 from public.venue_map_elements e where e.map_id=p_map_id and p_x+c-1 < e.x+e.width and p_x+c > e.x and p_y+r-1 < e.y+e.height and p_y+r > e.y) then raise exception 'El bloque se superpone a un elemento existente' using errcode='check_violation'; end if;
      insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata)
      values(p_map_id,'seat',v_label,p_x+c-1,p_y+r-1,1,1,'available','{}'::jsonb) returning id into v_element_id;
      insert into public.seats(organization_id,event_id,row_label,column_number,seat_number,status,map_element_id)
      values(v_map.organization_id,v_map.event_id,v_row,c,v_row||c,'available',v_element_id) returning id into v_seat_id;
      update public.venue_map_elements set metadata=jsonb_build_object('seat_id',v_seat_id) where id=v_element_id;
      v_total:=v_total+1;
    end loop;
  end loop;
  return v_total;
end $$;

create or replace function public.insert_forum_aisle(p_map_id uuid, p_axis text, p_index integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_map public.venue_maps; v_id uuid; v_columns integer; v_rows integer;
begin
  select * into v_map from public.venue_maps where id=p_map_id for update;
  if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then raise exception 'Plano no disponible' using errcode='42501'; end if;
  v_columns:=coalesce((v_map.metadata->>'grid_columns')::integer,18); v_rows:=coalesce((v_map.metadata->>'grid_rows')::integer,12);
  if p_axis='horizontal' then
    if p_index not between 0 and v_rows then raise exception 'Fila de pasillo inválida' using errcode='22023'; end if;
    update public.venue_map_elements set y=y+1 where map_id=p_map_id and y>=p_index;
    insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata) values(p_map_id,'aisle','Pasillo horizontal '||(p_index+1),0,p_index,v_columns,1,'blocked','{"axis":"horizontal"}'::jsonb) returning id into v_id;
    update public.venue_maps set metadata=jsonb_set(metadata,'{grid_rows}',to_jsonb(v_rows+1),true) where id=p_map_id;
  elsif p_axis='vertical' then
    if p_index not between 0 and v_columns then raise exception 'Columna de pasillo inválida' using errcode='22023'; end if;
    update public.venue_map_elements set x=x+1 where map_id=p_map_id and x>=p_index;
    insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata) values(p_map_id,'aisle','Pasillo vertical '||(p_index+1),p_index,0,1,v_rows,'blocked','{"axis":"vertical"}'::jsonb) returning id into v_id;
    update public.venue_maps set metadata=jsonb_set(metadata,'{grid_columns}',to_jsonb(v_columns+1),true) where id=p_map_id;
  else raise exception 'Orientación inválida' using errcode='22023'; end if;
  return v_id;
end $$;

revoke all on function public.create_forum_floorplan(uuid), public.add_forum_seat_block(uuid,integer,integer,integer,integer), public.insert_forum_aisle(uuid,text,integer) from public;
grant execute on function public.create_forum_floorplan(uuid), public.add_forum_seat_block(uuid,integer,integer,integer,integer), public.insert_forum_aisle(uuid,text,integer) to authenticated;
