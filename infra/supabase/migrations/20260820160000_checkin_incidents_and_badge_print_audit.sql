-- Operación onsite: incidencias de check-in e impresión/reimpresión auditada.
-- Ejecutar manualmente en Supabase SQL Editor antes de desplegar la interfaz.

create table if not exists public.checkin_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  access_point_id uuid references public.access_points(id) on delete set null,
  participation_id uuid references public.event_participations(id) on delete set null,
  category text not null check (category in ('credential_unreadable','duplicate','denied','manual_review','other')),
  notes text,
  status text not null default 'open' check (status in ('open','resolved')),
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_checkin_incidents_event_created
  on public.checkin_incidents(event_id, created_at desc);
create index if not exists idx_checkin_incidents_open
  on public.checkin_incidents(event_id, status) where status = 'open';

create table if not exists public.badge_print_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  participation_id uuid references public.event_participations(id) on delete set null,
  print_kind text not null check (print_kind in ('initial','reprint')),
  reason text,
  printed_by uuid references auth.users(id) on delete set null,
  device_label text,
  created_at timestamptz not null default now(),
  check ((registration_id is not null) or (participation_id is not null))
);

create index if not exists idx_badge_print_logs_event_created
  on public.badge_print_logs(event_id, created_at desc);

alter table public.checkin_incidents enable row level security;
alter table public.badge_print_logs enable row level security;

drop policy if exists checkin_incidents_member_all on public.checkin_incidents;
create policy checkin_incidents_member_all on public.checkin_incidents
  for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());

drop policy if exists badge_print_logs_member_read on public.badge_print_logs;
create policy badge_print_logs_member_read on public.badge_print_logs
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

drop policy if exists badge_print_logs_member_insert on public.badge_print_logs;
create policy badge_print_logs_member_insert on public.badge_print_logs
  for insert to authenticated
  with check (public.is_org_member(organization_id) or public.is_platform_admin());

grant select, insert, update on public.checkin_incidents to authenticated;
grant select, insert on public.badge_print_logs to authenticated;
