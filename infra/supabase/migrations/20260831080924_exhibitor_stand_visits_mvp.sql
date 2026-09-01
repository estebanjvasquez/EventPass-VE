-- MVP de captación de visitantes por stand.
-- El QR conserva únicamente credential_token; los datos personales se
-- resuelven dentro de RPC autorizadas y sólo se comparten con consentimiento.

create table if not exists public.participant_profile_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete cascade,
  participation_id uuid references public.event_participations(id) on delete cascade,
  share_with_exhibitors boolean not null default false,
  consent_source text not null default 'registration_form'
    check (consent_source in ('registration_form', 'credential_page')),
  granted_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((registration_id is not null)::integer + (participation_id is not null)::integer = 1)
);

create unique index if not exists participant_profile_consents_registration_uq
  on public.participant_profile_consents(registration_id)
  where registration_id is not null;
create unique index if not exists participant_profile_consents_participation_uq
  on public.participant_profile_consents(participation_id)
  where participation_id is not null;
create index if not exists participant_profile_consents_event_idx
  on public.participant_profile_consents(event_id, organization_id);

create table if not exists public.exhibitor_stand_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  element_id uuid not null references public.venue_map_elements(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete cascade,
  participation_id uuid references public.event_participations(id) on delete cascade,
  scanned_by uuid not null references auth.users(id) on delete restrict,
  device_label text,
  visited_at timestamptz not null default now(),
  check ((registration_id is not null)::integer + (participation_id is not null)::integer = 1)
);

create index if not exists exhibitor_stand_visits_company_time_idx
  on public.exhibitor_stand_visits(event_id, company_id, visited_at desc);
create index if not exists exhibitor_stand_visits_element_time_idx
  on public.exhibitor_stand_visits(element_id, visited_at desc);
create index if not exists exhibitor_stand_visits_registration_idx
  on public.exhibitor_stand_visits(registration_id, element_id, visited_at desc)
  where registration_id is not null;
create index if not exists exhibitor_stand_visits_participation_idx
  on public.exhibitor_stand_visits(participation_id, element_id, visited_at desc)
  where participation_id is not null;

alter table public.participant_profile_consents enable row level security;
alter table public.exhibitor_stand_visits enable row level security;

-- No se permite CRUD directo desde el navegador. Toda lectura y escritura se
-- realiza mediante las RPC inferiores, que validan usuario, tenant y evento.
revoke all on public.participant_profile_consents from public, anon, authenticated;
revoke all on public.exhibitor_stand_visits from public, anon, authenticated;

create or replace function public.set_exhibitor_profile_consent_by_token(
  p_credential_token text,
  p_share boolean,
  p_source text default 'credential_page'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations;
  v_participation public.event_participations;
  v_organization_id uuid;
  v_event_id uuid;
begin
  if length(trim(coalesce(p_credential_token, ''))) < 16 then
    raise exception 'Credencial no válida' using errcode = '22023';
  end if;
  if p_source not in ('registration_form', 'credential_page') then
    raise exception 'Origen de consentimiento no válido' using errcode = '22023';
  end if;

  select r.* into v_registration
  from public.registrations r
  where r.credential_token = trim(p_credential_token)
  limit 1;

  if v_registration.id is not null then
    v_organization_id := v_registration.organization_id;
    v_event_id := v_registration.event_id;
    delete from public.participant_profile_consents c
      where c.registration_id = v_registration.id;
    insert into public.participant_profile_consents(
      organization_id,event_id,registration_id,share_with_exhibitors,
      consent_source,granted_at,updated_at
    ) values (
      v_organization_id,v_event_id,v_registration.id,p_share,p_source,
      case when p_share then now() end,now()
    );
    return jsonb_build_object('saved', true, 'share_with_exhibitors', p_share);
  end if;

  select ep.* into v_participation
  from public.event_participations ep
  where ep.credential_token = trim(p_credential_token)
  limit 1;

  if v_participation.id is null or v_participation.event_id is null then
    raise exception 'Credencial no encontrada o sin evento asociado' using errcode = '22023';
  end if;
  select e.organization_id into v_organization_id
  from public.events e where e.id = v_participation.event_id;
  v_event_id := v_participation.event_id;

  delete from public.participant_profile_consents c
    where c.participation_id = v_participation.id;
  insert into public.participant_profile_consents(
    organization_id,event_id,participation_id,share_with_exhibitors,
    consent_source,granted_at,updated_at
  ) values (
    v_organization_id,v_event_id,v_participation.id,p_share,p_source,
    case when p_share then now() end,now()
  );
  return jsonb_build_object('saved', true, 'share_with_exhibitors', p_share);
end;
$$;

create or replace function public.get_exhibitor_assigned_stands(
  p_event_id uuid,
  p_company_id uuid
)
returns table(element_id uuid, label text, map_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para consultar los stands' using errcode = '42501';
  end if;
  select c.organization_id into v_organization_id
  from public.companies c
  where c.id = p_company_id and c.event_id = p_event_id and c.kind = 'exhibitor';
  if v_organization_id is null or not (
    exists(select 1 from public.exhibitor_portal_members m where m.event_id=p_event_id and m.company_id=p_company_id and m.user_id=(select auth.uid()) and m.status='active')
    or public.is_org_member(v_organization_id)
    or public.is_platform_admin()
  ) then
    raise exception 'No tienes permiso para consultar estos stands' using errcode = '42501';
  end if;
  return query
  select element.id, element.label, element.map_id
  from public.booth_assignments ba
  join public.venue_map_elements element on element.id = ba.element_id
  join public.venue_maps vm on vm.id = element.map_id
  where ba.company_id = p_company_id
    and ba.status <> 'cancelled'
    and vm.event_id = p_event_id
    and vm.organization_id = v_organization_id
  order by element.label;
end;
$$;

create or replace function public.get_exhibitor_profile_consent_by_token(
  p_credential_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_share boolean := false;
begin
  if length(trim(coalesce(p_credential_token, ''))) < 16 then
    return jsonb_build_object('found', false, 'share_with_exhibitors', false);
  end if;

  select coalesce(c.share_with_exhibitors, false) into v_share
  from public.registrations r
  left join public.participant_profile_consents c on c.registration_id = r.id
  where r.credential_token = trim(p_credential_token)
  limit 1;
  if found then
    return jsonb_build_object('found', true, 'share_with_exhibitors', coalesce(v_share, false));
  end if;

  select coalesce(c.share_with_exhibitors, false) into v_share
  from public.event_participations ep
  left join public.participant_profile_consents c on c.participation_id = ep.id
  where ep.credential_token = trim(p_credential_token)
  limit 1;
  return jsonb_build_object('found', found, 'share_with_exhibitors', coalesce(v_share, false));
end;
$$;

create or replace function public.scan_exhibitor_stand_badge(
  p_event_id uuid,
  p_company_id uuid,
  p_element_id uuid,
  p_credential_token text,
  p_device_label text default null
)
returns table(
  result text,
  reason text,
  profile_shared boolean,
  visitor_name text,
  visitor_company text,
  visitor_job_title text,
  visitor_email text,
  visit_count bigint,
  visited_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_registration public.registrations;
  v_participation public.event_participations;
  v_person public.people;
  v_registration_id uuid;
  v_participation_id uuid;
  v_profile_shared boolean := false;
  v_visited_at timestamptz;
  v_visit_count bigint;
  v_is_bounce boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para escanear visitantes' using errcode = '42501';
  end if;
  select c.organization_id into v_organization_id
  from public.companies c
  where c.id=p_company_id and c.event_id=p_event_id and c.kind='exhibitor';
  if v_organization_id is null or not (
    exists(select 1 from public.exhibitor_portal_members m where m.event_id=p_event_id and m.company_id=p_company_id and m.user_id=(select auth.uid()) and m.status='active')
    or public.is_org_member(v_organization_id)
    or public.is_platform_admin()
  ) then
    raise exception 'No tienes permiso para registrar visitas de este expositor' using errcode = '42501';
  end if;
  if not exists(
    select 1 from public.booth_assignments ba
    join public.venue_map_elements element on element.id=ba.element_id
    join public.venue_maps vm on vm.id=element.map_id
    where ba.company_id=p_company_id and ba.element_id=p_element_id
      and ba.status<>'cancelled' and vm.event_id=p_event_id
      and vm.organization_id=v_organization_id
  ) then
    raise exception 'El stand no está asignado a esta empresa y evento' using errcode = '42501';
  end if;

  select r.* into v_registration
  from public.registrations r
  where r.event_id=p_event_id and r.organization_id=v_organization_id
    and r.credential_token=trim(coalesce(p_credential_token,''))
  limit 1;
  if v_registration.id is not null then
    if v_registration.status <> 'confirmed' or v_registration.badge_cancelled_at is not null then
      return query select 'denied','La credencial no está activa.',false,null::text,null::text,null::text,null::text,0::bigint,now();
      return;
    end if;
    v_registration_id := v_registration.id;
    select coalesce(c.share_with_exhibitors,false) into v_profile_shared
    from public.participant_profile_consents c where c.registration_id=v_registration.id;
    v_profile_shared := coalesce(v_profile_shared,false);
  else
    select ep.* into v_participation
    from public.event_participations ep
    join public.event_programs program on program.id=ep.program_id
    where ep.event_id=p_event_id and program.organization_id=v_organization_id
      and ep.credential_token=trim(coalesce(p_credential_token,''))
    limit 1;
    if v_participation.id is null then
      return query select 'denied','El QR no corresponde a un participante de este evento.',false,null::text,null::text,null::text,null::text,0::bigint,now();
      return;
    end if;
    if v_participation.status <> 'approved' or v_participation.badge_cancelled_at is not null then
      return query select 'denied','La credencial no está activa.',false,null::text,null::text,null::text,null::text,0::bigint,now();
      return;
    end if;
    v_participation_id := v_participation.id;
    select p.* into v_person from public.people p where p.id=v_participation.person_id;
    select coalesce(c.share_with_exhibitors,false) into v_profile_shared
    from public.participant_profile_consents c where c.participation_id=v_participation.id;
    v_profile_shared := coalesce(v_profile_shared,false);
  end if;

  select exists(
    select 1 from public.exhibitor_stand_visits visit
    where visit.event_id=p_event_id and visit.company_id=p_company_id and visit.element_id=p_element_id
      and visit.visited_at > now() - interval '10 seconds'
      and ((v_registration_id is not null and visit.registration_id=v_registration_id)
        or (v_participation_id is not null and visit.participation_id=v_participation_id))
  ) into v_is_bounce;

  if not v_is_bounce then
    insert into public.exhibitor_stand_visits(
      organization_id,event_id,company_id,element_id,registration_id,
      participation_id,scanned_by,device_label
    ) values (
      v_organization_id,p_event_id,p_company_id,p_element_id,v_registration_id,
      v_participation_id,(select auth.uid()),left(nullif(trim(p_device_label),''),160)
    ) returning exhibitor_stand_visits.visited_at into v_visited_at;
  else
    select max(visit.visited_at) into v_visited_at
    from public.exhibitor_stand_visits visit
    where visit.event_id=p_event_id and visit.company_id=p_company_id and visit.element_id=p_element_id
      and ((v_registration_id is not null and visit.registration_id=v_registration_id)
        or (v_participation_id is not null and visit.participation_id=v_participation_id));
  end if;

  select count(*) into v_visit_count
  from public.exhibitor_stand_visits visit
  where visit.event_id=p_event_id and visit.company_id=p_company_id and visit.element_id=p_element_id
    and ((v_registration_id is not null and visit.registration_id=v_registration_id)
      or (v_participation_id is not null and visit.participation_id=v_participation_id));

  return query select
    case when v_is_bounce then 'duplicate_ignored' else 'recorded' end,
    case when v_is_bounce then 'Lectura repetida en menos de 10 segundos; no se duplicó la visita.' else 'Visita registrada correctamente.' end,
    v_profile_shared,
    case when v_profile_shared then trim(coalesce(v_registration.first_name,v_person.first_name,'') || ' ' || coalesce(v_registration.last_name,v_person.last_name,'')) end,
    case when v_profile_shared then coalesce(v_registration.company,v_person.company) end,
    case when v_profile_shared then coalesce(v_registration.job_title,v_person.job_title) end,
    case when v_profile_shared then coalesce(v_registration.email,v_person.email) end,
    v_visit_count,
    coalesce(v_visited_at,now());
end;
$$;

create or replace function public.get_exhibitor_stand_visitors(
  p_event_id uuid,
  p_company_id uuid,
  p_element_id uuid default null
)
returns table(
  visitor_key text,
  profile_shared boolean,
  visitor_name text,
  visitor_company text,
  visitor_job_title text,
  visitor_email text,
  first_visit timestamptz,
  last_visit timestamptz,
  visit_count bigint
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
  from public.companies c where c.id=p_company_id and c.event_id=p_event_id and c.kind='exhibitor';
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
      and ba.status<>'cancelled' and vm.event_id=p_event_id and vm.organization_id=v_organization_id
  ) then
    raise exception 'El stand no pertenece a este expositor' using errcode='42501';
  end if;

  return query
  with visits as (
    select visit.*,
      coalesce(consent.share_with_exhibitors,false) as can_share,
      coalesce(reg.first_name,person.first_name) as first_name,
      coalesce(reg.last_name,person.last_name) as last_name,
      coalesce(reg.company,person.company) as professional_company,
      coalesce(reg.job_title,person.job_title) as professional_job_title,
      coalesce(reg.email,person.email) as professional_email
    from public.exhibitor_stand_visits visit
    left join public.registrations reg on reg.id=visit.registration_id
    left join public.event_participations participation on participation.id=visit.participation_id
    left join public.people person on person.id=participation.person_id
    left join public.participant_profile_consents consent
      on consent.registration_id=visit.registration_id or consent.participation_id=visit.participation_id
    where visit.event_id=p_event_id and visit.company_id=p_company_id
      and (p_element_id is null or visit.element_id=p_element_id)
  )
  select
    case when visits.registration_id is not null then 'registration:'||visits.registration_id::text else 'participation:'||visits.participation_id::text end,
    bool_or(visits.can_share),
    case when bool_or(visits.can_share) then trim(max(visits.first_name)||' '||coalesce(max(visits.last_name),'')) end,
    case when bool_or(visits.can_share) then max(visits.professional_company) end,
    case when bool_or(visits.can_share) then max(visits.professional_job_title) end,
    case when bool_or(visits.can_share) then max(visits.professional_email) end,
    min(visits.visited_at),max(visits.visited_at),count(*)
  from visits
  group by visits.registration_id,visits.participation_id
  order by max(visits.visited_at) desc;
end;
$$;

revoke all on function public.set_exhibitor_profile_consent_by_token(text,boolean,text) from public, anon, authenticated;
revoke all on function public.get_exhibitor_profile_consent_by_token(text) from public, anon, authenticated;
revoke all on function public.get_exhibitor_assigned_stands(uuid,uuid) from public, anon, authenticated;
revoke all on function public.scan_exhibitor_stand_badge(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_exhibitor_stand_visitors(uuid,uuid,uuid) from public, anon, authenticated;

grant execute on function public.set_exhibitor_profile_consent_by_token(text,boolean,text) to anon, authenticated;
grant execute on function public.get_exhibitor_profile_consent_by_token(text) to anon, authenticated;
grant execute on function public.get_exhibitor_assigned_stands(uuid,uuid) to authenticated;
grant execute on function public.scan_exhibitor_stand_badge(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.get_exhibitor_stand_visitors(uuid,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
