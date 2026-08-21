-- Fase 1: equipo operativo por evento, punto de acceso y alcance.
-- Es aditiva: conserva asignaciones existentes y permite el acceso general del evento.

create or replace function public.has_event_staff_scope(
  p_event_id uuid,
  p_access_point_id uuid,
  p_permission text
) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_org_role(
    (select organization_id from public.events where id = p_event_id),
    array['owner','admin']::public.member_role[]
  )
  or exists (
    select 1
    from public.event_staff_scopes s
    where s.event_id = p_event_id
      and s.user_id = auth.uid()
      and s.permission = p_permission
      and (s.access_point_id is null or s.access_point_id = p_access_point_id)
  );
$$;

revoke all on function public.has_event_staff_scope(uuid, uuid, text) from public;
grant execute on function public.has_event_staff_scope(uuid, uuid, text) to authenticated;

-- El check-in de programa queda limitado al alcance checkin.perform.
create or replace function public.validate_program_checkin(
  p_credential_token text,
  p_access_point_id uuid,
  p_device_label text default null
) returns table(result text, participant_name text, reason text, event_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_point public.access_points; v_part public.event_participations; v_person public.people; v_allowed boolean;
begin
  select * into v_point from public.access_points where id = p_access_point_id;
  if v_point is null or not public.has_event_staff_scope(v_point.event_id, v_point.id, 'checkin.perform') then
    raise exception 'No tienes permiso de check-in en este punto de acceso' using errcode = '42501';
  end if;
  select ep.* into v_part from public.event_participations ep join public.people pe on pe.id=ep.person_id
    where ep.credential_token=trim(p_credential_token) and ep.event_id=v_point.event_id and pe.organization_id=v_point.organization_id limit 1;
  if v_part is null then return query select 'denied'::text,null::text,'Código no válido para este evento.'::text,v_point.event_id; return; end if;
  select * into v_person from public.people where id=v_part.person_id;
  if v_part.status <> 'approved' then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Participación sin aprobar.'::text,v_point.event_id; return; end if;
  select exists(select 1 from public.participation_passes pp join public.passes pa on pa.id=pp.pass_id join public.pass_entitlements en on en.pass_id=pa.id where pp.participation_id=v_part.id and (en.event_id=v_point.event_id or en.zone_id=v_point.zone_id or en.access_date=current_date)) into v_allowed;
  if not v_allowed then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'El pase no habilita este punto de acceso.'::text,v_point.event_id; return; end if;
  if exists(select 1 from public.checkin_records where participation_id=v_part.id and access_point_id=v_point.id and result in ('allowed','validated')) then return query select 'duplicate'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Este pase ya fue validado en este punto.'::text,v_point.event_id; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(v_point.organization_id,v_part.id,v_point.event_id,v_point.id,'allowed',auth.uid(),nullif(trim(p_device_label),''));
  return query select 'allowed'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Acceso autorizado.'::text,v_point.event_id;
end $$;

-- El check-in de sesión usa el mismo alcance, manteniendo el permiso de turno como segunda condición.
create or replace function public.validate_session_checkin(
  p_credential_token text, p_access_point_id uuid, p_session_id uuid, p_device_label text default null
) returns table(result text, participant_name text, reason text, remaining int)
language plpgsql security definer set search_path = public as $$
declare v_point public.access_points; v_session public.event_sessions; v_part public.event_participations; v_person public.people; v_remaining int;
begin
  select * into v_point from public.access_points where id=p_access_point_id; select * into v_session from public.event_sessions where id=p_session_id;
  if v_point is null or v_session is null or v_point.event_id<>v_session.event_id then raise exception 'Punto de acceso o sesión no disponibles' using errcode='42501'; end if;
  if not public.has_event_staff_scope(v_session.event_id,v_point.id,'checkin.perform') and not (public.has_org_role(v_session.organization_id,array['owner','admin']::public.member_role[]) or exists(select 1 from public.session_staff_assignments a where a.session_id=p_session_id and a.user_id=auth.uid() and a.responsibility in ('host','moderator','checkin'))) then raise exception 'No tienes permiso operativo para esta sesión' using errcode='42501'; end if;
  select ep.* into v_part from public.event_participations ep where ep.credential_token=trim(p_credential_token) and ep.event_id=v_session.event_id and ep.status='approved' limit 1;
  if v_part is null then return query select 'denied'::text,null::text,'Código no válido para esta sesión.'::text,null::int; return; end if;
  select * into v_person from public.people where id=v_part.person_id;
  if not exists(select 1 from public.participation_passes pp join public.passes pa on pa.id=pp.pass_id join public.pass_entitlements en on en.pass_id=pa.id where pp.participation_id=v_part.id and (en.session_id=p_session_id or en.event_id=v_session.event_id)) then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'El pase no habilita esta sesión.'::text,null::int; return; end if;
  if v_session.session_type='workshop' and not exists(select 1 from public.session_reservations r where r.session_id=p_session_id and r.participation_id=v_part.id and r.status in ('confirmed','checked_in')) then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Requiere una reserva confirmada para este taller.'::text,null::int; return; end if;
  if exists(select 1 from public.checkin_records where participation_id=v_part.id and access_point_id=v_point.id and result in ('allowed','validated')) then return query select 'duplicate'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Ya fue validado en este punto.'::text,null::int; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(v_session.organization_id,v_part.id,v_session.event_id,v_point.id,'validated',auth.uid(),nullif(trim(p_device_label),''));
  update public.session_reservations set status='checked_in',checked_in_at=now() where session_id=p_session_id and participation_id=v_part.id and status='confirmed';
  if v_session.capacity is not null then select greatest(v_session.capacity-count(*)::int,0) into v_remaining from public.session_reservations where session_id=p_session_id and status in ('confirmed','checked_in'); end if;
  return query select 'allowed'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Acceso a la sesión autorizado.'::text,v_remaining;
end $$;
