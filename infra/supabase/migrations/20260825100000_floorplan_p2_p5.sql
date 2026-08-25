-- P2-P5: comercializacion, publicacion, orientacion y analitica del plano.
alter table public.venue_maps
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz;

alter table public.venue_map_elements
  add column if not exists booth_type text,
  add column if not exists area_m2 numeric(12,2),
  add column if not exists price numeric(12,2),
  add column if not exists currency text not null default 'USD',
  add column if not exists public_visible boolean not null default true,
  add column if not exists tags text[] not null default '{}';

create table if not exists public.floor_plan_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2),
  currency text not null default 'USD',
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, name)
);

create table if not exists public.floor_plan_extras (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2),
  currency text not null default 'USD',
  quantity_limit integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);

create table if not exists public.floor_plan_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  map_element_id uuid not null references public.venue_map_elements(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  package_id uuid references public.floor_plan_packages(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','on_hold','reserved','confirmed','cancelled')),
  amount numeric(12,2),
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_floor_plan_reservations_event on public.floor_plan_reservations(event_id, status);

create table if not exists public.floor_plan_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  map_id uuid not null references public.venue_maps(id) on delete cascade,
  name text not null,
  kind text not null default 'normal' check (kind in ('normal','accessible','unidirectional')),
  geometry jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.floor_plan_analytics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  map_id uuid not null references public.venue_maps(id) on delete cascade,
  map_element_id uuid references public.venue_map_elements(id) on delete set null,
  event_type text not null check (event_type in ('view','search','select','route','favorite','qr_scan')),
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_floor_plan_analytics_map_time on public.floor_plan_analytics(map_id, created_at desc);

alter table public.floor_plan_packages enable row level security;
alter table public.floor_plan_extras enable row level security;
alter table public.floor_plan_reservations enable row level security;
alter table public.floor_plan_routes enable row level security;
alter table public.floor_plan_analytics enable row level security;

grant select, insert, update, delete on public.floor_plan_packages, public.floor_plan_extras, public.floor_plan_reservations, public.floor_plan_routes, public.floor_plan_analytics to authenticated;
grant select on public.venue_maps, public.venue_map_elements, public.floor_plan_routes to anon;
grant insert on public.floor_plan_analytics to anon;

drop policy if exists floor_plan_packages_member_all on public.floor_plan_packages;
create policy floor_plan_packages_member_all on public.floor_plan_packages for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists floor_plan_extras_member_all on public.floor_plan_extras;
create policy floor_plan_extras_member_all on public.floor_plan_extras for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists floor_plan_reservations_member_all on public.floor_plan_reservations;
create policy floor_plan_reservations_member_all on public.floor_plan_reservations for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists floor_plan_routes_member_all on public.floor_plan_routes;
create policy floor_plan_routes_member_all on public.floor_plan_routes for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists floor_plan_routes_public_read on public.floor_plan_routes;
create policy floor_plan_routes_public_read on public.floor_plan_routes for select to anon, authenticated
  using (exists (select 1 from public.venue_maps m where m.id = map_id and m.published = true));
drop policy if exists floor_plan_analytics_member_read on public.floor_plan_analytics;
create policy floor_plan_analytics_member_read on public.floor_plan_analytics for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists floor_plan_analytics_member_all on public.floor_plan_analytics;
create policy floor_plan_analytics_member_all on public.floor_plan_analytics for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists floor_plan_analytics_public_insert on public.floor_plan_analytics;
create policy floor_plan_analytics_public_insert on public.floor_plan_analytics for insert to anon, authenticated
  with check (exists (select 1 from public.venue_maps m where m.id = map_id and m.published = true));

drop policy if exists venue_maps_published_read on public.venue_maps;
create policy venue_maps_published_read on public.venue_maps for select to anon, authenticated using (published = true);
drop policy if exists venue_map_elements_published_read on public.venue_map_elements;
create policy venue_map_elements_published_read on public.venue_map_elements for select to anon, authenticated
  using (public_visible = true and visible = true and exists (select 1 from public.venue_maps m where m.id = map_id and m.published = true));

create or replace function public.publish_floor_plan(p_map_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.venue_maps m where m.id = p_map_id and (public.is_org_member(m.organization_id) or public.is_platform_admin())) then
    raise exception 'No tienes permisos para publicar este plano' using errcode = '42501';
  end if;
  update public.venue_maps set published = p_published, published_at = case when p_published then coalesce(published_at, now()) else null end where id = p_map_id;
end $$;
grant execute on function public.publish_floor_plan(uuid, boolean) to authenticated;
