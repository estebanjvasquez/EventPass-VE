create or replace function public.get_public_event_sponsors(p_event_id uuid)
returns table(id uuid, name text, logo_url text)
language sql
security definer
set search_path = public
as $$
  select es.id, c.name, c.public_logo_url
  from public.event_sponsorships es
  join public.companies c on c.id = es.company_id
  join public.events e on e.id = es.event_id
  where es.event_id = p_event_id
    and e.status = 'published'
    and es.status in ('confirmed', 'active', 'fulfilled')
  order by es.created_at;
$$;

revoke all on function public.get_public_event_sponsors(uuid) from public;
grant execute on function public.get_public_event_sponsors(uuid) to anon, authenticated;
