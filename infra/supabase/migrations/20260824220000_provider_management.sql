-- Gestión ampliada de proveedores: contactos, personal, cotizaciones y pagos.
alter table public.providers
  add column if not exists legal_name text,
  add column if not exists tax_id text,
  add column if not exists fiscal_address text,
  add column if not exists billing_email text,
  add column if not exists billing_phone text,
  add column if not exists payment_terms text;

create table if not exists public.provider_contacts (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.providers(id) on delete cascade,
  full_name text not null, role text, email text, phone text, is_primary boolean not null default false, status text not null default 'active' check(status in ('active','inactive')), created_at timestamptz not null default now()
);
create table if not exists public.provider_staff (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.providers(id) on delete cascade,
  full_name text not null, email text, phone text, role text, status text not null default 'active' check(status in ('active','invited','inactive')), created_at timestamptz not null default now()
);
create table if not exists public.provider_quotes (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.providers(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade, service_id uuid references public.provider_services(id) on delete set null,
  amount numeric(12,2), currency text not null default 'USD', status text not null default 'requested' check(status in ('requested','submitted','accepted','rejected','expired')), requested_at timestamptz not null default now(), due_at timestamptz, proposal_path text, notes text
);
create table if not exists public.provider_payment_notices (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.providers(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null, amount numeric(12,2), currency text not null default 'USD', due_date date, status text not null default 'pending' check(status in ('pending','sent','paid','overdue')), sent_at timestamptz, notes text, created_at timestamptz not null default now()
);

create index if not exists idx_provider_contacts_provider on public.provider_contacts(provider_id);
create index if not exists idx_provider_staff_provider on public.provider_staff(provider_id);
create index if not exists idx_provider_quotes_provider_event on public.provider_quotes(provider_id,event_id,status);
create index if not exists idx_provider_payment_notices_provider on public.provider_payment_notices(provider_id,status);
grant select,insert,update,delete on public.provider_contacts,public.provider_staff,public.provider_quotes,public.provider_payment_notices to authenticated;
alter table public.provider_contacts enable row level security; alter table public.provider_staff enable row level security; alter table public.provider_quotes enable row level security; alter table public.provider_payment_notices enable row level security;

drop policy if exists provider_contacts_member_all on public.provider_contacts;
create policy provider_contacts_member_all on public.provider_contacts for all to authenticated using (exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
drop policy if exists provider_staff_member_all on public.provider_staff;
create policy provider_staff_member_all on public.provider_staff for all to authenticated using (exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
drop policy if exists provider_quotes_member_all on public.provider_quotes;
create policy provider_quotes_member_all on public.provider_quotes for all to authenticated using (exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
drop policy if exists provider_payment_notices_member_all on public.provider_payment_notices;
create policy provider_payment_notices_member_all on public.provider_payment_notices for all to authenticated using (exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.providers p where p.id=provider_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
