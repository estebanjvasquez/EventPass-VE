-- Permite sustituir blueprints del plano sin que el bucket rechace formatos
-- admitidos por el editor. La autorización sigue dependiendo de la
-- organización del primer segmento de la ruta y de la membresía autenticada.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'application/dxf',
  'application/octet-stream',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]::text[]
where id = 'agenda-attachments';

drop policy if exists exhibition_blueprint_org_manage on storage.objects;
create policy exhibition_blueprint_org_manage on storage.objects
for all to authenticated
using (
  bucket_id = 'agenda-attachments'
  and (
    public.is_platform_admin()
    or exists (
      select 1 from public.organizations o
      where o.id::text = (storage.foldername(name))[1]
        and public.is_org_member(o.id)
    )
  )
)
with check (
  bucket_id = 'agenda-attachments'
  and (
    public.is_platform_admin()
    or exists (
      select 1 from public.organizations o
      where o.id::text = (storage.foldername(name))[1]
        and public.is_org_member(o.id)
    )
  )
);
