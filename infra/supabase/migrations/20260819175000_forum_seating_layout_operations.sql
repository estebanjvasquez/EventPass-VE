-- Operaciones atómicas para sillas y pasillos de foro.
create or replace function public.delete_forum_seats(p_map_id uuid, p_seat_ids uuid[])
returns integer language plpgsql security definer set search_path=public as $$
declare v_map public.venue_maps; v_elements uuid[]; v_count integer;
begin
 select * into v_map from public.venue_maps where id=p_map_id for update;
 if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then raise exception 'Plano no disponible' using errcode='42501'; end if;
 if exists(select 1 from public.seats where id=any(p_seat_ids) and event_id=v_map.event_id and status <> 'available') then raise exception 'Libera primero las sillas reservadas o confirmadas' using errcode='check_violation'; end if;
 select array_agg(map_element_id), count(*) into v_elements,v_count from public.seats where id=any(p_seat_ids) and event_id=v_map.event_id;
 delete from public.seats where id=any(p_seat_ids) and event_id=v_map.event_id;
 delete from public.venue_map_elements where map_id=p_map_id and id=any(coalesce(v_elements,'{}'::uuid[]));
 return coalesce(v_count,0);
end $$;

create or replace function public.add_forum_aisle(p_map_id uuid,p_axis text,p_x integer,p_y integer,p_length integer default 4,p_thickness integer default 1)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_map public.venue_maps; v_id uuid; v_width integer; v_height integer; v_columns integer; v_rows integer;
begin
 select * into v_map from public.venue_maps where id=p_map_id for update;
 if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then raise exception 'Plano no disponible' using errcode='42501'; end if;
 if p_axis not in ('horizontal','vertical') or p_length not between 1 and 40 or p_thickness not between 1 and 8 then raise exception 'Dimensiones de pasillo inválidas' using errcode='22023'; end if;
 v_width:=case when p_axis='horizontal' then p_length else p_thickness end; v_height:=case when p_axis='horizontal' then p_thickness else p_length end;
 v_columns:=coalesce((v_map.metadata->>'grid_columns')::integer,18); v_rows:=coalesce((v_map.metadata->>'grid_rows')::integer,12);
 if p_x<0 or p_y<0 then raise exception 'Posición inválida' using errcode='22023'; end if;
 if p_axis='horizontal' then
   update public.venue_map_elements set y=y+v_height where map_id=p_map_id and y+height>p_y;
   v_rows:=greatest(v_rows,p_y+v_height); update public.venue_maps set metadata=jsonb_set(metadata,'{grid_rows}',to_jsonb(v_rows),true) where id=p_map_id;
 else
   update public.venue_map_elements set x=x+v_width where map_id=p_map_id and x+width>p_x;
   v_columns:=greatest(v_columns,p_x+v_width); update public.venue_maps set metadata=jsonb_set(metadata,'{grid_columns}',to_jsonb(v_columns),true) where id=p_map_id;
 end if;
 insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata) values(p_map_id,'aisle','Pasillo '||substr(gen_random_uuid()::text,1,5),p_x,p_y,v_width,v_height,'blocked',jsonb_build_object('axis',p_axis,'color','#94a3b8')) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.delete_forum_seats(uuid,uuid[]),public.add_forum_aisle(uuid,text,integer,integer,integer,integer) from public;
grant execute on function public.delete_forum_seats(uuid,uuid[]),public.add_forum_aisle(uuid,text,integer,integer,integer,integer) to authenticated;

create or replace function public.add_forum_seats_flexible(p_map_id uuid,p_rows integer,p_columns integer,p_x integer default 0,p_y integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_map public.venue_maps; v_columns integer; v_rows integer; v_y integer; v_x integer; v_found integer; v_row_number integer; v_element uuid; v_seat uuid; v_created integer:=0; v_start integer;
begin
 select * into v_map from public.venue_maps where id=p_map_id for update;
 if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then raise exception 'Plano no disponible' using errcode='42501'; end if;
 if p_rows not between 1 and 26 or p_columns not between 1 and 40 or p_x<0 or p_y<0 then raise exception 'Dimensiones inválidas' using errcode='22023'; end if;
 v_columns:=coalesce((v_map.metadata->>'grid_columns')::integer,18); v_rows:=coalesce((v_map.metadata->>'grid_rows')::integer,12); if p_x>=v_columns then raise exception 'La columna inicial queda fuera del plano' using errcode='22023'; end if;
 select count(distinct row_label)::integer into v_start from public.seats where event_id=v_map.event_id;
 v_y:=p_y;
 for v_row_number in 1..p_rows loop
   loop
     select count(*) into v_found from generate_series(p_x,v_columns-1) x where not exists(select 1 from public.venue_map_elements e where e.map_id=p_map_id and x < e.x+e.width and x+1>e.x and v_y<e.y+e.height and v_y+1>e.y);
     exit when v_found>=p_columns;
     v_y:=v_y+1;
   end loop;
   if v_start+v_row_number>26 then raise exception 'Máximo de 26 filas de sillas' using errcode='22023'; end if;
   v_found:=0;
   for v_x in p_x..v_columns-1 loop
     exit when v_found=p_columns;
     if not exists(select 1 from public.venue_map_elements e where e.map_id=p_map_id and v_x<e.x+e.width and v_x+1>e.x and v_y<e.y+e.height and v_y+1>e.y) then
       v_found:=v_found+1;
       insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata) values(p_map_id,'seat','Asiento '||chr(64+v_start+v_row_number)||v_found,v_x,v_y,1,1,'available','{}') returning id into v_element;
       insert into public.seats(organization_id,event_id,row_label,column_number,seat_number,status,map_element_id) values(v_map.organization_id,v_map.event_id,chr(64+v_start+v_row_number),v_found,chr(64+v_start+v_row_number)||v_found,'available',v_element) returning id into v_seat;
       update public.venue_map_elements set metadata=jsonb_build_object('seat_id',v_seat) where id=v_element; v_created:=v_created+1;
     end if;
   end loop;
   v_y:=v_y+1;
 end loop;
 if v_y>v_rows then update public.venue_maps set metadata=jsonb_set(metadata,'{grid_rows}',to_jsonb(v_y),true) where id=p_map_id; end if;
 return v_created;
end $$;
revoke all on function public.add_forum_seats_flexible(uuid,integer,integer,integer,integer) from public;
grant execute on function public.add_forum_seats_flexible(uuid,integer,integer,integer,integer) to authenticated;
