-- La referencia a name dentro de la subconsulta se resolvía como e.name
-- (nombre del evento) y no como storage.objects.name (ruta del archivo).
drop policy if exists event_landing_assets_org_insert on storage.objects;

create policy event_landing_assets_org_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'event-landing-assets'
  and exists (
    select 1
    from public.events e
    where e.organization_id::text = (storage.foldername(storage.objects.name))[1]
      and e.id::text = (storage.foldername(storage.objects.name))[2]
      and (public.is_org_member(e.organization_id) or public.is_platform_admin())
  )
);
