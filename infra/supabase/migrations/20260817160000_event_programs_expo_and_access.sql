-- EventPass VE — Programa de eventos, exposición, pases y operación onsite.
-- Esta migración amplía el modelo actual sin eliminar registrations ni seats.

create table if not exists public.event_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  venue_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  registration_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_event_programs_org on public.event_programs(organization_id, status);

create table if not exists public.program_events (
  program_id uuid not null references public.event_programs(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  component_type text not null default 'forum' check (component_type in ('forum','exhibition','session','other')),
  sort_order int not null default 0,
  primary key (program_id, event_id)
);

create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity int,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_sessions_event on public.event_sessions(event_id);

create table if not exists public.event_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  kind text not null default 'general' check (kind in ('general','exhibition','vip','backstage','security','forum')),
  capacity int,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  cedula text,
  company text,
  job_title text,
  city text,
  country text,
  profile_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, email)
);

create table if not exists public.event_participations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.event_programs(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  participation_type text not null check (participation_type in ('attendee','guest','vip','speaker','exhibitor','staff','security')),
  status text not null default 'approved' check (status in ('pending','approved','rejected','cancelled')),
  source text not null default 'public' check (source in ('public','admin','invite','import')),
  credential_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  unique(program_id, person_id, event_id, participation_type)
);
create index if not exists idx_participations_program on public.event_participations(program_id, event_id, status);

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.event_programs(id) on delete cascade,
  name text not null,
  access_mode text not null check (access_mode in ('program','day','session','zone')),
  is_public boolean not null default true,
  capacity int,
  created_at timestamptz not null default now()
);

create table if not exists public.pass_entitlements (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.passes(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  session_id uuid references public.event_sessions(id) on delete cascade,
  zone_id uuid references public.event_zones(id) on delete cascade,
  access_date date,
  check ((event_id is not null) or (session_id is not null) or (zone_id is not null) or (access_date is not null))
);

create table if not exists public.participation_passes (
  participation_id uuid not null references public.event_participations(id) on delete cascade,
  pass_id uuid not null references public.passes(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key(participation_id, pass_id)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  kind text not null default 'partner' check (kind in ('partner','sponsor','exhibitor','buyer')),
  external_reference text,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);

create table if not exists public.venue_maps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.venue_map_elements (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.venue_maps(id) on delete cascade,
  element_type text not null check (element_type in ('seat','stand','zone','stage','aisle','access_point')),
  label text not null,
  x numeric not null default 0,
  y numeric not null default 0,
  width numeric not null default 1,
  height numeric not null default 1,
  status text not null default 'available' check (status in ('available','reserved','assigned','blocked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(map_id, label)
);

create table if not exists public.booth_assignments (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null unique references public.venue_map_elements(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved','confirmed','cancelled')),
  external_reference text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.access_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  zone_id uuid references public.event_zones(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);

create table if not exists public.event_staff_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  access_point_id uuid references public.access_points(id) on delete cascade,
  permission text not null default 'checkin.perform' check (permission in ('checkin.perform','badges.print','participants.manage')),
  created_at timestamptz not null default now(),
  unique(user_id, event_id, access_point_id, permission)
);

create table if not exists public.checkin_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  participation_id uuid references public.event_participations(id) on delete set null,
  registration_id uuid references public.registrations(id) on delete set null,
  event_id uuid not null references public.events(id) on delete cascade,
  access_point_id uuid references public.access_points(id) on delete set null,
  result text not null check (result in ('allowed','denied','validated','checkout')),
  reason text,
  scanned_by uuid references auth.users(id) on delete set null,
  device_label text,
  created_at timestamptz not null default now(),
  check (participation_id is not null or registration_id is not null)
);
create index if not exists idx_checkin_records_event on public.checkin_records(event_id, created_at desc);

-- updated_at para entidades nuevas.
drop trigger if exists trg_program_updated on public.event_programs;
create trigger trg_program_updated before update on public.event_programs for each row execute function public.set_updated_at();
drop trigger if exists trg_people_updated on public.people;
create trigger trg_people_updated before update on public.people for each row execute function public.set_updated_at();

-- Registro público de un participante. Los perfiles internos no pueden crearse desde el navegador público.
create or replace function public.register_program_participant(
  p_program_id uuid, p_event_id uuid, p_pass_id uuid,
  p_first_name text, p_last_name text, p_email text, p_phone text,
  p_cedula text default null, p_company text default null, p_job_title text default null,
  p_city text default null, p_country text default null, p_participation_type text default 'attendee',
  p_profile_data jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_person uuid; v_part uuid; v_pass public.passes;
begin
  select organization_id into v_org from public.event_programs where id = p_program_id and status = 'published';
  if v_org is null then raise exception 'Programa no disponible' using errcode = 'check_violation'; end if;
  if p_participation_type not in ('attendee','guest','vip','speaker','exhibitor') then
    raise exception 'Perfil no disponible para registro público' using errcode = '42501';
  end if;
  select * into v_pass from public.passes where id = p_pass_id and program_id = p_program_id and is_public;
  if v_pass is null then raise exception 'Pase no disponible' using errcode = 'check_violation'; end if;
  if p_event_id is not null and not exists (select 1 from public.program_events where program_id = p_program_id and event_id = p_event_id) then
    raise exception 'Evento no pertenece al programa' using errcode = 'check_violation'; end if;
  insert into public.people (organization_id, first_name, last_name, email, phone, cedula, company, job_title, city, country, profile_data)
  values (v_org, trim(p_first_name), nullif(trim(p_last_name),''), lower(trim(p_email)), nullif(trim(p_phone),''), nullif(trim(p_cedula),''), nullif(trim(p_company),''), nullif(trim(p_job_title),''), nullif(trim(p_city),''), nullif(trim(p_country),''), coalesce(p_profile_data, '{}'::jsonb))
  on conflict (organization_id, email) do update set first_name=excluded.first_name, last_name=excluded.last_name, phone=excluded.phone, cedula=excluded.cedula, company=excluded.company, job_title=excluded.job_title, city=excluded.city, country=excluded.country, profile_data=excluded.profile_data
  returning id into v_person;
  insert into public.event_participations (program_id, person_id, event_id, participation_type, status, source)
  values (p_program_id, v_person, p_event_id, p_participation_type, case when p_participation_type in ('speaker','exhibitor','vip') then 'pending' else 'approved' end, 'public')
  on conflict (program_id, person_id, event_id, participation_type) do update set participation_type=excluded.participation_type
  returning id into v_part;
  insert into public.participation_passes(participation_id, pass_id) values (v_part, p_pass_id) on conflict do nothing;
  return v_part;
end $$;

-- Lectura pública mínima para construir el formulario. La escritura pública solo ocurre por RPC.
alter table public.event_programs enable row level security;
alter table public.program_events enable row level security;
alter table public.event_sessions enable row level security;
alter table public.event_zones enable row level security;
alter table public.people enable row level security;
alter table public.event_participations enable row level security;
alter table public.passes enable row level security;
alter table public.pass_entitlements enable row level security;
alter table public.participation_passes enable row level security;
alter table public.companies enable row level security;
alter table public.venue_maps enable row level security;
alter table public.venue_map_elements enable row level security;
alter table public.booth_assignments enable row level security;
alter table public.access_points enable row level security;
alter table public.event_staff_scopes enable row level security;
alter table public.checkin_records enable row level security;

drop policy if exists program_public_read on public.event_programs;
drop policy if exists program_member_all on public.event_programs;
drop policy if exists program_events_read on public.program_events;
drop policy if exists program_events_member_write on public.program_events;
drop policy if exists event_session_member_all on public.event_sessions;
drop policy if exists event_zone_member_all on public.event_zones;
drop policy if exists people_member_all on public.people;
drop policy if exists participation_member_all on public.event_participations;
drop policy if exists passes_public_read on public.passes;
drop policy if exists passes_member_all on public.passes;
drop policy if exists entitlement_member_all on public.pass_entitlements;
drop policy if exists participation_pass_member_all on public.participation_passes;
drop policy if exists companies_member_all on public.companies;
drop policy if exists maps_member_all on public.venue_maps;
drop policy if exists map_elements_member_all on public.venue_map_elements;
drop policy if exists booth_member_all on public.booth_assignments;
drop policy if exists access_point_member_all on public.access_points;
drop policy if exists staff_scope_member_all on public.event_staff_scopes;
drop policy if exists checkin_member_read on public.checkin_records;
drop policy if exists checkin_member_insert on public.checkin_records;

create policy program_public_read on public.event_programs for select to anon, authenticated using (status = 'published' or public.is_org_member(organization_id) or public.is_platform_admin());
create policy program_member_all on public.event_programs for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy program_events_read on public.program_events for select to anon, authenticated using (exists (select 1 from public.event_programs p where p.id=program_id and (p.status='published' or public.is_org_member(p.organization_id) or public.is_platform_admin())));
create policy program_events_member_write on public.program_events for all to authenticated using (exists (select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists (select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));

create policy event_session_member_all on public.event_sessions for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy event_zone_member_all on public.event_zones for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy people_member_all on public.people for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy participation_member_all on public.event_participations for all to authenticated using (exists (select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists (select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
create policy passes_public_read on public.passes for select to anon, authenticated using (is_public and exists(select 1 from public.event_programs p where p.id=program_id and p.status='published') or exists(select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
create policy passes_member_all on public.passes for all to authenticated using (exists(select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
create policy entitlement_member_all on public.pass_entitlements for all to authenticated using (exists(select 1 from public.passes pa join public.event_programs p on p.id=pa.program_id where pa.id=pass_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.passes pa join public.event_programs p on p.id=pa.program_id where pa.id=pass_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
create policy participation_pass_member_all on public.participation_passes for all to authenticated using (exists(select 1 from public.event_participations ep join public.event_programs p on p.id=ep.program_id where ep.id=participation_id and (public.is_org_member(p.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.event_participations ep join public.event_programs p on p.id=ep.program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
create policy companies_member_all on public.companies for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy maps_member_all on public.venue_maps for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy map_elements_member_all on public.venue_map_elements for all to authenticated using (exists(select 1 from public.venue_maps m where m.id=map_id and (public.is_org_member(m.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.venue_maps m where m.id=map_id and (public.is_org_member(m.organization_id) or public.is_platform_admin())));
create policy booth_member_all on public.booth_assignments for all to authenticated using (exists(select 1 from public.venue_map_elements e join public.venue_maps m on m.id=e.map_id where e.id=element_id and (public.is_org_member(m.organization_id) or public.is_platform_admin()))) with check (exists(select 1 from public.venue_map_elements e join public.venue_maps m on m.id=e.map_id where e.id=element_id and (public.is_org_member(m.organization_id) or public.is_platform_admin())));
create policy access_point_member_all on public.access_points for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy staff_scope_member_all on public.event_staff_scopes for all to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy checkin_member_read on public.checkin_records for select to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy checkin_member_insert on public.checkin_records for insert to authenticated with check (public.is_org_member(organization_id) or public.is_platform_admin());

grant execute on function public.register_program_participant(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
