-- P0: registro gratuito/pago, aforo y selección pública de puestos.
-- Las opciones se guardan en events.config para mantener compatibilidad.

update public.events
set config = jsonb_strip_nulls(
  coalesce(config, '{}'::jsonb) || jsonb_build_object(
    'registration_mode', coalesce(config->>'registration_mode', 'paid'),
    'public_floorplan_visible', coalesce((config->>'public_floorplan_visible')::boolean, false),
    'public_seat_selection_enabled', coalesce((config->>'public_seat_selection_enabled')::boolean, false),
    'seat_assignment_mode', coalesce(config->>'seat_assignment_mode', 'admin')
  )
);

create or replace function public.register_event_participant(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_cedula text default null,
  p_seat_id uuid default null
)
returns table(registration_id uuid, registration_status public.registration_status, credential_token text, payment_required boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_mode text;
  v_seat_mode text;
  v_taken integer;
  v_seat_status public.seat_status;
  v_registration public.registrations;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.status <> 'published' then
    raise exception 'Evento no disponible' using errcode = 'check_violation';
  end if;
  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then
    raise exception 'El período de registro finalizó' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_first_name, ''))) < 2 then
    raise exception 'Ingresa un nombre válido' using errcode = 'check_violation';
  end if;
  if position('@' in trim(coalesce(p_email, ''))) < 2 then
    raise exception 'Ingresa un correo válido' using errcode = 'check_violation';
  end if;

  v_mode := coalesce(v_event.config->>'registration_mode', 'paid');
  if v_mode = 'invitation' then
    raise exception 'Este evento solo admite registros por invitación' using errcode = 'insufficient_privilege';
  end if;
  if v_mode not in ('free', 'paid') then
    raise exception 'Modalidad de registro no válida' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id and lower(r.email) = lower(trim(p_email)) and r.status <> 'rejected'
  ) then
    raise exception 'Ya existe un registro con ese correo para este evento' using errcode = 'unique_violation';
  end if;

  if coalesce(v_event.total_slots, 0) > 0 then
    select count(*) into v_taken from public.registrations r
    where r.event_id = p_event_id and r.status <> 'rejected';
    if v_taken >= v_event.total_slots then
      raise exception 'Este evento alcanzó su capacidad' using errcode = 'check_violation';
    end if;
  end if;

  v_seat_mode := coalesce(v_event.config->>'seat_assignment_mode', 'admin');
  if p_seat_id is not null then
    if coalesce((v_event.config->>'public_seat_selection_enabled')::boolean, false) is not true
      or v_seat_mode <> 'attendee' then
      raise exception 'La selección pública de puestos no está habilitada' using errcode = 'insufficient_privilege';
    end if;
    select s.status into v_seat_status
    from public.seats s
    where s.id = p_seat_id and s.event_id = p_event_id
    for update;
    if not found then raise exception 'Puesto no encontrado' using errcode = 'no_data_found'; end if;
    if v_seat_status <> 'available' then
      raise exception 'El puesto ya no está disponible' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.registrations(
    organization_id, event_id, first_name, last_name, email, phone, cedula,
    seat_id, status, payment_deadline, payment_confirmed_at
  ) values (
    v_event.organization_id, p_event_id, trim(p_first_name), nullif(trim(p_last_name), ''),
    lower(trim(p_email)), nullif(trim(p_phone), ''), nullif(trim(p_cedula), ''), p_seat_id,
    case when v_mode = 'free' then 'confirmed'::public.registration_status else 'pending_payment'::public.registration_status end,
    case when v_mode = 'paid' then now() + make_interval(days => v_event.payment_timeout_days) else null end,
    case when v_mode = 'free' then now() else null end
  ) returning * into v_registration;

  if p_seat_id is not null then
    update public.seats
    set status = case when v_mode = 'free' then 'confirmed'::public.seat_status else 'reserved'::public.seat_status end
    where id = p_seat_id;
  end if;

  return query select v_registration.id, v_registration.status, v_registration.credential_token, v_mode = 'paid';
end;
$$;

revoke all on function public.register_event_participant(uuid,text,text,text,text,text,uuid) from public;
grant execute on function public.register_event_participant(uuid,text,text,text,text,text,uuid) to anon, authenticated;

-- Todo registro público debe pasar por la RPC transaccional.
drop policy if exists reg_public_insert on public.registrations;
revoke insert on public.registrations from anon;

-- Capacidad de pases de programa, serializada mediante bloqueo del pase.
create or replace function public.register_program_participant(
  p_program_id uuid, p_event_id uuid, p_pass_id uuid,
  p_first_name text, p_last_name text, p_email text, p_phone text,
  p_cedula text default null, p_company text default null, p_job_title text default null,
  p_city text default null, p_country text default null, p_participation_type text default 'attendee',
  p_profile_data jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_person uuid; v_part uuid; v_pass public.passes; v_taken integer;
begin
  select organization_id into v_org from public.event_programs where id = p_program_id and status = 'published';
  if v_org is null then raise exception 'Programa no disponible' using errcode = 'check_violation'; end if;
  if p_participation_type not in ('attendee','guest','vip','speaker','exhibitor') then raise exception 'Perfil no disponible para registro público' using errcode = '42501'; end if;
  select * into v_pass from public.passes where id = p_pass_id and program_id = p_program_id and is_public for update;
  if v_pass is null then raise exception 'Pase no disponible' using errcode = 'check_violation'; end if;
  if v_pass.capacity is not null and v_pass.capacity > 0 then
    select count(*) into v_taken from public.participation_passes pp join public.event_participations ep on ep.id = pp.participation_id where pp.pass_id = p_pass_id and ep.status not in ('rejected','cancelled');
    if v_taken >= v_pass.capacity then raise exception 'Este pase alcanzó su capacidad' using errcode = 'check_violation'; end if;
  end if;
  if p_event_id is not null and not exists (select 1 from public.program_events where program_id = p_program_id and event_id = p_event_id) then raise exception 'Evento no pertenece al programa' using errcode = 'check_violation'; end if;
  insert into public.people (organization_id, first_name, last_name, email, phone, cedula, company, job_title, city, country, profile_data)
  values (v_org, trim(p_first_name), nullif(trim(p_last_name),''), lower(trim(p_email)), nullif(trim(p_phone),''), nullif(trim(p_cedula),''), nullif(trim(p_company),''), nullif(trim(p_job_title),''), nullif(trim(p_city),''), nullif(trim(p_country),''), coalesce(p_profile_data, '{}'::jsonb))
  on conflict (organization_id, email) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,cedula=excluded.cedula,company=excluded.company,job_title=excluded.job_title,city=excluded.city,country=excluded.country,profile_data=excluded.profile_data returning id into v_person;
  insert into public.event_participations(program_id,person_id,event_id,participation_type,status,source)
  values(p_program_id,v_person,p_event_id,p_participation_type,case when p_participation_type in ('speaker','exhibitor','vip') then 'pending' else 'approved' end,'public')
  on conflict(program_id,person_id,event_id,participation_type) do update set participation_type=excluded.participation_type returning id into v_part;
  insert into public.participation_passes(participation_id,pass_id) values(v_part,p_pass_id) on conflict do nothing;
  return v_part;
end $$;

revoke all on function public.register_program_participant(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.register_program_participant(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) to anon, authenticated;
