create table if not exists public.public_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null check (scope in ('event','program')),
  event_id uuid unique references public.events(id) on delete cascade,
  program_id uuid unique references public.event_programs(id) on delete cascade,
  slug text unique,
  custom_hostname text unique,
  status text not null default 'draft' check (status in ('draft','active','disabled')),
  landing_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'event' and event_id is not null and program_id is null) or (scope = 'program' and program_id is not null and event_id is null))
);

create index if not exists idx_public_sites_org on public.public_sites(organization_id, status);
alter table public.public_sites enable row level security;
drop policy if exists public_sites_member_all on public.public_sites;
create policy public_sites_member_all on public.public_sites for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists public_sites_public_read on public.public_sites;
create policy public_sites_public_read on public.public_sites for select to anon, authenticated using (status = 'active');

drop trigger if exists trg_public_sites_updated on public.public_sites;
create trigger trg_public_sites_updated before update on public.public_sites for each row execute function public.set_updated_at();
