-- =====================================================================
-- Onboarding self-service: alta de organización por el propio usuario.
--
-- Las políticas RLS de organizations/memberships exigen ser ya miembro
-- (org_member_all) o tener rol owner/admin (mem_admin_all), lo que impide
-- crear la PRIMERA organización y la PRIMERA membresía. Estas funciones
-- security-definer rompen ese huevo-gallina de forma controlada.
-- =====================================================================

-- Slugs reservados para la plataforma (deben coincidir con el frontend/worker).
create or replace function public.is_reserved_slug(p_slug text)
returns boolean
language sql immutable as $$
  select lower(p_slug) in (
    'www', 'app', 'admin', 'api', 'mail', 'email', 'static', 'assets', 'cdn'
  );
$$;

-- ¿Está disponible el subdominio? Callable por anon (el usuario aún no existe
-- cuando elige el slug en el formulario de registro). No revela datos de la org.
create or replace function public.slug_available(p_slug text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_slug text := lower(trim(p_slug));
begin
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then return false; end if;
  if public.is_reserved_slug(v_slug) then return false; end if;
  return not exists (select 1 from public.organizations where slug = v_slug);
end;
$$;

-- Crea la organización del usuario autenticado y lo asigna como owner.
-- Un usuario = una organización (el panel admin asume una sola membresía).
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_slug text := lower(trim(p_slug));
  v_name text := trim(p_name);
  v_org  uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if v_name = '' then
    raise exception 'El nombre de la organización es obligatorio' using errcode = '22023';
  end if;
  if exists (select 1 from public.memberships m where m.user_id = v_uid) then
    raise exception 'Ya perteneces a una organización' using errcode = 'P0001';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' or public.is_reserved_slug(v_slug) then
    raise exception 'Subdominio inválido' using errcode = '22023';
  end if;
  if exists (select 1 from public.organizations o where o.slug = v_slug) then
    raise exception 'Subdominio no disponible' using errcode = '23505';
  end if;

  insert into public.organizations (slug, name, status)
  values (v_slug, v_name, 'active')
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org, v_uid, 'owner');

  return v_org;
end;
$$;

revoke all on function public.slug_available(text) from public;
revoke all on function public.create_organization(text, text) from public;
grant execute on function public.slug_available(text) to anon, authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
