-- New, explicitly defined funnel. Historical counters are not relabelled as visits.
alter table public.event_conversion_events add column if not exists legacy_funnel boolean not null default true;
alter table public.event_conversion_events alter column legacy_funnel set default false;
create table if not exists public.event_campaigns (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 event_id uuid not null references public.events(id),
 site_id uuid references public.public_sites(id),
 name text not null check(length(trim(name)) between 2 and 100),
 source text not null check(source in ('instagram','facebook','tiktok','linkedin','youtube','x','whatsapp','email','other')),
 medium text not null check(medium in ('social','paid_social','email','referral')),
 archived boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists event_campaigns_event_idx on public.event_campaigns(event_id);
create table if not exists public.event_funnel_visits (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 event_id uuid not null references public.events(id),
 program_id uuid references public.event_programs(id),
 campaign_id uuid references public.event_campaigns(id),
 campaign text, source text not null, medium text,
 created_at timestamptz not null default now(),
 landing_at timestamptz, form_at timestamptz, completed_at timestamptz,
 registration_id uuid unique references public.registrations(id),
 participation_id uuid unique references public.event_participations(id)
);
create index if not exists event_funnel_visits_event_time_idx on public.event_funnel_visits(event_id,created_at);
create index if not exists event_funnel_visits_campaign_idx on public.event_funnel_visits(campaign_id);
alter table public.event_campaigns enable row level security;
alter table public.event_funnel_visits enable row level security;
revoke all on public.event_campaigns,public.event_funnel_visits from anon,authenticated;
grant select on public.event_campaigns to authenticated;
grant all on public.event_campaigns,public.event_funnel_visits to service_role;
drop policy if exists campaign_member_read on public.event_campaigns;
create policy campaign_member_read on public.event_campaigns for select to authenticated
 using(public.is_org_member(organization_id) or public.is_platform_admin());

create or replace function public.event_promotion_destinations(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; result jsonb;
begin
 select * into e from public.events where id=p_event_id;
 if e.id is null or not(public.is_org_member(e.organization_id) or public.is_platform_admin()) then raise exception 'Sin permiso' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('site_id',s.id,'program_id',s.program_id,'url','https://' || coalesce(nullif(s.custom_hostname,''),s.slug||'.eventosfacil.net') || '/','label',case when s.program_id is null then 'Página del evento' else 'Página compartida: '||pr.name end)),'[]') into result
 from public.public_sites s left join public.event_programs pr on pr.id=s.program_id
 where s.organization_id=e.organization_id and s.status='active' and (nullif(s.custom_hostname,'') is not null or nullif(s.slug,'') is not null)
 and (s.event_id=e.id or exists(select 1 from public.program_events pe where pe.program_id=s.program_id and pe.event_id=e.id));
 if jsonb_array_length(result)=0 then result:=jsonb_build_array(jsonb_build_object('site_id',null,'program_id',null,'url','https://eventosfacil.net/evento/'||e.id,'label','Página principal del evento')); end if;
 return result;
end $$;

create or replace function public.create_event_campaign(p_event_id uuid,p_name text,p_source text,p_medium text,p_site_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events; result uuid;
begin
 select * into e from public.events where id=p_event_id;
 if e.id is null or auth.uid() is null or not(public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin()) then raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_site_id is not null and not exists(select 1 from public.public_sites s where s.id=p_site_id and s.organization_id=e.organization_id and s.status='active' and (s.event_id=e.id or exists(select 1 from public.program_events pe where pe.program_id=s.program_id and pe.event_id=e.id))) then raise exception 'Página no disponible para este evento'; end if;
 insert into public.event_campaigns(organization_id,event_id,site_id,name,source,medium) values(e.organization_id,e.id,p_site_id,trim(p_name),p_source,p_medium) returning id into result;
 return result;
end $$;
create or replace function public.archive_event_campaign(p_campaign_id uuid,p_archived boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.event_campaigns set archived=p_archived where id=p_campaign_id and auth.uid() is not null and (public.has_org_role(organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin());
 if not found then raise exception 'Sin permiso' using errcode='42501'; end if;
end $$;

create or replace function public.track_event_visit(p_visit_id uuid,p_event_id uuid,p_stage text,p_campaign text default null,p_source text default null,p_medium text default null,p_program_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare e public.events; c public.event_campaigns; v public.event_funnel_visits;
begin
 if p_visit_id is null or p_stage not in ('landing','form') then raise exception 'Medición inválida'; end if;
 select * into e from public.events where id=p_event_id and status='published';
 if e.id is null then raise exception 'Evento no disponible'; end if;
 if p_program_id is not null and not exists(select 1 from public.program_events pe join public.event_programs pr on pr.id=pe.program_id where pe.event_id=e.id and pr.id=p_program_id and pr.organization_id=e.organization_id and pr.status='published') then raise exception 'Programa ajeno al evento'; end if;
 select * into c from public.event_campaigns where id::text=p_campaign and event_id=e.id;
 insert into public.event_funnel_visits(id,organization_id,event_id,program_id,campaign_id,campaign,source,medium,landing_at,form_at)
 values(p_visit_id,e.organization_id,e.id,p_program_id,c.id,coalesce(c.id::text,nullif(left(trim(p_campaign),100),'')),coalesce(c.source,nullif(left(trim(p_source),100),''),'direct'),coalesce(c.medium,nullif(left(trim(p_medium),100),'')),case when p_stage='landing' then now() end,case when p_stage='form' then now() end)
 on conflict(id) do nothing;
 select * into v from public.event_funnel_visits where id=p_visit_id for update;
 if v.event_id<>e.id or v.program_id is distinct from p_program_id then raise exception 'Sesión de otro evento'; end if;
 -- First touch is immutable. A session is accepted for 30 minutes.
 if v.created_at < now()-interval '30 minutes' then return; end if;
 update public.event_funnel_visits set landing_at=case when p_stage='landing' and form_at is null then coalesce(landing_at,now()) else landing_at end,form_at=case when p_stage='form' then coalesce(form_at,now()) else form_at end where id=v.id;
end $$;

create or replace function public.register_event_attributed_purchase(p_event_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text,p_cedula text default null,p_seat_id uuid default null,p_category_id uuid default null,p_visit_id uuid default null)
returns table(registration_id uuid,registration_status public.registration_status,credential_token text,payment_required boolean)
language plpgsql security definer set search_path='' as $$
declare v public.event_funnel_visits; r record;
begin
 select * into v from public.event_funnel_visits where id=p_visit_id and event_id=p_event_id and program_id is null and created_at>=now()-interval '30 minutes' for update;
 select * into r from public.register_event_purchase(p_event_id,p_first_name,p_last_name,p_email,p_phone,p_cedula,p_seat_id,v.campaign,v.source,v.medium,p_category_id);
 if v.id is not null and v.completed_at is null then update public.event_funnel_visits set form_at=coalesce(form_at,now()),completed_at=now(),registration_id=r.registration_id where id=v.id; end if;
 return query select r.registration_id,r.registration_status,r.credential_token,r.payment_required;
end $$;

create or replace function public.register_program_attributed_participant(p_program_id uuid,p_event_id uuid,p_pass_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text,p_cedula text default null,p_company text default null,p_job_title text default null,p_city text default null,p_country text default null,p_participation_type text default 'attendee',p_profile_data jsonb default '{}',p_visit_id uuid default null)
returns table(participation_id uuid,credential_token text,participation_status text)
language plpgsql security definer set search_path='' as $$
declare v public.event_funnel_visits; r record;
begin
 select * into v from public.event_funnel_visits where id=p_visit_id and program_id=p_program_id and created_at>=now()-interval '30 minutes' for update;
 select * into r from public.register_program_participant(p_program_id,p_event_id,p_pass_id,p_first_name,p_last_name,p_email,p_phone,p_cedula,p_company,p_job_title,p_city,p_country,p_participation_type,p_profile_data);
 if v.id is not null and v.completed_at is null and exists(select 1 from public.event_participations ep where ep.id=r.participation_id and ep.created_at>=transaction_timestamp()) and not exists(select 1 from public.event_funnel_visits fv where fv.participation_id=r.participation_id) then
   update public.event_funnel_visits set form_at=coalesce(form_at,now()),completed_at=now(),participation_id=r.participation_id where id=v.id;
 end if;
 return query select r.participation_id,r.credential_token,r.participation_status;
end $$;

create or replace function public.get_event_campaign_dashboard(p_event_id uuid,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.events where id=p_event_id and (public.is_org_member(organization_id) or public.is_platform_admin())) then raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_from is not null and p_to is not null and p_from>=p_to then raise exception 'Periodo inválido'; end if;
 with cohort as (select * from public.event_funnel_visits where event_id=p_event_id and (p_from is null or created_at>=p_from) and (p_to is null or created_at<p_to)),
 grouped as (select campaign_id,campaign,source,medium,count(*) filter(where landing_at is not null) as visits,count(*) filter(where landing_at is not null and form_at is not null) as starts,count(*) filter(where landing_at is not null and completed_at is not null) as completions,count(*) filter(where landing_at is null and completed_at is not null) as form_only from cohort group by campaign_id,campaign,source,medium)
 select jsonb_build_object('totals',(select jsonb_build_object('visits',count(*) filter(where landing_at is not null),'starts',count(*) filter(where landing_at is not null and form_at is not null),'completions',count(*) filter(where landing_at is not null and completed_at is not null),'form_only',count(*) filter(where landing_at is null and completed_at is not null)) from cohort),
 'breakdown',coalesce((select jsonb_agg(to_jsonb(g)) from grouped g),'[]'),
 'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.event_campaigns c where c.event_id=p_event_id),'[]'),
 'legacy_events',(select count(*) from public.event_conversion_events where event_id=p_event_id and legacy_funnel),
 'tracking_since',(select min(created_at) from public.event_funnel_visits where event_id=p_event_id)) into result;
 return result;
end $$;

revoke all on function public.event_promotion_destinations(uuid),public.create_event_campaign(uuid,text,text,text,uuid),public.archive_event_campaign(uuid,boolean),public.get_event_campaign_dashboard(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.event_promotion_destinations(uuid),public.create_event_campaign(uuid,text,text,text,uuid),public.archive_event_campaign(uuid,boolean),public.get_event_campaign_dashboard(uuid,timestamptz,timestamptz) to authenticated;
revoke all on function public.track_event_visit(uuid,uuid,text,text,text,text,uuid),public.register_event_attributed_purchase(uuid,text,text,text,text,text,uuid,uuid,uuid),public.register_program_attributed_participant(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb,uuid) from public;
grant execute on function public.track_event_visit(uuid,uuid,text,text,text,text,uuid),public.register_event_attributed_purchase(uuid,text,text,text,text,text,uuid,uuid,uuid),public.register_program_attributed_participant(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb,uuid) to anon,authenticated;
notify pgrst,'reload schema';
