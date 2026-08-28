create or replace function public.publish_floor_plan(p_map_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event_id uuid;
begin
  select m.event_id into v_event_id from public.venue_maps m
  where m.id = p_map_id and (public.is_org_member(m.organization_id) or public.is_platform_admin());
  if v_event_id is null then raise exception 'No tienes permisos para publicar este plano' using errcode = '42501'; end if;
  if p_published then
    update public.venue_maps set published = false, published_at = null
    where event_id = v_event_id and id <> p_map_id and published = true;
  end if;
  update public.venue_maps set published = p_published,
    published_at = case when p_published then now() else null end where id = p_map_id;
  update public.events set config = jsonb_set(coalesce(config, '{}'::jsonb),
    '{public_floorplan_visible}', to_jsonb(p_published), true) where id = v_event_id;
end $$;
revoke all on function public.publish_floor_plan(uuid, boolean) from public, anon;
grant execute on function public.publish_floor_plan(uuid, boolean) to authenticated;
