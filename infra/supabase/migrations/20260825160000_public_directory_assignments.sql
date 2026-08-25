-- Una asignación confirmada debe ser visible en el plano aunque el perfil
-- comercial todavía no haya sido revisado. Los datos enriquecidos siguen
-- protegidos y sólo aparecen cuando el perfil está aprobado.
create or replace view public.published_exhibition_directory
with (security_invoker = false)
as
select distinct
  e.id as element_id,
  c.id as company_id,
  c.name as company_name,
  case when c.public_profile_status = 'approved' then c.public_logo_url end as logo_url,
  case when c.public_profile_status = 'approved' then c.public_description end as description,
  case when c.public_profile_status = 'approved' then c.public_category end as category,
  case when c.public_profile_status = 'approved' then c.public_social_links else '{}'::jsonb end as social_links,
  case when c.public_profile_status = 'approved' then c.public_contact_email end as contact_email,
  case when c.public_profile_status = 'approved' then c.public_contact_phone end as contact_phone
from public.booth_assignments ba
join public.venue_map_elements e on e.id = ba.element_id
join public.venue_maps m on m.id = e.map_id and m.published = true
join public.companies c on c.id = ba.company_id
where ba.status <> 'cancelled'
  and e.public_visible = true
  and e.visible = true;

revoke all on public.published_exhibition_directory from anon, authenticated;
grant select on public.published_exhibition_directory to anon, authenticated;
