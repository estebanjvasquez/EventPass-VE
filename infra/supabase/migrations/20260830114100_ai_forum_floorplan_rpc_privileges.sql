-- El diseño asistido y los ajustes de pasillos son operaciones administrativas.
-- Supabase concede EXECUTE a roles de API por defecto, por lo que se revoca
-- explícitamente el acceso anónimo y se conserva únicamente para usuarios autenticados.

revoke all on function public.apply_ai_forum_floorplan(uuid, jsonb) from public, anon;
revoke all on function public.delete_forum_aisle_and_adjust(uuid, uuid) from public, anon;

grant execute on function public.apply_ai_forum_floorplan(uuid, jsonb) to authenticated;
grant execute on function public.delete_forum_aisle_and_adjust(uuid, uuid) to authenticated;
