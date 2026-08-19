-- EventPass VE — Fase 6: agenda pública con datos mínimos seguros.

alter table public.event_stages
  add column if not exists venue_element_id uuid references public.venue_map_elements(id) on delete set null;

create or replace function public.get_public_forum_agenda(p_event_id uuid)
returns table(
  event_name text,
  event_start timestamptz,
  event_end timestamptz,
  session_id uuid,
  session_name text,
  session_description text,
  session_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity int,
  stage_id uuid,
  stage_name text,
  venue_element_id uuid,
  speakers jsonb
)
language sql stable security definer set search_path = public as $$
  select e.name, e.start_date, e.end_date,
    s.id, s.name, s.description, s.session_type, s.starts_at, s.ends_at, s.capacity,
    st.id, st.name, st.venue_element_id,
    coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'full_name', sp.full_name, 'company', sp.company, 'position', sp.position, 'bio', sp.bio, 'photo_url', sp.photo_url)) filter (where sp.id is not null), '[]'::jsonb)
  from public.events e
  join public.event_sessions s on s.event_id = e.id
  left join public.event_stages st on st.id = s.stage_id
  left join public.session_speakers ss on ss.session_id = s.id
  left join public.event_speakers sp on sp.id = ss.speaker_id
  where e.id = p_event_id and e.status = 'published'
  group by e.id, e.name, e.start_date, e.end_date, s.id, st.id
  order by s.starts_at, s.sort_order, s.name;
$$;
revoke all on function public.get_public_forum_agenda(uuid) from public;
grant execute on function public.get_public_forum_agenda(uuid) to anon, authenticated;
