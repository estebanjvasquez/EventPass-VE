-- Los logos de eventos pueden ser SVG; se conserva el límite y acceso vigentes.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml'
]
where id = 'event-landing-assets';
