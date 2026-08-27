-- Búsqueda unificada para acreditar registros clásicos y participantes de programas.
create or replace function public.search_event_badges(p_event_id uuid, p_query text)
returns table(id uuid, record_type text, first_name text, last_name text, cedula text, status text, attendance_status text, credential_token text, seat_label text)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_term text;
begin
  select organization_id into v_org from public.events where events.id=p_event_id;
  if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  v_term := '%' || replace(replace(trim(coalesce(p_query,'')),'%',''),'_','') || '%';
  return query
  select r.id,'registration'::text,r.first_name,r.last_name,r.cedula,r.status::text,r.attendance_status::text,r.credential_token,
    coalesce(s.seat_number,nullif(concat_ws('',s.row_label,s.column_number::text),''))
  from public.registrations r left join public.seats s on s.id=r.seat_id
  where r.event_id=p_event_id and (r.first_name ilike v_term or coalesce(r.last_name,'') ilike v_term or coalesce(r.cedula,'') ilike v_term)
  union all
  select ep.id,'participation'::text,pe.first_name,pe.last_name,pe.cedula,ep.status,
    case when exists(select 1 from public.checkin_records cr where cr.participation_id=ep.id and cr.result in ('allowed','validated')) then 'checked_in' else 'no_attendance' end,
    ep.credential_token,null::text
  from public.event_participations ep join public.people pe on pe.id=ep.person_id
  where ep.event_id=p_event_id and (pe.first_name ilike v_term or coalesce(pe.last_name,'') ilike v_term or coalesce(pe.cedula,'') ilike v_term)
  order by first_name,last_name limit 20;
end $$;
revoke all on function public.search_event_badges(uuid,text) from public;
grant execute on function public.search_event_badges(uuid,text) to authenticated;

create or replace function public.get_event_badge_by_token(p_token text)
returns table(id uuid, record_type text, first_name text, last_name text, cedula text, status text, attendance_status text, credential_token text, seat_label text)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select x.organization_id into v_org from (
    select r.organization_id from public.registrations r where r.credential_token=trim(p_token)
    union all
    select pr.organization_id from public.event_participations ep join public.event_programs pr on pr.id=ep.program_id where ep.credential_token=trim(p_token)
  ) x limit 1;
  if v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  return query
  select r.id,'registration'::text,r.first_name,r.last_name,r.cedula,r.status::text,r.attendance_status::text,r.credential_token,
    coalesce(s.seat_number,nullif(concat_ws('',s.row_label,s.column_number::text),''))
  from public.registrations r left join public.seats s on s.id=r.seat_id where r.credential_token=trim(p_token)
  union all
  select ep.id,'participation'::text,pe.first_name,pe.last_name,pe.cedula,ep.status,
    case when exists(select 1 from public.checkin_records cr where cr.participation_id=ep.id and cr.result in ('allowed','validated')) then 'checked_in' else 'no_attendance' end,
    ep.credential_token,null::text
  from public.event_participations ep join public.people pe on pe.id=ep.person_id where ep.credential_token=trim(p_token)
  limit 1;
end $$;
revoke all on function public.get_event_badge_by_token(text) from public;
grant execute on function public.get_event_badge_by_token(text) to authenticated;
