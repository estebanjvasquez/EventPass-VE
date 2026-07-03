-- =====================================================================
-- Alta manual de clientes por el superadmin (vía Worker con service role):
-- resolver el user_id de un correo ya registrado para asignarlo como admin.
-- Solo el service_role puede ejecutarla (no anon/authenticated).
-- =====================================================================
create or replace function public.get_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public;
grant execute on function public.get_user_id_by_email(text) to service_role;
