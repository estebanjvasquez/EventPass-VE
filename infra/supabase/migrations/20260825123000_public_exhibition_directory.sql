-- Expone únicamente nombre de empresa y relación con el stand publicado.
-- No se exponen contactos, teléfonos ni datos fiscales.
create or replace view public.published_exhibition_directory
with (security_invoker = false)
as
select distinct
  e.id as element_id,
  c.id as company_id,
  c.name as company_name
from public.booth_assignments ba
join public.venue_map_elements e on e.id = ba.element_id
join public.venue_maps m on m.id = e.map_id and m.published = true
join public.companies c on c.id = ba.company_id
where ba.status <> 'cancelled'
  and e.public_visible = true
  and e.visible = true;

revoke all on public.published_exhibition_directory from anon, authenticated;
grant select on public.published_exhibition_directory to anon, authenticated;
