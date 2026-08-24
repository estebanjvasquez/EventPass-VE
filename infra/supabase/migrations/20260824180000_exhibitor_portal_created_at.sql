-- Fecha de alta para ordenar y auditar los miembros del portal.
alter table public.exhibitor_portal_members
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_exhibitor_portal_members_created_at
  on public.exhibitor_portal_members(event_id, company_id, created_at);
