-- Las subconsultas con organizations/venue_maps ocultaban la columna name
-- de storage.objects. Todas las políticas deben leer la ruta del objeto.
drop policy if exists agenda_content_org_manage on storage.objects;
create policy agenda_content_org_manage on storage.objects for all to authenticated
using (
  bucket_id in ('speaker-photos', 'agenda-attachments')
  and exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(storage.objects.name))[1]
      and (public.is_org_member(o.id) or public.is_platform_admin())
  )
)
with check (
  bucket_id in ('speaker-photos', 'agenda-attachments')
  and exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(storage.objects.name))[1]
      and (public.is_org_member(o.id) or public.is_platform_admin())
  )
);

drop policy if exists exhibition_blueprint_org_manage on storage.objects;
create policy exhibition_blueprint_org_manage on storage.objects for all to authenticated
using (
  bucket_id = 'agenda-attachments'
  and (public.is_platform_admin() or exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_org_member(o.id)
  ))
)
with check (
  bucket_id = 'agenda-attachments'
  and (public.is_platform_admin() or exists (
    select 1 from public.organizations o
    where o.id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_org_member(o.id)
  ))
);

drop policy if exists exhibitor_manual_org_manage on storage.objects;
create policy exhibitor_manual_org_manage on storage.objects for all to authenticated
using (
  bucket_id = 'agenda-attachments'
  and (public.is_platform_admin() or exists (
    select 1 from public.organizations o
    where o.id::text = split_part(storage.objects.name, '/', 1)
      and public.is_org_member(o.id)
  ))
)
with check (
  bucket_id = 'agenda-attachments'
  and (public.is_platform_admin() or exists (
    select 1 from public.organizations o
    where o.id::text = split_part(storage.objects.name, '/', 1)
      and public.is_org_member(o.id)
  ))
);

drop policy if exists public_published_floorplan_backgrounds on storage.objects;
create policy public_published_floorplan_backgrounds on storage.objects for select to anon, authenticated
using (
  bucket_id = 'agenda-attachments'
  and exists (
    select 1 from public.venue_maps m
    where m.published = true
      and m.event_id::text = split_part(storage.objects.name, '/', 2)
      and ('map-' || m.id::text) = split_part(storage.objects.name, '/', 3)
  )
);
