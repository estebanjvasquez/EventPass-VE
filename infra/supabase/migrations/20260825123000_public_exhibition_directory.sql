-- Expone únicamente el perfil público aprobado y su relación con el stand publicado.
create or replace view public.published_exhibition_directory
with (security_invoker = false)
as
select distinct
  e.id as element_id,
  c.id as company_id,
  c.name as company_name,
  c.public_logo_url as logo_url,
  c.public_description as description,
  c.public_category as category,
  c.public_social_links as social_links,
  c.public_contact_email as contact_email,
  c.public_contact_phone as contact_phone
from public.booth_assignments ba
join public.venue_map_elements e on e.id = ba.element_id
join public.venue_maps m on m.id = e.map_id and m.published = true
  join public.companies c on c.id = ba.company_id
where ba.status <> 'cancelled'
  and e.public_visible = true
  and e.visible = true
  and (c.public_profile_status = 'approved' or c.public_profile_status is null);

revoke all on public.published_exhibition_directory from anon, authenticated;
grant select on public.published_exhibition_directory to anon, authenticated;
