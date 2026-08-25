-- La publicación se ejecuta con la sesión del organizador; RLS de venue_maps
-- mantiene el aislamiento por organización y evita una función privilegiada.
create or replace function public.publish_floor_plan(p_map_id uuid, p_published boolean)
returns void language plpgsql set search_path = public as $$
begin
  update public.venue_maps
  set published = p_published,
      published_at = case when p_published then coalesce(published_at, now()) else null end
  where id = p_map_id;
  if not found then raise exception 'Plano no encontrado o sin permisos' using errcode = '42501'; end if;
end $$;
revoke execute on function public.publish_floor_plan(uuid, boolean) from anon;
grant execute on function public.publish_floor_plan(uuid, boolean) to authenticated;
