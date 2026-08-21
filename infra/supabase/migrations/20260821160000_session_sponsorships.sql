-- Patrocinantes por charla, taller o receso del programa.
create table if not exists public.session_sponsorships (
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  event_sponsorship_id uuid not null references public.event_sponsorships(id) on delete cascade,
  activation_type text not null default 'session' check(activation_type in ('session','coffee_break','lunch','welcome','closing','other')),
  sort_order int not null default 0,
  primary key(session_id,event_sponsorship_id)
);
grant select,insert,update,delete on public.session_sponsorships to authenticated;
alter table public.session_sponsorships enable row level security;
drop policy if exists session_sponsorships_member_all on public.session_sponsorships;
create policy session_sponsorships_member_all on public.session_sponsorships for all to authenticated using(exists(select 1 from public.event_sessions s join public.event_sponsorships es on es.event_id=s.event_id where s.id=session_id and es.id=event_sponsorship_id and (public.is_org_member(es.organization_id) or public.is_platform_admin()))) with check(exists(select 1 from public.event_sessions s join public.event_sponsorships es on es.event_id=s.event_id where s.id=session_id and es.id=event_sponsorship_id and (public.is_org_member(es.organization_id) or public.is_platform_admin())));
