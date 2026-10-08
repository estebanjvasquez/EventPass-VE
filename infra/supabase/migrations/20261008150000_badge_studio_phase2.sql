-- Badge Studio 2.0: historial de versiones y biblioteca de recursos gráficos.

create table if not exists public.badge_template_versions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  template_id uuid references public.badge_templates(id) on delete set null,
  participation_type text not null,
  version integer not null,
  status text not null check(status in ('draft','published','restored')),
  snapshot jsonb not null,
  saved_by uuid references auth.users(id) on delete set null,
  saved_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_badge_template_versions_event_type on public.badge_template_versions(event_id,participation_type,created_at desc);
alter table public.badge_template_versions enable row level security;
drop policy if exists badge_template_versions_member_read on public.badge_template_versions;
create policy badge_template_versions_member_read on public.badge_template_versions for select to authenticated
using(public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists badge_template_versions_member_insert on public.badge_template_versions;
create policy badge_template_versions_member_insert on public.badge_template_versions for insert to authenticated
with check((public.is_org_member(organization_id) or public.is_platform_admin()) and exists(select 1 from public.events event where event.id=event_id and event.organization_id=organization_id));
grant select,insert on public.badge_template_versions to authenticated;

create table if not exists public.badge_assets(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  public_url text not null,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes between 1 and 5242880),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_badge_assets_event on public.badge_assets(event_id,created_at desc);
alter table public.badge_assets enable row level security;
drop policy if exists badge_assets_member_read on public.badge_assets;
create policy badge_assets_member_read on public.badge_assets for select to authenticated
using(public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists badge_assets_member_write on public.badge_assets;
create policy badge_assets_member_write on public.badge_assets for all to authenticated
using(public.is_org_member(organization_id) or public.is_platform_admin())
with check((public.is_org_member(organization_id) or public.is_platform_admin()) and exists(select 1 from public.events event where event.id=event_id and event.organization_id=organization_id));
grant select,insert,delete on public.badge_assets to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('badge-assets','badge-assets',true,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists badge_assets_storage_member_manage on storage.objects;
create policy badge_assets_storage_member_manage on storage.objects for all to authenticated
using(
  bucket_id='badge-assets' and exists(
    select 1 from public.events event
    where event.organization_id::text=(storage.foldername(storage.objects.name))[1]
      and event.id::text=(storage.foldername(storage.objects.name))[2]
      and (public.is_org_member(event.organization_id) or public.is_platform_admin())
  )
)
with check(
  bucket_id='badge-assets' and exists(
    select 1 from public.events event
    where event.organization_id::text=(storage.foldername(storage.objects.name))[1]
      and event.id::text=(storage.foldername(storage.objects.name))[2]
      and (public.is_org_member(event.organization_id) or public.is_platform_admin())
  )
);

notify pgrst,'reload schema';
