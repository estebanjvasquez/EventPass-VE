-- Fases 2 y 3: el alcance operativo también protege ingreso manual e impresión.
create or replace function public.manual_program_checkin(p_participation_id uuid, p_access_point_id uuid)
returns table(result text, participant_name text, reason text)
language plpgsql security definer set search_path = public as $$
declare v_part public.event_participations; v_point public.access_points; v_person public.people;
begin
  select * into v_part from public.event_participations where id=p_participation_id;
  select * into v_point from public.access_points where id=p_access_point_id;
  if v_part is null or v_point is null or v_part.event_id<>v_point.event_id or not public.has_event_staff_scope(v_point.event_id,v_point.id,'checkin.perform') then raise exception 'No tienes permiso de check-in en este punto' using errcode='42501'; end if;
  if coalesce((select (config->>'checkin_enabled')::boolean from public.events where id=v_point.event_id),true) is false then return query select 'disabled'::text,null::text,'El check-in está desactivado para este evento.'::text; return; end if;
  select * into v_person from public.people where id=v_part.person_id;
  if v_part.status<>'approved' then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Participación sin aprobar.'::text; return; end if;
  if exists(select 1 from public.checkin_records where participation_id=v_part.id and access_point_id=v_point.id and result in ('allowed','validated')) then return query select 'duplicate'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Ya fue validado en este punto.'::text; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(v_point.organization_id,v_part.id,v_point.event_id,v_point.id,'validated',auth.uid(),'manual');
  return query select 'allowed'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Ingreso manual registrado.'::text;
end $$;
revoke all on function public.manual_program_checkin(uuid,uuid) from public;
grant execute on function public.manual_program_checkin(uuid,uuid) to authenticated;

drop policy if exists badge_print_logs_member_insert on public.badge_print_logs;
create policy badge_print_logs_member_insert on public.badge_print_logs for insert to authenticated
  with check ((public.has_event_staff_scope(event_id,null,'badges.print') or public.is_platform_admin()) and (organization_id=(select organization_id from public.events where id=event_id)));
