-- Validación atómica de pases en un punto de acceso.
-- Aplicar manualmente en Supabase SQL Editor antes de publicar el frontend.

create or replace function public.validate_program_checkin(
  p_credential_token text,
  p_access_point_id uuid,
  p_device_label text default null
) returns table(result text, participant_name text, reason text, event_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_point public.access_points;
  v_part public.event_participations;
  v_person public.people;
  v_allowed boolean;
begin
  select * into v_point from public.access_points where id = p_access_point_id;
  if v_point is null or not public.is_org_member(v_point.organization_id) then
    raise exception 'Punto de acceso no disponible' using errcode = '42501';
  end if;

  select ep.* into v_part
  from public.event_participations ep
  join public.people pe on pe.id = ep.person_id
  where ep.credential_token = trim(p_credential_token)
    and pe.organization_id = v_point.organization_id
  limit 1;
  if v_part is null then
    return query select 'denied'::text, null::text, 'Código no válido para esta organización.'::text, v_point.event_id;
    return;
  end if;

  select * into v_person from public.people where id = v_part.person_id;

  if v_part.status <> 'approved' then
    return query select 'denied'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name, '')), 'Participación sin aprobar.'::text, v_point.event_id;
    return;
  end if;

  select exists(
    select 1 from public.participation_passes pp
    join public.passes pa on pa.id = pp.pass_id
    join public.pass_entitlements en on en.pass_id = pa.id
    where pp.participation_id = v_part.id
      and (en.event_id = v_point.event_id or en.zone_id = v_point.zone_id or en.access_date = current_date)
  ) into v_allowed;
  if not v_allowed then
    return query select 'denied'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name, '')), 'El pase no habilita este punto de acceso.'::text, v_point.event_id;
    return;
  end if;

  if exists(select 1 from public.checkin_records where participation_id = v_part.id and access_point_id = v_point.id and result in ('allowed','validated')) then
    return query select 'duplicate'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name, '')), 'Este pase ya fue validado en este punto.'::text, v_point.event_id;
    return;
  end if;

  insert into public.checkin_records(organization_id, participation_id, event_id, access_point_id, result, scanned_by, device_label)
  values (v_point.organization_id, v_part.id, v_point.event_id, v_point.id, 'allowed', auth.uid(), nullif(trim(p_device_label), ''));
  return query select 'allowed'::text, trim(v_person.first_name || ' ' || coalesce(v_person.last_name, '')), 'Acceso autorizado.'::text, v_point.event_id;
end $$;

grant execute on function public.validate_program_checkin(text, uuid, text) to authenticated;
