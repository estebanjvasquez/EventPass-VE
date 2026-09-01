-- Fase operativa simplificada: durante el evento los expositores autorizados
-- ven los datos profesionales de las credenciales válidas que escanean.
-- La captura de consentimiento posterior al evento queda fuera de esta versión.

alter function public.scan_exhibitor_stand_badge(uuid,uuid,uuid,text,text)
  rename to scan_exhibitor_stand_badge_with_live_consent;

revoke all on function public.scan_exhibitor_stand_badge_with_live_consent(uuid,uuid,uuid,text,text)
  from public, anon, authenticated;

create or replace function public.scan_exhibitor_stand_badge(
  p_event_id uuid,
  p_company_id uuid,
  p_element_id uuid,
  p_credential_token text,
  p_device_label text default null
)
returns table(
  result text, reason text, profile_shared boolean, visitor_name text,
  visitor_company text, visitor_job_title text, visitor_email text,
  visit_count bigint, visited_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first record;
  v_registration public.registrations;
  v_participation public.event_participations;
  v_person public.people;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para escanear visitantes' using errcode = '42501';
  end if;

  select * into v_first
  from public.scan_exhibitor_stand_badge_with_live_consent(
    p_event_id,p_company_id,p_element_id,p_credential_token,p_device_label
  );

  if v_first.result = 'denied' then
    return query select v_first.result,v_first.reason,false,null::text,null::text,
      null::text,null::text,v_first.visit_count,v_first.visited_at;
    return;
  end if;

  select r.* into v_registration
  from public.registrations r
  where r.event_id=p_event_id and r.credential_token=trim(p_credential_token)
  limit 1;

  if v_registration.id is not null then
    return query select v_first.result,v_first.reason,true,
      trim(coalesce(v_registration.first_name,'') || ' ' || coalesce(v_registration.last_name,'')),
      v_registration.company,v_registration.job_title,v_registration.email,
      v_first.visit_count,v_first.visited_at;
    return;
  end if;

  select ep.* into v_participation
  from public.event_participations ep
  where ep.event_id=p_event_id and ep.credential_token=trim(p_credential_token)
  limit 1;
  select p.* into v_person from public.people p where p.id=v_participation.person_id;

  return query select v_first.result,v_first.reason,true,
    trim(coalesce(v_person.first_name,'') || ' ' || coalesce(v_person.last_name,'')),
    v_person.company,v_person.job_title,v_person.email,
    v_first.visit_count,v_first.visited_at;
end;
$$;

create or replace function public.get_exhibitor_stand_visitors(
  p_event_id uuid,
  p_company_id uuid,
  p_element_id uuid default null
)
returns table(
  visitor_key text, profile_shared boolean, visitor_name text,
  visitor_company text, visitor_job_title text, visitor_email text,
  first_visit timestamptz, last_visit timestamptz, visit_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para consultar visitantes' using errcode = '42501';
  end if;
  select c.organization_id into v_organization_id
  from public.companies c
  where c.id=p_company_id and c.event_id=p_event_id and c.kind='exhibitor';
  if v_organization_id is null or not (
    exists(select 1 from public.exhibitor_portal_members m where m.event_id=p_event_id and m.company_id=p_company_id and m.user_id=(select auth.uid()) and m.status='active')
    or public.is_org_member(v_organization_id)
    or public.is_platform_admin()
  ) then
    raise exception 'No tienes permiso para consultar estos visitantes' using errcode = '42501';
  end if;
  if p_element_id is not null and not exists(
    select 1 from public.booth_assignments ba
    join public.venue_map_elements element on element.id=ba.element_id
    join public.venue_maps vm on vm.id=element.map_id
    where ba.company_id=p_company_id and ba.element_id=p_element_id
      and ba.status<>'cancelled' and vm.event_id=p_event_id
      and vm.organization_id=v_organization_id
  ) then
    raise exception 'El stand no pertenece a este expositor' using errcode='42501';
  end if;

  return query
  with visits as (
    select visit.*,
      coalesce(reg.first_name,person.first_name) as first_name,
      coalesce(reg.last_name,person.last_name) as last_name,
      coalesce(reg.company,person.company) as professional_company,
      coalesce(reg.job_title,person.job_title) as professional_job_title,
      coalesce(reg.email,person.email) as professional_email
    from public.exhibitor_stand_visits visit
    left join public.registrations reg on reg.id=visit.registration_id
    left join public.event_participations participation on participation.id=visit.participation_id
    left join public.people person on person.id=participation.person_id
    where visit.event_id=p_event_id and visit.company_id=p_company_id
      and (p_element_id is null or visit.element_id=p_element_id)
  )
  select
    case when visits.registration_id is not null then 'registration:'||visits.registration_id::text else 'participation:'||visits.participation_id::text end,
    true,
    trim(coalesce(max(visits.first_name),'')||' '||coalesce(max(visits.last_name),'')),
    max(visits.professional_company),max(visits.professional_job_title),
    max(visits.professional_email),min(visits.visited_at),max(visits.visited_at),count(*)
  from visits
  group by visits.registration_id,visits.participation_id
  order by max(visits.visited_at) desc;
end;
$$;

revoke all on function public.scan_exhibitor_stand_badge(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_exhibitor_stand_visitors(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.scan_exhibitor_stand_badge(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.get_exhibitor_stand_visitors(uuid,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
