-- Datos legales y de facturación administrables por el organizador.
alter table public.companies
  add column if not exists legal_name text,
  add column if not exists tax_id text,
  add column if not exists fiscal_address text,
  add column if not exists billing_email text,
  add column if not exists billing_phone text,
  add column if not exists billing_contact text,
  add column if not exists website text,
  add column if not exists profile_notes text;

create index if not exists idx_companies_tax_id on public.companies(organization_id, tax_id);
