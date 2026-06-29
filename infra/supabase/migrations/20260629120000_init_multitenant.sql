-- EventPass VE — Esquema inicial multi-tenant
-- Modelo: una sola base de datos, aislamiento por organization_id + RLS.
-- Referencia de dominio: docs/ANÁLISIS_SISTEMA_REGISTRO_EVENTOS.md
-- Referencia multi-tenant: docs/ANALISIS_COSTO_CLOUDFLARE_SUPABASE.md §5

-- =====================================================================
-- 1. EXTENSIONES Y ENUMS
-- =====================================================================
create extension if not exists "pgcrypto";

create type public.org_plan          as enum ('arranque', 'profesional', 'asociacion');
create type public.org_status        as enum ('trial', 'active', 'suspended');
create type public.member_role       as enum ('owner', 'admin', 'staff');
create type public.event_type        as enum ('forum', 'workshop', 'social');
create type public.event_status      as enum ('draft', 'published', 'closed', 'archived');
create type public.registration_status as enum ('pending_payment', 'payment_submitted', 'confirmed', 'rejected');
create type public.seat_status       as enum ('available', 'reserved', 'confirmed');
create type public.attendance_status as enum ('no_attendance', 'checked_in');

-- =====================================================================
-- 2. UTILIDAD: updated_at automático
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- 3. TABLAS DE PLATAFORMA (tenant)
-- =====================================================================

-- Cada fila = un cliente/tenant. El subdominio (slug) y el custom_hostname
-- resuelven el tenant a partir del hostname de la petición.
create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,                 -- subdominio: <slug>.DOMINIO
  name            text not null,
  custom_hostname text unique,                          -- dominio propio (premium)
  plan            public.org_plan   not null default 'arranque',
  status          public.org_status not null default 'trial',
  branding        jsonb not null default '{}'::jsonb,   -- logo, colores, nombre comercial
  settings        jsonb not null default '{}'::jsonb,   -- plantillas, campos de formulario, etc.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.organizations (custom_hostname);

-- Relación usuario (auth.users) ↔ organización + rol.
create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.member_role not null default 'staff',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on public.memberships (user_id);
create index on public.memberships (organization_id);

-- Suscripción/plan contratado por la organización.
create table public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan            public.org_plan not null,
  status          text not null default 'active',       -- active, past_due, canceled
  current_period_end timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.subscriptions (organization_id);

-- =====================================================================
-- 4. FUNCIONES DE AUTORIZACIÓN (security definer evita recursión en RLS)
-- =====================================================================
create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(org uuid, roles public.member_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role = any(roles)
  );
$$;

-- =====================================================================
-- 5. TABLAS DE DOMINIO (todas con organization_id + RLS)
-- =====================================================================

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  event_type      public.event_type not null default 'forum',
  status          public.event_status not null default 'draft',
  start_date      timestamptz,
  end_date        timestamptz,
  registration_deadline timestamptz,
  payment_timeout_days  int not null default 10,
  total_slots     int not null default 0,
  config          jsonb not null default '{}'::jsonb,   -- campos del formulario, precios por tipo
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.events (organization_id);
create index on public.events (organization_id, status);

create table public.payment_methods (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id        uuid references public.events(id) on delete cascade,
  name            text not null,                        -- Zelle, Pago Móvil, Binance, etc.
  details         jsonb not null default '{}'::jsonb,   -- banco, cuenta, titular, email/wallet
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index on public.payment_methods (organization_id);
create index on public.payment_methods (event_id);

create table public.seats (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  row_label       text,
  column_number   int,
  seat_number     text,
  price           numeric(12,2),
  status          public.seat_status not null default 'available',
  created_at      timestamptz not null default now()
);
create index on public.seats (event_id);

create table public.registrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  first_name      text not null,
  last_name       text,
  email           text not null,
  phone           text,
  cedula          text,
  status          public.registration_status not null default 'pending_payment',
  seat_id         uuid references public.seats(id) on delete set null,
  payment_method  text,
  payment_amount  numeric(12,2),
  payment_currency text default 'USD',
  comprobante_path text,                                -- ruta en Storage/R2
  payment_submitted_at timestamptz,
  payment_confirmed_at timestamptz,
  rejection_reason text,
  payment_deadline timestamptz,
  attendance_status public.attendance_status not null default 'no_attendance',
  credential_token text unique default encode(gen_random_bytes(16), 'hex'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, email)
);
create index on public.registrations (organization_id);
create index on public.registrations (event_id, status);
create index on public.registrations (credential_token);

create table public.admin_actions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id),
  action          text not null,
  registration_id uuid references public.registrations(id) on delete set null,
  details         jsonb,
  created_at      timestamptz not null default now()
);
create index on public.admin_actions (organization_id);

create table public.email_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete cascade,
  email_type      text not null,
  status          text not null default 'queued',
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.email_log (organization_id);

-- triggers updated_at
create trigger trg_org_updated   before update on public.organizations  for each row execute function public.set_updated_at();
create trigger trg_sub_updated   before update on public.subscriptions  for each row execute function public.set_updated_at();
create trigger trg_event_updated before update on public.events         for each row execute function public.set_updated_at();
create trigger trg_reg_updated   before update on public.registrations  for each row execute function public.set_updated_at();

-- =====================================================================
-- 6. ROW-LEVEL SECURITY
-- =====================================================================
alter table public.organizations  enable row level security;
alter table public.memberships    enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.events         enable row level security;
alter table public.payment_methods enable row level security;
alter table public.seats          enable row level security;
alter table public.registrations  enable row level security;
alter table public.admin_actions  enable row level security;
alter table public.email_log      enable row level security;

-- ORGANIZATIONS ------------------------------------------------------
-- Lectura pública de orgs activas (la página del subdominio necesita branding/nombre).
create policy org_public_read on public.organizations
  for select to anon, authenticated
  using (status = 'active');
-- Miembros gestionan su propia organización.
create policy org_member_all on public.organizations
  for all to authenticated
  using (public.is_org_member(id))
  with check (public.is_org_member(id));

-- MEMBERSHIPS --------------------------------------------------------
-- Un usuario ve sus propias membresías.
create policy mem_self_read on public.memberships
  for select to authenticated
  using (user_id = auth.uid());
-- Owners/admins gestionan miembros de su organización.
create policy mem_admin_all on public.memberships
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

-- SUBSCRIPTIONS ------------------------------------------------------
create policy sub_member_read on public.subscriptions
  for select to authenticated
  using (public.is_org_member(organization_id));

-- EVENTS -------------------------------------------------------------
-- Público: solo eventos publicados.
create policy event_public_read on public.events
  for select to anon, authenticated
  using (status = 'published');
-- Miembros: control total de los eventos de su organización.
create policy event_member_all on public.events
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- PAYMENT_METHODS ----------------------------------------------------
-- Público: métodos activos (se muestran al pagador).
create policy pm_public_read on public.payment_methods
  for select to anon, authenticated
  using (is_active = true);
create policy pm_member_all on public.payment_methods
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- SEATS --------------------------------------------------------------
-- Público: ver disponibilidad de asientos.
create policy seat_public_read on public.seats
  for select to anon, authenticated
  using (true);
create policy seat_member_all on public.seats
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- REGISTRATIONS ------------------------------------------------------
-- Público: puede crear su registro en un evento publicado (organization_id debe
-- coincidir con el del evento). No hay lectura pública (privacidad).
create policy reg_public_insert on public.registrations
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and e.organization_id = registrations.organization_id
        and e.status = 'published'
    )
  );
-- Miembros: control total de los registros de su organización.
create policy reg_member_all on public.registrations
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ADMIN_ACTIONS ------------------------------------------------------
create policy aa_member_read on public.admin_actions
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy aa_member_insert on public.admin_actions
  for insert to authenticated
  with check (public.is_org_member(organization_id));

-- EMAIL_LOG ----------------------------------------------------------
create policy el_member_read on public.email_log
  for select to authenticated
  using (public.is_org_member(organization_id));

-- =====================================================================
-- Nota: el backend (Worker) usa el service-role key, que omite RLS para
-- tareas de sistema (cron de recordatorios, verificación por token, etc.).
-- =====================================================================
