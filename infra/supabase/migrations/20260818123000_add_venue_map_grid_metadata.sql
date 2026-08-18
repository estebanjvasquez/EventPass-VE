alter table public.venue_maps
  add column if not exists metadata jsonb not null default '{}'::jsonb;
