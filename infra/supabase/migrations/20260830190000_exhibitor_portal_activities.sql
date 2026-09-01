-- Bitácora editable por cada empresa expositora dentro de su evento.
create table if not exists public.exhibitor_portal_activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 180),
  details text check (details is null or length(details) <= 4000),
  activity_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_exhibitor_portal_activities_company
  on public.exhibitor_portal_activities(event_id, company_id, activity_at desc);

alter table public.exhibitor_portal_activities enable row level security;
grant select, insert, update, delete on public.exhibitor_portal_activities to authenticated;

drop policy if exists exhibitor_portal_activities_access on public.exhibitor_portal_activities;
create policy exhibitor_portal_activities_access
on public.exhibitor_portal_activities
for all
to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = exhibitor_portal_activities.event_id
      and (public.is_org_member(e.organization_id) or public.is_platform_admin())
  )
  or exists (
    select 1 from public.exhibitor_portal_members m
    where m.event_id = exhibitor_portal_activities.event_id
      and m.company_id = exhibitor_portal_activities.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.events e
    where e.id = exhibitor_portal_activities.event_id
      and (public.is_org_member(e.organization_id) or public.is_platform_admin())
  )
  or exists (
    select 1 from public.exhibitor_portal_members m
    where m.event_id = exhibitor_portal_activities.event_id
      and m.company_id = exhibitor_portal_activities.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

notify pgrst, 'reload schema';
