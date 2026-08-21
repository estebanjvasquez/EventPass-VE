-- Comercial: paquetes, patrocinantes por evento, entregables y activaciones.
create table if not exists public.sponsorship_packages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, price numeric(12,2), currency text not null default 'USD', inventory int, benefits jsonb not null default '[]'::jsonb,
  is_active boolean not null default true, created_at timestamptz not null default now(), unique(organization_id,name)
);
create table if not exists public.event_sponsorships (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade, company_id uuid not null references public.companies(id) on delete restrict,
  package_id uuid references public.sponsorship_packages(id) on delete set null, status text not null default 'prospect' check(status in ('prospect','proposed','confirmed','active','fulfilled','cancelled')),
  agreed_amount numeric(12,2), currency text not null default 'USD', notes text, created_at timestamptz not null default now(), unique(event_id,company_id)
);
create table if not exists public.sponsorship_deliverables (
  id uuid primary key default gen_random_uuid(), event_sponsorship_id uuid not null references public.event_sponsorships(id) on delete cascade,
  name text not null, deliverable_type text not null default 'branding' check(deliverable_type in ('branding','stand','digital','hospitality','content','other')),
  status text not null default 'pending' check(status in ('pending','in_progress','delivered','cancelled')), due_at timestamptz, notes text
);
create table if not exists public.sponsorship_activations (
  id uuid primary key default gen_random_uuid(), event_sponsorship_id uuid not null references public.event_sponsorships(id) on delete cascade,
  session_id uuid references public.event_sessions(id) on delete set null, activation_type text not null check(activation_type in ('coffee_break','lunch','welcome','closing','session','other')),
  label text not null, placement text, starts_at timestamptz, ends_at timestamptz, status text not null default 'planned' check(status in ('planned','confirmed','delivered','cancelled')),
  notes text
);
create index if not exists idx_event_sponsorships_event on public.event_sponsorships(event_id,status);
create index if not exists idx_sponsorship_activations_event_sponsor on public.sponsorship_activations(event_sponsorship_id,activation_type);
grant select,insert,update,delete on public.sponsorship_packages,public.event_sponsorships,public.sponsorship_deliverables,public.sponsorship_activations to authenticated;
alter table public.sponsorship_packages enable row level security; alter table public.event_sponsorships enable row level security; alter table public.sponsorship_deliverables enable row level security; alter table public.sponsorship_activations enable row level security;
drop policy if exists sponsorship_packages_member_all on public.sponsorship_packages; drop policy if exists event_sponsorships_member_all on public.event_sponsorships; drop policy if exists sponsorship_deliverables_member_all on public.sponsorship_deliverables; drop policy if exists sponsorship_activations_member_all on public.sponsorship_activations;
create policy sponsorship_packages_member_all on public.sponsorship_packages for all to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin()) with check(public.is_org_member(organization_id) or public.is_platform_admin());
create policy event_sponsorships_member_all on public.event_sponsorships for all to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin()) with check(public.is_org_member(organization_id) or public.is_platform_admin());
create policy sponsorship_deliverables_member_all on public.sponsorship_deliverables for all to authenticated using(exists(select 1 from public.event_sponsorships s where s.id=event_sponsorship_id and (public.is_org_member(s.organization_id) or public.is_platform_admin()))) with check(exists(select 1 from public.event_sponsorships s where s.id=event_sponsorship_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())));
create policy sponsorship_activations_member_all on public.sponsorship_activations for all to authenticated using(exists(select 1 from public.event_sponsorships s where s.id=event_sponsorship_id and (public.is_org_member(s.organization_id) or public.is_platform_admin()))) with check(exists(select 1 from public.event_sponsorships s where s.id=event_sponsorship_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())));
