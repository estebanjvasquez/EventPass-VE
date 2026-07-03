-- =====================================================================
-- Consola de superadmin: acceso de plataforma a los datos de todos los
-- clientes (organizaciones) y funciones de gestión.
--
-- Se añaden políticas RLS separadas (permisivas, se combinan con OR) para no
-- tocar las existentes: un platform admin ve/gestiona todo; el resto sigue
-- limitado por membresía.
-- =====================================================================

-- 1. ACCESO DE LECTURA/GESTIÓN PARA SUPERADMIN -----------------------
-- Gestión total sobre organizaciones y eventos.
drop policy if exists org_platform_all on public.organizations;
create policy org_platform_all on public.organizations
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists event_platform_all on public.events;
create policy event_platform_all on public.events
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Lectura de todo lo relacionado (participantes, asientos, pagos, equipo).
drop policy if exists mem_platform_read on public.memberships;
create policy mem_platform_read on public.memberships
  for select to authenticated using (public.is_platform_admin());

drop policy if exists sub_platform_read on public.subscriptions;
create policy sub_platform_read on public.subscriptions
  for select to authenticated using (public.is_platform_admin());

drop policy if exists reg_platform_read on public.registrations;
create policy reg_platform_read on public.registrations
  for select to authenticated using (public.is_platform_admin());

drop policy if exists seat_platform_read on public.seats;
create policy seat_platform_read on public.seats
  for select to authenticated using (public.is_platform_admin());

drop policy if exists pm_platform_read on public.payment_methods;
create policy pm_platform_read on public.payment_methods
  for select to authenticated using (public.is_platform_admin());

-- 2. RPCs DE AGREGACIÓN (listas de la consola) -----------------------
-- Lista de clientes con métricas. El guard is_platform_admin() evita fugas.
create or replace function public.admin_organizations()
returns table (
  id uuid, name text, slug text, custom_hostname text,
  plan public.org_plan, status public.org_status, created_at timestamptz,
  event_count bigint, member_count bigint, registration_count bigint,
  period_end timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    o.id, o.name, o.slug, o.custom_hostname, o.plan, o.status, o.created_at,
    (select count(*) from public.events e where e.organization_id = o.id and e.status <> 'archived'),
    (select count(*) from public.memberships m where m.organization_id = o.id),
    (select count(*) from public.registrations r where r.organization_id = o.id),
    (select max(s.current_period_end) from public.subscriptions s where s.organization_id = o.id)
  from public.organizations o
  where public.is_platform_admin()
  order by o.created_at desc;
$$;

-- Eventos de una organización con conteo de participantes.
create or replace function public.admin_org_events(p_org uuid)
returns table (
  id uuid, name text, status public.event_status,
  start_date timestamptz, total_slots int, registration_count bigint
)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.status, e.start_date, e.total_slots,
    (select count(*) from public.registrations r where r.event_id = e.id)
  from public.events e
  where public.is_platform_admin() and e.organization_id = p_org
  order by e.created_at desc;
$$;

-- Equipo de una organización (con correo desde auth.users).
create or replace function public.admin_org_members(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where public.is_platform_admin() and m.organization_id = p_org
  order by m.role, m.created_at;
$$;

-- 3. RPCs DE GESTIÓN DE CLIENTES -------------------------------------
-- Cambiar plan y/o estado de una organización (null = no cambiar).
create or replace function public.admin_set_organization(
  p_org uuid, p_plan public.org_plan default null, p_status public.org_status default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.organizations
    set plan = coalesce(p_plan, plan), status = coalesce(p_status, status)
    where id = p_org;
end $$;

-- 4. GESTIÓN DE SUPERADMINS ------------------------------------------
create or replace function public.admin_list_platform_admins()
returns table (user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select pa.user_id, u.email::text, pa.created_at
  from public.platform_admins pa join auth.users u on u.id = pa.user_id
  where public.is_platform_admin()
  order by pa.created_at;
$$;

-- Agrega un superadmin por correo. Devuelve true si el usuario existía.
create or replace function public.add_platform_admin(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.is_platform_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then return false; end if;
  insert into public.platform_admins (user_id) values (v_uid) on conflict do nothing;
  return true;
end $$;

create or replace function public.remove_platform_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if (select count(*) from public.platform_admins) <= 1 then
    raise exception 'Debe quedar al menos un superadmin';
  end if;
  delete from public.platform_admins where user_id = p_user;
end $$;

-- 5. GRANTS ----------------------------------------------------------
grant execute on function public.admin_organizations() to authenticated;
grant execute on function public.admin_org_events(uuid) to authenticated;
grant execute on function public.admin_org_members(uuid) to authenticated;
grant execute on function public.admin_set_organization(uuid, public.org_plan, public.org_status) to authenticated;
grant execute on function public.admin_list_platform_admins() to authenticated;
grant execute on function public.add_platform_admin(text) to authenticated;
grant execute on function public.remove_platform_admin(uuid) to authenticated;
