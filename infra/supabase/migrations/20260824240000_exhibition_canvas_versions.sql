-- Versiones y control de concurrencia del plano de exposición.
alter table public.venue_maps
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists current_version integer not null default 1;

create or replace function public.touch_venue_map_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_venue_maps_updated_at on public.venue_maps;
create trigger trg_venue_maps_updated_at
before update on public.venue_maps
for each row execute function public.touch_venue_map_updated_at();

create table if not exists public.venue_map_versions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.venue_maps(id) on delete cascade,
  version_number integer not null,
  label text not null default 'Guardado automático',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(map_id, version_number)
);

create index if not exists idx_venue_map_versions_map_created
  on public.venue_map_versions(map_id, created_at desc);

grant select, insert, update, delete on public.venue_map_versions to authenticated;
alter table public.venue_map_versions enable row level security;
drop policy if exists venue_map_versions_member_all on public.venue_map_versions;
create policy venue_map_versions_member_all on public.venue_map_versions
  for all to authenticated
  using (exists (
    select 1 from public.venue_maps m
    where m.id = map_id
      and (public.is_org_member(m.organization_id) or public.is_platform_admin())
  ))
  with check (exists (
    select 1 from public.venue_maps m
    where m.id = map_id
      and (public.is_org_member(m.organization_id) or public.is_platform_admin())
  ));
