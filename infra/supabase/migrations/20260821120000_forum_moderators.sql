-- Moderadores múltiples por sesión, usando el mismo perfil editorial que ponentes.
alter table public.event_speakers add column if not exists profile_type text not null default 'speaker';
do $$ begin
  alter table public.event_speakers add constraint event_speakers_profile_type_check check (profile_type in ('speaker','moderator'));
exception when duplicate_object then null; end $$;
create index if not exists idx_event_speakers_type on public.event_speakers(event_id, profile_type, sort_order);

create table if not exists public.session_moderators (
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  moderator_id uuid not null references public.event_speakers(id) on delete cascade,
  sort_order int not null default 0,
  primary key (session_id, moderator_id)
);
grant select, insert, update, delete on public.session_moderators to authenticated;
alter table public.session_moderators enable row level security;
drop policy if exists session_moderators_member_all on public.session_moderators;
create policy session_moderators_member_all on public.session_moderators for all to authenticated
using (exists (select 1 from public.event_sessions s where s.id=session_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())))
with check (exists (select 1 from public.event_sessions s join public.event_speakers p on p.event_id=s.event_id where s.id=session_id and p.id=moderator_id and p.profile_type='moderator' and (public.is_org_member(s.organization_id) or public.is_platform_admin())));

create or replace function public.get_public_forum_agenda(p_event_id uuid)
returns table(event_name text,event_start timestamptz,event_end timestamptz,session_id uuid,session_name text,session_description text,session_type text,starts_at timestamptz,ends_at timestamptz,capacity int,stage_id uuid,stage_name text,venue_element_id uuid,speakers jsonb)
language sql stable security definer set search_path=public as $$
  select e.name,e.start_date,e.end_date,s.id,s.name,s.description,s.session_type,s.starts_at,s.ends_at,s.capacity,st.id,st.name,st.venue_element_id,
    coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'company',p.company,'position',p.position,'bio',p.bio,'photo_url',p.photo_url,'role','speaker') order by ss.sort_order) from public.session_speakers ss join public.event_speakers p on p.id=ss.speaker_id where ss.session_id=s.id),'[]'::jsonb)
    || coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'company',p.company,'position',p.position,'bio',p.bio,'photo_url',p.photo_url,'role','moderator') order by sm.sort_order) from public.session_moderators sm join public.event_speakers p on p.id=sm.moderator_id where sm.session_id=s.id),'[]'::jsonb)
  from public.events e join public.event_sessions s on s.event_id=e.id left join public.event_stages st on st.id=s.stage_id
  where e.id=p_event_id and e.status='published' order by s.starts_at,s.sort_order,s.name;
$$;
revoke all on function public.get_public_forum_agenda(uuid) from public;
grant execute on function public.get_public_forum_agenda(uuid) to anon, authenticated;
