-- Personal operativo por evento y procedencia organizativa.
create table if not exists public.event_personnel (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade, full_name text not null, email text, phone text,
  role text not null default 'support', source_type text not null default 'organizer' check(source_type in ('organizer','provider','sponsor')),
  provider_id uuid references public.providers(id) on delete set null, sponsor_company_id uuid references public.companies(id) on delete set null,
  status text not null default 'active' check(status in ('active','inactive')), notes text, created_at timestamptz not null default now(),
  check ((source_type='provider' and provider_id is not null and sponsor_company_id is null) or (source_type='sponsor' and sponsor_company_id is not null and provider_id is null) or (source_type='organizer' and provider_id is null and sponsor_company_id is null))
);
create index if not exists idx_event_personnel_event_source on public.event_personnel(event_id,source_type,status);
grant select,insert,update,delete on public.event_personnel to authenticated;
alter table public.event_personnel enable row level security;
drop policy if exists event_personnel_member_all on public.event_personnel;
create policy event_personnel_member_all on public.event_personnel for all to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin()) with check(public.is_org_member(organization_id) or public.is_platform_admin());
