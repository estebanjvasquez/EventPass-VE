-- Restringe el borrado completo de planos a owner/admin y elimina la concesión
-- implícita de Supabase al rol anon.
create or replace function public.delete_floor_plan(p_map_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.venue_maps
  where id = p_map_id;

  if v_organization_id is null then
    raise exception 'Plano no encontrado' using errcode = 'P0002';
  end if;

  if not (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.organization_id = v_organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  ) then
    raise exception 'No tienes permisos para eliminar este plano' using errcode = '42501';
  end if;

  delete from public.venue_maps where id = p_map_id;
  return found;
end
$$;

revoke all on function public.delete_floor_plan(uuid) from public;
revoke all on function public.delete_floor_plan(uuid) from anon;
grant execute on function public.delete_floor_plan(uuid) to authenticated;
