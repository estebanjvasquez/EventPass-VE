-- Imagenes publicas de landing, separadas por organizacion/evento.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-landing-assets',
  'event-landing-assets',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists event_landing_assets_org_insert on storage.objects;
create policy event_landing_assets_org_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'event-landing-assets'
  and exists (
    select 1
    from public.events e
    where e.organization_id::text = (storage.foldername(name))[1]
      and e.id::text = (storage.foldername(name))[2]
      and (public.is_org_member(e.organization_id) or public.is_platform_admin())
  )
);
