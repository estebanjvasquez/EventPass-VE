-- Nómina operativa importable para proveedores y expositores.
alter table public.provider_staff add column if not exists identification text;

create table if not exists public.exhibitor_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  identification text,
  email text,
  phone text,
  role text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

create index if not exists idx_exhibitor_staff_company_event on public.exhibitor_staff(company_id, event_id);
grant select, insert, update, delete on public.exhibitor_staff to authenticated;
alter table public.exhibitor_staff enable row level security;

drop policy if exists exhibitor_staff_access on public.exhibitor_staff;
create policy exhibitor_staff_access on public.exhibitor_staff for all to authenticated
using (
  exists (select 1 from public.events e where e.id = exhibitor_staff.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin()))
  or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_staff.event_id and m.company_id = exhibitor_staff.company_id and m.user_id = auth.uid() and m.status = 'active')
)
with check (
  exists (select 1 from public.events e where e.id = exhibitor_staff.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin()))
  or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_staff.event_id and m.company_id = exhibitor_staff.company_id and m.user_id = auth.uid() and m.status = 'active')
);
