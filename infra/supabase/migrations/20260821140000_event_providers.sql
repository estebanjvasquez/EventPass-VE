-- Directorio de proveedores y contratación por evento.
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, category text not null, description text, contact_name text, contact_email text, contact_phone text, website text,
  status text not null default 'active' check (status in ('active','inactive','preferred','blocked')), notes text, created_at timestamptz not null default now(), unique(organization_id,name)
);
create table if not exists public.provider_services (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.providers(id) on delete cascade,
  service_name text not null, description text, unit text, base_price numeric(12,2), currency text not null default 'USD', is_active boolean not null default true,
  created_at timestamptz not null default now(), unique(provider_id,service_name)
);
create table if not exists public.event_provider_assignments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade, provider_id uuid not null references public.providers(id) on delete restrict,
  service_id uuid references public.provider_services(id) on delete set null, status text not null default 'requested' check(status in ('requested','quoted','confirmed','in_progress','completed','cancelled')),
  agreed_amount numeric(12,2), currency text not null default 'USD', starts_at timestamptz, ends_at timestamptz, notes text, created_at timestamptz not null default now()
);
create index if not exists idx_providers_org_category on public.providers(organization_id,category,status);
create index if not exists idx_event_provider_assignments_event on public.event_provider_assignments(event_id,status);
grant select,insert,update,delete on public.providers,public.provider_services,public.event_provider_assignments to authenticated;
alter table public.providers enable row level security; alter table public.provider_services enable row level security; alter table public.event_provider_assignments enable row level security;
drop policy if exists providers_member_all on public.providers; drop policy if exists provider_services_member_all on public.provider_services; drop policy if exists event_provider_assignments_member_all on public.event_provider_assignments;
create policy providers_member_all on public.providers for all to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin()) with check(public.is_org_member(organization_id) or public.is_platform_admin());
create policy provider_services_member_all on public.provider_services for all to authenticated using(exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check(exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
create policy event_provider_assignments_member_all on public.event_provider_assignments for all to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin()) with check(public.is_org_member(organization_id) or public.is_platform_admin());
