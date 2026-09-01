-- Mostrador de acreditación: lista de eventos con operación real y permisos explícitos.
create or replace function public.get_accreditation_event_options()
returns table(
  id uuid,
  name text,
  status text,
  total_participants bigint,
  ready_participants bigint,
  can_print boolean,
  can_configure boolean
)
language sql stable security definer set search_path = public as $$
  select
    e.id,
    e.name,
    e.status::text,
    coalesce(r.total, 0) + coalesce(p.total, 0),
    coalesce(r.ready, 0) + coalesce(p.ready, 0),
    public.has_event_staff_scope(e.id, null, 'badges.print') or public.is_platform_admin(),
    public.has_org_role(e.organization_id, array['owner','admin']::public.member_role[]) or public.is_platform_admin()
  from public.events e
  left join lateral (
    select count(*)::bigint as total,
      count(*) filter (where status = 'confirmed')::bigint as ready
    from public.registrations r
    where r.event_id = e.id and r.badge_cancelled_at is null
  ) r on true
  left join lateral (
    select count(*)::bigint as total,
      count(*) filter (where status = 'approved')::bigint as ready
    from public.event_participations ep
    where ep.event_id = e.id and ep.badge_cancelled_at is null
  ) p on true
  where e.status in ('published', 'closed')
    and (public.is_org_member(e.organization_id) or public.is_platform_admin())
  order by (coalesce(r.total, 0) + coalesce(p.total, 0)) desc, e.created_at desc;
$$;

-- El personal que imprime puede buscar o escanear; el resto no recibe PII del mostrador.
create or replace function public.search_event_badges(p_event_id uuid, p_query text)
returns table(id uuid, record_type text, first_name text, last_name text, cedula text, company text, job_title text, participation_type text, status text, attendance_status text, credential_token text, seat_label text, badge_cancelled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_term text;
begin
  select organization_id into v_org from public.events where events.id=p_event_id;
  if v_org is null or not (public.has_event_staff_scope(p_event_id, null, 'badges.print') or public.is_platform_admin()) then raise exception 'No tienes permiso para acreditar e imprimir en este evento' using errcode='42501'; end if;
  v_term := '%' || replace(replace(trim(coalesce(p_query,'')),'%',''),'_','') || '%';
  return query
  select r.id,'registration'::text,r.first_name,r.last_name,r.cedula,r.company,r.job_title,r.participation_type,r.status::text,r.attendance_status::text,r.credential_token,
    coalesce(s.seat_number,nullif(concat_ws('',s.row_label,s.column_number::text),'')),r.badge_cancelled_at
  from public.registrations r left join public.seats s on s.id=r.seat_id
  where r.event_id=p_event_id and (r.first_name ilike v_term or coalesce(r.last_name,'') ilike v_term or coalesce(r.cedula,'') ilike v_term or r.email ilike v_term or coalesce(r.company,'') ilike v_term)
  union all
  select ep.id,'participation'::text,pe.first_name,pe.last_name,pe.cedula,pe.company,pe.job_title,ep.participation_type,ep.status,
    case when exists(select 1 from public.checkin_records cr where cr.participation_id=ep.id and cr.result in ('allowed','validated')) then 'checked_in' else 'no_attendance' end,
    ep.credential_token,null::text,ep.badge_cancelled_at
  from public.event_participations ep join public.people pe on pe.id=ep.person_id
  where ep.event_id=p_event_id and (pe.first_name ilike v_term or coalesce(pe.last_name,'') ilike v_term or coalesce(pe.cedula,'') ilike v_term or coalesce(pe.email,'') ilike v_term or coalesce(pe.company,'') ilike v_term)
  order by first_name,last_name limit 30;
end $$;

create or replace function public.get_event_badge_by_token(p_token text)
returns table(id uuid, record_type text, first_name text, last_name text, cedula text, company text, job_title text, participation_type text, status text, attendance_status text, credential_token text, seat_label text, badge_cancelled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_event uuid;
begin
  select x.organization_id, x.event_id into v_org, v_event from (
    select r.organization_id, r.event_id from public.registrations r where r.credential_token=trim(p_token)
    union all
    select pr.organization_id, ep.event_id from public.event_participations ep join public.event_programs pr on pr.id=ep.program_id where ep.credential_token=trim(p_token)
  ) x limit 1;
  if v_org is null or not (public.has_event_staff_scope(v_event, null, 'badges.print') or public.is_platform_admin()) then raise exception 'No tienes permiso para acreditar e imprimir en este evento' using errcode='42501'; end if;
  return query
  select r.id,'registration'::text,r.first_name,r.last_name,r.cedula,r.company,r.job_title,r.participation_type,r.status::text,r.attendance_status::text,r.credential_token,
    coalesce(s.seat_number,nullif(concat_ws('',s.row_label,s.column_number::text),'')),r.badge_cancelled_at
  from public.registrations r left join public.seats s on s.id=r.seat_id where r.credential_token=trim(p_token)
  union all
  select ep.id,'participation'::text,pe.first_name,pe.last_name,pe.cedula,pe.company,pe.job_title,ep.participation_type,ep.status,
    case when exists(select 1 from public.checkin_records cr where cr.participation_id=ep.id and cr.result in ('allowed','validated')) then 'checked_in' else 'no_attendance' end,
    ep.credential_token,null::text,ep.badge_cancelled_at
  from public.event_participations ep join public.people pe on pe.id=ep.person_id where ep.credential_token=trim(p_token)
  limit 1;
end $$;

-- Las plantillas son visibles para el personal de acreditación, pero solo owner/admin puede modificarlas.
drop policy if exists badge_templates_member_all on public.badge_templates;
drop policy if exists badge_templates_member_read on public.badge_templates;
drop policy if exists badge_templates_admin_manage on public.badge_templates;
create policy badge_templates_member_read on public.badge_templates for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy badge_templates_admin_manage on public.badge_templates for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]) or public.is_platform_admin())
  with check (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]) or public.is_platform_admin());

revoke all on function public.get_accreditation_event_options() from public, anon;
grant execute on function public.get_accreditation_event_options() to authenticated;
revoke all on function public.search_event_badges(uuid,text) from public, anon;
revoke all on function public.get_event_badge_by_token(text) from public, anon;
grant execute on function public.search_event_badges(uuid,text), public.get_event_badge_by_token(text) to authenticated;
