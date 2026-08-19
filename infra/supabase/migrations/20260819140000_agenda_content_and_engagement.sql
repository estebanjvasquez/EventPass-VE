-- EventPass VE — Fase 4 de agenda de foro.
-- Participación moderada por sesión y almacenamiento editorial por organización.

create table if not exists public.event_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid references public.event_sessions(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 140),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  publish_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_event_announcements_schedule on public.event_announcements(event_id, publish_at);

create table if not exists public.session_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 1 and 1000),
  author_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed', 'answered')),
  answer text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists idx_session_questions_moderation on public.session_questions(session_id, status, created_at);

create table if not exists public.session_polls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 1 and 500),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists idx_session_polls_session on public.session_polls(session_id, created_at desc);

create table if not exists public.session_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.session_polls(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 240),
  sort_order int not null default 0,
  unique (poll_id, sort_order)
);

grant select, insert, update, delete on public.event_announcements to authenticated;
grant select, insert, update, delete on public.session_questions to authenticated;
grant select, insert, update, delete on public.session_polls to authenticated;
grant select, insert, update, delete on public.session_poll_options to authenticated;

alter table public.event_announcements enable row level security;
alter table public.session_questions enable row level security;
alter table public.session_polls enable row level security;
alter table public.session_poll_options enable row level security;

drop policy if exists announcements_member_all on public.event_announcements;
create policy announcements_member_all on public.event_announcements for all to authenticated
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

drop policy if exists questions_member_all on public.session_questions;
create policy questions_member_all on public.session_questions for all to authenticated
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

drop policy if exists polls_member_all on public.session_polls;
create policy polls_member_all on public.session_polls for all to authenticated
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

drop policy if exists poll_options_member_all on public.session_poll_options;
create policy poll_options_member_all on public.session_poll_options for all to authenticated
using (exists (
  select 1 from public.session_polls p where p.id = poll_id
  and (public.is_org_member(p.organization_id) or public.is_platform_admin())
)) with check (exists (
  select 1 from public.session_polls p where p.id = poll_id
  and (public.is_org_member(p.organization_id) or public.is_platform_admin())
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('speaker-photos', 'speaker-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agenda-attachments', 'agenda-attachments', false, 10485760, array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists agenda_content_org_manage on storage.objects;
create policy agenda_content_org_manage on storage.objects for all to authenticated
using (bucket_id in ('speaker-photos','agenda-attachments') and exists (
  select 1 from public.organizations o where o.id::text = (storage.foldername(name))[1]
  and (public.is_org_member(o.id) or public.is_platform_admin())
)) with check (bucket_id in ('speaker-photos','agenda-attachments') and exists (
  select 1 from public.organizations o where o.id::text = (storage.foldername(name))[1]
  and (public.is_org_member(o.id) or public.is_platform_admin())
));
