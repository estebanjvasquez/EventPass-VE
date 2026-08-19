-- UX y reporte de check-in, sin aflojar las reglas de validación existentes.

create or replace function public.manual_program_checkin(p_participation_id uuid, p_access_point_id uuid)
returns table(result text, participant_name text, reason text)
language plpgsql security definer set search_path = public as $$
declare v_part public.event_participations; v_point public.access_points; v_person public.people;
begin
  select * into v_part from public.event_participations where id = p_participation_id;
  select * into v_point from public.access_points where id = p_access_point_id;
  if v_part is null or v_point is null or v_part.event_id <> v_point.event_id or not public.is_org_member(v_point.organization_id) then raise exception 'Participante o punto no disponible' using errcode = '42501'; end if;
  if coalesce((select (config->>'checkin_enabled')::boolean from public.events where id = v_point.event_id), true) is false then return query select 'disabled'::text, null::text, 'El check-in está desactivado para este evento.'::text; return; end if;
  select * into v_person from public.people where id = v_part.person_id;
  if v_part.status <> 'approved' then return query select 'denied'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name,'')), 'Participación sin aprobar.'::text; return; end if;
  if exists(select 1 from public.checkin_records where participation_id = v_part.id and access_point_id = v_point.id and result in ('allowed','validated')) then return query select 'duplicate'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name,'')), 'Ya fue validado en este punto.'::text; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(v_point.organization_id,v_part.id,v_point.event_id,v_point.id,'validated',auth.uid(),'manual');
  return query select 'allowed'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name,'')), 'Ingreso manual registrado.'::text;
end $$;
revoke all on function public.manual_program_checkin(uuid, uuid) from public;
grant execute on function public.manual_program_checkin(uuid, uuid) to authenticated;

create or replace function public.get_event_checkin_report(p_event_id uuid)
returns table(participation_id uuid, participant_name text, email text, status text, checked_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select ep.id, trim(pe.first_name || ' ' || coalesce(pe.last_name,'')), pe.email, ep.status,
    max(cr.created_at) filter (where cr.result in ('allowed','validated'))
  from public.event_participations ep join public.people pe on pe.id = ep.person_id
  left join public.checkin_records cr on cr.participation_id = ep.id
  where ep.event_id = p_event_id and exists(select 1 from public.events e where e.id=p_event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin()))
  group by ep.id, pe.id order by pe.first_name, pe.last_name;
$$;
revoke all on function public.get_event_checkin_report(uuid) from public;
grant execute on function public.get_event_checkin_report(uuid) to authenticated;
