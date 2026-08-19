-- Pasillos locales para el plano de foro. No alteran toda la cuadrícula.
create or replace function public.add_forum_aisle(
  p_map_id uuid, p_axis text, p_x integer, p_y integer, p_length integer default 4, p_thickness integer default 1
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_map public.venue_maps; v_id uuid; v_width integer; v_height integer; v_columns integer; v_rows integer;
begin
  select * into v_map from public.venue_maps where id=p_map_id for update;
  if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then raise exception 'Plano no disponible' using errcode='42501'; end if;
  if p_axis not in ('horizontal','vertical') or p_length not between 1 and 40 or p_thickness not between 1 and 8 then raise exception 'Dimensiones de pasillo inválidas' using errcode='22023'; end if;
  v_width:=case when p_axis='horizontal' then p_length else p_thickness end;
  v_height:=case when p_axis='horizontal' then p_thickness else p_length end;
  v_columns:=coalesce((v_map.metadata->>'grid_columns')::integer,18); v_rows:=coalesce((v_map.metadata->>'grid_rows')::integer,12);
  if p_x<0 or p_y<0 or p_x+v_width>v_columns or p_y+v_height>v_rows then raise exception 'El pasillo queda fuera del plano' using errcode='22023'; end if;
  if exists(select 1 from public.venue_map_elements e where e.map_id=p_map_id and p_x < e.x+e.width and p_x+v_width > e.x and p_y < e.y+e.height and p_y+v_height > e.y) then raise exception 'El pasillo se superpone a un elemento existente' using errcode='check_violation'; end if;
  insert into public.venue_map_elements(map_id,element_type,label,x,y,width,height,status,metadata)
  values(p_map_id,'aisle','Pasillo '||substr(gen_random_uuid()::text,1,5),p_x,p_y,v_width,v_height,'blocked',jsonb_build_object('axis',p_axis,'color','#94a3b8')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_forum_aisle(uuid,text,integer,integer,integer,integer) from public;
grant execute on function public.add_forum_aisle(uuid,text,integer,integer,integer,integer) to authenticated;
