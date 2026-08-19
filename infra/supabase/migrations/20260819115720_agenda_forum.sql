-- EventPass VE — Fase 1 de agenda de foro.
-- Escenarios, perfiles de ponentes y relación M:N con sesiones.
-- Es idempotente y no modifica los pases, check-in ni sesiones existentes.

-- Los escenarios se crean antes de añadir la clave foránea desde event_sessions.
create table if not exists public.event_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  stream_url text,
  limit_video_access boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create index if not exists idx_event_stages_event_order
  on public.event_stages(event_id, sort_order);

-- Extensión incremental de sesiones. Los valores por defecto preservan el
-- comportamiento de las sesiones creadas por ProgramaAccesosAdmin.
alter table public.event_sessions
  add column if not exists session_type text not null default 'lecture',
  add column if not exists stage_id uuid references public.event_stages(id) on delete set null,
  add column if not exists stream_url text,
  add column if not exists meeting_url text,
  add column if not exists attachment_url text,
  add column if not exists limit_video_access boolean not null default false,
  add column if not exists sort_order int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_sessions_session_type_check'
      and conrelid = 'public.event_sessions'::regclass
  ) then
    alter table public.event_sessions
      add constraint event_sessions_session_type_check
      check (session_type in ('lecture', 'workshop', 'break'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_sessions_time_range_check'
      and conrelid = 'public.event_sessions'::regclass
  ) then
    alter table public.event_sessions
      add constraint event_sessions_time_range_check
      check (ends_at is null or starts_at is null or ends_at > starts_at);
  end if;
end $$;

create index if not exists idx_event_sessions_schedule
  on public.event_sessions(event_id, stage_id, starts_at);

-- Perfil editorial del ponente. Los contactos permanecen privados para los
-- administradores; la Fase 6 expondrá una vista pública sin datos sensibles.
create table if not exists public.event_speakers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  full_name text not null,
  company text,
  position text,
  bio text,
  photo_url text,
  email text,
  phone text,
  web text,
  linkedin text,
  facebook text,
  twitter text,
  instagram text,
  country text,
  language text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_speakers_event_order
  on public.event_speakers(event_id, sort_order);
create index if not exists idx_event_speakers_person
  on public.event_speakers(person_id)
  where person_id is not null;

-- Una sesión puede tener varios ponentes y un mismo ponente intervenir en
-- varias sesiones. sort_order define el orden de presentación.
create table if not exists public.session_speakers (
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  speaker_id uuid not null references public.event_speakers(id) on delete cascade,
  sort_order int not null default 0,
  primary key (session_id, speaker_id)
);

create index if not exists idx_session_speakers_speaker
  on public.session_speakers(speaker_id, sort_order);

-- Las tablas nuevas pueden estar expuestas por la Data API solo con permisos
-- explícitos. RLS define después qué filas puede leer o modificar cada rol.
grant select, insert, update, delete on public.event_stages to authenticated;
grant select, insert, update, delete on public.event_speakers to authenticated;
grant select, insert, update, delete on public.session_speakers to authenticated;

alter table public.event_stages enable row level security;
alter table public.event_speakers enable row level security;
alter table public.session_speakers enable row level security;

drop policy if exists stages_member_all on public.event_stages;
drop policy if exists speakers_member_all on public.event_speakers;
drop policy if exists session_speakers_member_all on public.session_speakers;

create policy stages_member_all on public.event_stages
  for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy speakers_member_all on public.event_speakers
  for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy session_speakers_member_all on public.session_speakers
  for all to authenticated
  using (
    exists (
      select 1
      from public.event_sessions s
      where s.id = session_id
        and (public.is_org_member(s.organization_id) or public.is_platform_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.event_sessions s
      where s.id = session_id
        and (public.is_org_member(s.organization_id) or public.is_platform_admin())
    )
  );

-- No se habilita lectura anónima directa todavía: event_sessions contiene URLs
-- de reunión y adjuntos, y event_speakers contiene email/teléfono. La agenda
-- pública de Fase 6 se expondrá mediante una vista de columnas seguras.
