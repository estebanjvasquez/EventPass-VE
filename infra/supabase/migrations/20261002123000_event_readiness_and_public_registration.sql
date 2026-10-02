-- Validaciones unificadas de lanzamiento y registro público.

alter view public.published_exhibition_directory
  set (security_invoker = true);

revoke all on public.published_exhibition_directory from anon, authenticated;

create or replace function public.get_published_exhibition_directory(p_event_id uuid)
returns table(element_id uuid, company_id uuid, company_name text, logo_url text, description text, category text, social_links jsonb, contact_email text, contact_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    element.id,
    company.id,
    company.name,
    case when company.public_profile_status='approved' then company.public_logo_url end,
    case when company.public_profile_status='approved' then company.public_description end,
    case when company.public_profile_status='approved' then company.public_category end,
    case when company.public_profile_status='approved' then company.public_social_links else '{}'::jsonb end,
    case when company.public_profile_status='approved' then company.public_contact_email end,
    case when company.public_profile_status='approved' then company.public_contact_phone end
  from public.booth_assignments assignment
  join public.venue_map_elements element on element.id=assignment.element_id
  join public.venue_maps map on map.id=element.map_id and map.published=true
  join public.events event on event.id=map.event_id and event.status='published'
  join public.companies company on company.id=assignment.company_id
  where map.event_id=p_event_id and assignment.status<>'cancelled'
    and element.public_visible and element.visible;
$$;

revoke all on function public.get_published_exhibition_directory(uuid) from public;
grant execute on function public.get_published_exhibition_directory(uuid) to anon, authenticated;

create or replace function public.get_event_launch_readiness(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_checks jsonb := '[]'::jsonb;
  v_paid boolean;
  v_categories boolean;
  v_price_known boolean;
  v_payment_methods boolean;
  v_sessions_outside integer;
  v_public_passes integer;
  v_contact_forms integer;
  v_public_links integer;
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then raise exception 'Evento no encontrado'; end if;
  if not (public.is_org_member(e.organization_id) or public.is_platform_admin()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;

  v_paid := coalesce(e.config->>'registration_mode', 'paid') = 'paid';
  v_categories := coalesce((e.config->>'ticket_categories_enabled')::boolean, false);
  select exists(
    select 1 from public.event_ticket_categories c
    where c.event_id = e.id and c.published
      and (c.sales_start is null or c.sales_start <= now())
      and (c.sales_end is null or c.sales_end > now())
  ) into v_price_known;
  if not v_categories then
    v_price_known := nullif(e.config->>'price', '') is not null
      or exists(select 1 from public.seats s where s.event_id=e.id and s.status='available' and s.price is not null);
  end if;
  select exists(select 1 from public.payment_methods p where p.organization_id=e.organization_id and p.is_active and (p.event_id is null or p.event_id=e.id)) into v_payment_methods;
  select count(*) into v_sessions_outside from public.event_sessions s
    where s.event_id=e.id and (s.starts_at is null or s.ends_at is null or s.ends_at<=s.starts_at
      or (e.start_date is not null and s.starts_at<e.start_date)
      or (e.end_date is not null and s.ends_at>e.end_date));
  select count(*) into v_public_passes from public.passes p
    join public.pass_entitlements pe on pe.pass_id=p.id
    where p.is_public and (pe.event_id=e.id
      or pe.session_id in (select id from public.event_sessions where event_id=e.id)
      or pe.zone_id in (select id from public.event_zones where event_id=e.id));
  select count(*) into v_contact_forms from public.event_lead_forms f where f.event_id=e.id and f.published;
  select count(*) into v_public_links from public.public_sites s where s.event_id=e.id and s.status='active';

  v_checks := v_checks || jsonb_build_array(
    jsonb_build_object('key','basics','label','Datos básicos','ok',length(trim(e.name))>=2 and nullif(trim(coalesce(e.description,'')),'') is not null,'blocking',true,'detail','Nombre y descripción del evento.'),
    jsonb_build_object('key','dates','label','Fechas del evento','ok',e.start_date is not null and e.end_date is not null and e.end_date>e.start_date,'blocking',true,'detail','Inicio y fin válidos.'),
    jsonb_build_object('key','deadline','label','Cierre de registro','ok',e.registration_deadline is not null and e.start_date is not null and e.registration_deadline<=e.start_date and e.registration_deadline>now(),'blocking',true,'detail','El registro cierra antes de comenzar y todavía está abierto.'),
    jsonb_build_object('key','registration','label','Modalidad de registro','ok',coalesce(e.config->>'registration_mode','') in ('free','paid','invitation'),'blocking',true,'detail','Modalidad pública definida.'),
    jsonb_build_object('key','price','label','Precio o gratuidad','ok',not v_paid or v_price_known,'blocking',true,'detail',case when v_paid then 'Todo evento pago debe tener un importe conocido.' else 'El registro no requiere importe.' end),
    jsonb_build_object('key','payments','label','Métodos de pago','ok',not v_paid or v_payment_methods,'blocking',true,'detail',case when v_paid then 'Debe existir al menos un método de pago activo.' else 'No se requieren métodos de pago.' end),
    jsonb_build_object('key','agenda','label','Agenda dentro de fechas','ok',v_sessions_outside=0,'blocking',true,'detail',case when v_sessions_outside=0 then 'Las sesiones respetan las fechas del evento.' else format('%s actividades tienen fechas incompletas o fuera del evento.',v_sessions_outside) end),
    jsonb_build_object('key','passes','label','Pases públicos','ok',v_public_passes>0,'blocking',false,'detail',case when v_public_passes>0 then format('%s pases públicos vinculados.',v_public_passes) else 'No hay pases públicos vinculados; es opcional para registros individuales.' end),
    jsonb_build_object('key','contact','label','Formulario de contacto','ok',v_contact_forms>0,'blocking',false,'detail',case when v_contact_forms>0 then format('%s formularios públicos.',v_contact_forms) else 'No hay formulario de contacto publicado.' end),
    jsonb_build_object('key','public_link','label','Enlace público','ok',v_public_links>0,'blocking',false,'detail',case when v_public_links>0 then 'El sitio público está activo.' else 'El evento usa su ruta pública estándar; todavía no tiene sitio propio activo.' end)
  );
  return jsonb_build_object(
    'event_id',e.id,
    'can_publish',not exists(select 1 from jsonb_array_elements(v_checks) c where (c->>'blocking')::boolean and not (c->>'ok')::boolean),
    'checks',v_checks
  );
end;
$$;

revoke all on function public.get_event_launch_readiness(uuid) from public, anon;
grant execute on function public.get_event_launch_readiness(uuid) to authenticated;

create or replace function public.enforce_event_session_dates()
returns trigger language plpgsql set search_path='' as $$
declare e public.events;
begin
  select * into e from public.events where id=new.event_id;
  if new.starts_at is null and new.ends_at is null then return new; end if;
  if new.starts_at is null or new.ends_at is null or new.ends_at<=new.starts_at then
    raise exception 'La actividad debe tener un inicio y un fin válidos';
  end if;
  if (e.start_date is not null and new.starts_at<e.start_date) or (e.end_date is not null and new.ends_at>e.end_date) then
    raise exception 'La actividad debe estar dentro de las fechas del evento';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_event_session_dates on public.event_sessions;
create trigger enforce_event_session_dates before insert or update of event_id,starts_at,ends_at on public.event_sessions for each row execute function public.enforce_event_session_dates();
revoke all on function public.enforce_event_session_dates() from public, anon, authenticated;

-- El nombre de la columna de retorno `result` chocaba con checkin_records.result
-- y hacía fallar la validación válida/duplicada en tiempo de ejecución.
create or replace function public.validate_program_checkin(p_credential_token text,p_access_point_id uuid,p_device_label text default null)
returns table(result text,participant_name text,reason text,event_id uuid)
language plpgsql security definer set search_path='' as $$
declare v_point public.access_points; v_part public.event_participations; v_person public.people; v_allowed boolean;
begin
  select * into v_point from public.access_points point where point.id=p_access_point_id;
  if v_point is null or not public.has_event_staff_scope(v_point.event_id,v_point.id,'checkin.perform') then raise exception 'No tienes permiso de check-in en este punto de acceso' using errcode='42501'; end if;
  select participation.* into v_part from public.event_participations participation join public.people person on person.id=participation.person_id where participation.credential_token=trim(p_credential_token) and participation.event_id=v_point.event_id and person.organization_id=v_point.organization_id limit 1;
  if v_part is null then return query select 'denied'::text,null::text,'Código no válido para este evento.'::text,v_point.event_id; return; end if;
  select * into v_person from public.people person where person.id=v_part.person_id;
  if v_part.status<>'approved' then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Participación sin aprobar.'::text,v_point.event_id; return; end if;
  select exists(select 1 from public.participation_passes pp join public.passes pass on pass.id=pp.pass_id join public.pass_entitlements entitlement on entitlement.pass_id=pass.id where pp.participation_id=v_part.id and (entitlement.event_id=v_point.event_id or entitlement.zone_id=v_point.zone_id or entitlement.access_date=current_date)) into v_allowed;
  if not v_allowed then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'El pase no habilita este punto de acceso.'::text,v_point.event_id; return; end if;
  if exists(select 1 from public.checkin_records record where record.participation_id=v_part.id and record.access_point_id=v_point.id and record.result in ('allowed','validated')) then return query select 'duplicate'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Este pase ya fue validado en este punto.'::text,v_point.event_id; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(v_point.organization_id,v_part.id,v_point.event_id,v_point.id,'allowed',auth.uid(),nullif(trim(p_device_label),''));
  return query select 'allowed'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Acceso autorizado.'::text,v_point.event_id;
end $$;

create or replace function public.validate_session_checkin(p_credential_token text,p_access_point_id uuid,p_session_id uuid,p_device_label text default null)
returns table(result text,participant_name text,reason text,remaining int)
language plpgsql security definer set search_path='' as $$
declare v_point public.access_points; v_session public.event_sessions; v_part public.event_participations; v_person public.people; v_remaining int;
begin
  select * into v_point from public.access_points point where point.id=p_access_point_id;
  select * into v_session from public.event_sessions session where session.id=p_session_id;
  if v_point is null or v_session is null or v_point.event_id<>v_session.event_id then raise exception 'Punto de acceso o sesión no disponibles' using errcode='42501'; end if;
  if not public.has_event_staff_scope(v_session.event_id,v_point.id,'checkin.perform') and not (public.has_org_role(v_session.organization_id,array['owner','admin']::public.member_role[]) or exists(select 1 from public.session_staff_assignments assignment where assignment.session_id=p_session_id and assignment.user_id=auth.uid() and assignment.responsibility in ('host','moderator','checkin'))) then raise exception 'No tienes permiso operativo para esta sesión' using errcode='42501'; end if;
  select participation.* into v_part from public.event_participations participation where participation.credential_token=trim(p_credential_token) and participation.event_id=v_session.event_id and participation.status='approved' limit 1;
  if v_part is null then return query select 'denied'::text,null::text,'Código no válido para esta sesión.'::text,null::int; return; end if;
  select * into v_person from public.people person where person.id=v_part.person_id;
  if not exists(select 1 from public.participation_passes pp join public.passes pass on pass.id=pp.pass_id join public.pass_entitlements entitlement on entitlement.pass_id=pass.id where pp.participation_id=v_part.id and (entitlement.session_id=p_session_id or entitlement.event_id=v_session.event_id)) then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'El pase no habilita esta sesión.'::text,null::int; return; end if;
  if v_session.session_type='workshop' and not exists(select 1 from public.session_reservations reservation where reservation.session_id=p_session_id and reservation.participation_id=v_part.id and reservation.status in ('confirmed','checked_in')) then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Requiere una reserva confirmada para este taller.'::text,null::int; return; end if;
  if exists(select 1 from public.checkin_records record where record.participation_id=v_part.id and record.access_point_id=v_point.id and record.result in ('allowed','validated')) then return query select 'duplicate'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Ya fue validado en este punto.'::text,null::int; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(v_session.organization_id,v_part.id,v_session.event_id,v_point.id,'validated',auth.uid(),nullif(trim(p_device_label),''));
  update public.session_reservations reservation set status='checked_in',checked_in_at=now() where reservation.session_id=p_session_id and reservation.participation_id=v_part.id and reservation.status='confirmed';
  if v_session.capacity is not null then select greatest(v_session.capacity-count(*)::int,0) into v_remaining from public.session_reservations reservation where reservation.session_id=p_session_id and reservation.status in ('confirmed','checked_in'); end if;
  return query select 'allowed'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Acceso a la sesión autorizado.'::text,v_remaining;
end $$;

create or replace function public.manual_program_checkin(p_participation_id uuid,p_access_point_id uuid)
returns table(result text,participant_name text,reason text)
language plpgsql security definer set search_path='' as $$
declare v_part public.event_participations; v_point public.access_points; v_person public.people;
begin
  select * into v_part from public.event_participations participation where participation.id=p_participation_id;
  select * into v_point from public.access_points point where point.id=p_access_point_id;
  if v_part is null or v_point is null or v_part.event_id<>v_point.event_id or not public.has_event_staff_scope(v_point.event_id,v_point.id,'checkin.perform') then raise exception 'No tienes permiso de check-in en este punto' using errcode='42501'; end if;
  if coalesce((select (event.config->>'checkin_enabled')::boolean from public.events event where event.id=v_point.event_id),true) is false then return query select 'disabled'::text,null::text,'El check-in está desactivado para este evento.'::text; return; end if;
  select * into v_person from public.people person where person.id=v_part.person_id;
  if v_part.status<>'approved' then return query select 'denied'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Participación sin aprobar.'::text; return; end if;
  if exists(select 1 from public.checkin_records record where record.participation_id=v_part.id and record.access_point_id=v_point.id and record.result in ('allowed','validated')) then return query select 'duplicate'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Ya fue validado en este punto.'::text; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(v_point.organization_id,v_part.id,v_point.event_id,v_point.id,'validated',auth.uid(),'manual');
  return query select 'allowed'::text,trim(v_person.first_name||' '||coalesce(v_person.last_name,'')),'Ingreso manual registrado.'::text;
end $$;

revoke all on function public.validate_program_checkin(text,uuid,text),public.validate_session_checkin(text,uuid,uuid,text),public.manual_program_checkin(uuid,uuid) from public,anon;
grant execute on function public.validate_program_checkin(text,uuid,text),public.validate_session_checkin(text,uuid,uuid,text),public.manual_program_checkin(uuid,uuid) to authenticated;

create or replace function public.get_public_event_registration_state(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_paid boolean;
  v_categories boolean;
  v_price_known boolean;
  v_payment_methods boolean;
  v_reason text;
begin
  select * into e from public.events where id=p_event_id and status='published';
  if e.id is null then return jsonb_build_object('available',false,'reason','El evento no está disponible.'); end if;
  v_paid := coalesce(e.config->>'registration_mode','paid')='paid';
  v_categories := coalesce((e.config->>'ticket_categories_enabled')::boolean,false);
  select exists(select 1 from public.event_ticket_categories c where c.event_id=e.id and c.published and (c.sales_start is null or c.sales_start<=now()) and (c.sales_end is null or c.sales_end>now())) into v_price_known;
  if not v_categories then
    v_price_known := nullif(e.config->>'price','') is not null
      or exists(select 1 from public.seats s where s.event_id=e.id and s.status='available' and s.price is not null);
  end if;
  select exists(select 1 from public.payment_methods p where p.organization_id=e.organization_id and p.is_active and (p.event_id is null or p.event_id=e.id)) into v_payment_methods;
  v_reason := case
    when e.end_date is not null and e.end_date<=now() then 'Este evento ya finalizó.'
    when e.registration_deadline is not null and e.registration_deadline<=now() then 'El plazo de registro terminó.'
    when coalesce(e.config->>'registration_mode','paid')='invitation' then 'El acceso a este evento es por invitación.'
    when v_paid and not v_price_known then 'El organizador todavía debe definir el precio.'
    when v_paid and not v_payment_methods then 'El organizador todavía debe activar un método de pago.'
    else null end;
  return jsonb_build_object('available',v_reason is null,'reason',v_reason,'payment_required',v_paid,'price_known',not v_paid or v_price_known,'payment_methods_ready',not v_paid or v_payment_methods);
end;
$$;

revoke all on function public.get_public_event_registration_state(uuid) from public;
grant execute on function public.get_public_event_registration_state(uuid) to anon, authenticated;

create or replace function public.register_event_purchase(p_event_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text,p_cedula text default null,p_seat_id uuid default null,p_campaign text default null,p_source text default null,p_medium text default null,p_category_id uuid default null)
returns table(registration_id uuid,registration_status public.registration_status,credential_token text,payment_required boolean)
language plpgsql security definer set search_path='' as $$
declare e public.events; r public.registrations; state jsonb;
begin
  select * into e from public.events where id=p_event_id for update;
  if e.id is null or e.status<>'published' then raise exception 'Registro no disponible'; end if;
  select public.get_public_event_registration_state(p_event_id) into state;
  if not coalesce((state->>'available')::boolean,false) then raise exception '%',coalesce(state->>'reason','Registro no disponible'); end if;
  if length(trim(coalesce(p_first_name,'')))<2 or position('@' in trim(coalesce(p_email,'')))<2 then raise exception 'Datos inválidos'; end if;
  if p_category_id is not null and not coalesce((e.config->>'ticket_categories_enabled')::boolean,false) then raise exception 'Categorías deshabilitadas'; end if;
  if p_seat_id is not null and not(coalesce((e.config->>'public_seat_selection_enabled')::boolean,false) and e.config->>'seat_assignment_mode'='attendee') then raise exception 'Selección de asiento deshabilitada'; end if;
  if exists(select 1 from public.registrations where event_id=e.id and lower(email)=lower(trim(p_email))) then raise exception 'Ya existe un registro. Consulta o recupera tu registro.' using errcode='23505'; end if;
  insert into public.registrations(organization_id,event_id,first_name,last_name,email,phone,cedula,seat_id,ticket_category_id,status,payment_deadline,payment_confirmed_at)
  values(e.organization_id,e.id,trim(p_first_name),nullif(trim(p_last_name),''),lower(trim(p_email)),nullif(trim(p_phone),''),nullif(trim(p_cedula),''),p_seat_id,p_category_id,case when e.config->>'registration_mode'='free' then 'confirmed'::public.registration_status else 'pending_payment'::public.registration_status end,case when coalesce(e.config->>'registration_mode','paid')='paid' then now()+make_interval(days=>e.payment_timeout_days) end,case when e.config->>'registration_mode'='free' then now() end) returning * into r;
  if p_seat_id is not null then update public.seats set status=case when r.status='confirmed' then 'confirmed'::public.seat_status else 'reserved'::public.seat_status end where id=p_seat_id; end if;
  insert into public.event_conversion_events(organization_id,event_id,event_kind,campaign,source,medium) values(e.organization_id,e.id,'registration_completed',left(p_campaign,100),left(p_source,100),left(p_medium,100));
  return query select r.id,r.status,r.credential_token,r.status='pending_payment';
end $$;

revoke all on function public.register_event_purchase(uuid,text,text,text,text,text,uuid,text,text,text,uuid) from public;
grant execute on function public.register_event_purchase(uuid,text,text,text,text,text,uuid,text,text,text,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
