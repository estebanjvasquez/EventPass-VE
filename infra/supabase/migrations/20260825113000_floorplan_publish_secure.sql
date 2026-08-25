-- Garantiza que la publicación actualice el plano aunque la sesión tenga
-- RLS de lectura limitada. La función valida explícitamente la pertenencia
-- antes de ejecutar la actualización privilegiada.
create or replace function public.publish_floor_plan(p_map_id uuid, p_published boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.venue_maps m
    where m.id = p_map_id
      and (public.is_org_member(m.organization_id) or public.is_platform_admin())
  ) then
    raise exception 'No tienes permisos para publicar este plano' using errcode = '42501';
  end if;

  update public.venue_maps
  set published = p_published,
      published_at = case
        when p_published then coalesce(published_at, now())
        else null
      end
  where id = p_map_id;
end;
$$;

revoke execute on function public.publish_floor_plan(uuid, boolean) from anon;
grant execute on function public.publish_floor_plan(uuid, boolean) to authenticated;
