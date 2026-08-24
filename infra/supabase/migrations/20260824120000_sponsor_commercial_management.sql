-- Gestión comercial de patrocinantes: acuerdo, cobros parciales y cumplimiento.
alter table public.event_sponsorships
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_notes text,
  add column if not exists additional_amount numeric(12,2) not null default 0,
  add column if not exists agreement_details text,
  add column if not exists advertising_contribution text,
  add column if not exists print_requirements text,
  add column if not exists fulfillment_notes text;

do $$ begin
  alter table public.event_sponsorships drop constraint if exists event_sponsorships_payment_status_check;
  alter table public.event_sponsorships add constraint event_sponsorships_payment_status_check
    check (payment_status in ('unpaid','partial','paid','overdue','waived'));
exception when duplicate_object then null;
end $$;

alter table public.sponsorship_deliverables
  add column if not exists details text,
  add column if not exists quantity numeric(12,2),
  add column if not exists requires_print boolean not null default false,
  add column if not exists asset_url text,
  add column if not exists fulfilled_at timestamptz;

alter table public.sponsorship_deliverables drop constraint if exists sponsorship_deliverables_deliverable_type_check;
alter table public.sponsorship_deliverables add constraint sponsorship_deliverables_deliverable_type_check
  check (deliverable_type in ('branding','stand','digital','hospitality','content','print','other'));

create table if not exists public.sponsorship_payments (
  id uuid primary key default gen_random_uuid(),
  event_sponsorship_id uuid not null references public.event_sponsorships(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  payment_date date not null default current_date,
  reference text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sponsorship_payments_sponsor on public.sponsorship_payments(event_sponsorship_id, payment_date desc);
grant select,insert,update,delete on public.sponsorship_payments to authenticated;
alter table public.sponsorship_payments enable row level security;
drop policy if exists sponsorship_payments_member_all on public.sponsorship_payments;
create policy sponsorship_payments_member_all on public.sponsorship_payments
  for all to authenticated
  using (exists (select 1 from public.event_sponsorships s where s.id = event_sponsorship_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())))
  with check (exists (select 1 from public.event_sponsorships s where s.id = event_sponsorship_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())));
