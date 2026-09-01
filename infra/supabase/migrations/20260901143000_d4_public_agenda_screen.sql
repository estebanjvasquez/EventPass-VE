-- D4: información pública para agenda en pantalla y cambios en vivo.
alter table public.event_sessions add column if not exists status text not null default 'scheduled';
do $$ begin
  alter table public.event_sessions add constraint event_sessions_public_status_check check (status in ('scheduled','cancelled','completed'));
exception when duplicate_object then null; end $$;

drop function if exists public.get_public_forum_agenda(uuid);

create or replace function public.get_public_forum_agenda(p_event_id uuid)
returns table(event_name text,event_start timestamptz,event_end timestamptz,event_branding jsonb,session_id uuid,session_name text,session_description text,session_type text,session_status text,starts_at timestamptz,ends_at timestamptz,capacity int,stage_id uuid,stage_name text,venue_element_id uuid,speakers jsonb,sponsors jsonb)
language sql stable security definer set search_path=public as $$
  select e.name,e.start_date,e.end_date,o.branding,s.id,s.name,s.description,s.session_type,s.status,s.starts_at,s.ends_at,s.capacity,st.id,st.name,st.venue_element_id,
    coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'company',p.company,'position',p.position,'bio',p.bio,'photo_url',p.photo_url,'role','speaker') order by ss.sort_order) from public.session_speakers ss join public.event_speakers p on p.id=ss.speaker_id where ss.session_id=s.id),'[]'::jsonb)
    || coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'company',p.company,'position',p.position,'bio',p.bio,'photo_url',p.photo_url,'role','moderator') order by sm.sort_order) from public.session_moderators sm join public.event_speakers p on p.id=sm.moderator_id where sm.session_id=s.id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('name',c.name,'activation_type',sp.activation_type) order by sp.sort_order) from public.session_sponsorships sp join public.event_sponsorships es on es.id=sp.event_sponsorship_id join public.companies c on c.id=es.company_id where sp.session_id=s.id and es.status in ('confirmed','active','fulfilled')),'[]'::jsonb)
  from public.events e join public.organizations o on o.id=e.organization_id join public.event_sessions s on s.event_id=e.id left join public.event_stages st on st.id=s.stage_id
  where e.id=p_event_id and e.status='published' order by s.starts_at,s.sort_order,s.name;
$$;
revoke all on function public.get_public_forum_agenda(uuid) from public;
grant execute on function public.get_public_forum_agenda(uuid) to anon,authenticated;
notify pgrst, 'reload schema';
