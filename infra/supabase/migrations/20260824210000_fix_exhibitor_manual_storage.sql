-- Permite al organizador y al superadmin cargar el manual del expositor.
-- La política anterior dependía de una evaluación de foldername que podía
-- rechazar rutas válidas con el primer segmento de la organización.
drop policy if exists exhibitor_manual_org_manage on storage.objects;
create policy exhibitor_manual_org_manage on storage.objects for all to authenticated
  using (bucket_id = 'agenda-attachments' and (public.is_platform_admin() or exists (
    select 1 from public.organizations o
    where o.id::text = split_part(name, '/', 1) and public.is_org_member(o.id)
  )))
  with check (bucket_id = 'agenda-attachments' and (public.is_platform_admin() or exists (
    select 1 from public.organizations o
    where o.id::text = split_part(name, '/', 1) and public.is_org_member(o.id)
  )));
