-- Reinicio atómico del plano físico: elimina solo las sillas vinculadas al plano y sus elementos.
create or replace function public.reset_forum_floorplan(p_map_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_map public.venue_maps;
begin
 select * into v_map from public.venue_maps where id=p_map_id for update;
 if v_map is null or not (public.is_org_member(v_map.organization_id) or public.is_platform_admin()) then raise exception 'Plano no disponible' using errcode='42501'; end if;
 if exists(select 1 from public.seats where event_id=v_map.event_id and map_element_id is not null and status <> 'available') then raise exception 'Libera primero las sillas reservadas o confirmadas' using errcode='check_violation'; end if;
 delete from public.seats where event_id=v_map.event_id and map_element_id in (select id from public.venue_map_elements where map_id=p_map_id);
 delete from public.venue_maps where id=p_map_id;
end $$;
revoke all on function public.reset_forum_floorplan(uuid) from public;
grant execute on function public.reset_forum_floorplan(uuid) to authenticated;
