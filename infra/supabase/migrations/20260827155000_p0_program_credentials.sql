-- Integra las participaciones de programas con la credencial pública existente.
create or replace function public.get_credential_by_token(p_token text)
returns table (
  first_name text, last_name text, status public.registration_status,
  event_name text, event_start timestamptz, org_name text,
  seat_label text, credential_token text
)
language sql stable security definer set search_path = '' as $$
  select r.first_name, r.last_name, r.status, e.name, e.start_date, o.name,
    coalesce(s.seat_number, nullif(concat_ws('', s.row_label, s.column_number::text), '')),
    r.credential_token
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  left join public.seats s on s.id = r.seat_id
  where r.credential_token = p_token
  union all
  select pe.first_name, pe.last_name,
    case ep.status when 'approved' then 'confirmed'::public.registration_status when 'rejected' then 'rejected'::public.registration_status when 'cancelled' then 'rejected'::public.registration_status else 'pending_payment'::public.registration_status end,
    coalesce(e.name, pr.name), coalesce(e.start_date, pr.starts_at), o.name, null::text, ep.credential_token
  from public.event_participations ep
  join public.people pe on pe.id = ep.person_id
  join public.event_programs pr on pr.id = ep.program_id
  join public.organizations o on o.id = pr.organization_id
  left join public.events e on e.id = ep.event_id
  where ep.credential_token = p_token
  limit 1;
$$;
revoke all on function public.get_credential_by_token(text) from public;
grant execute on function public.get_credential_by_token(text) to anon, authenticated;

drop function if exists public.register_program_participant(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb);
create function public.register_program_participant(
  p_program_id uuid, p_event_id uuid, p_pass_id uuid,
  p_first_name text, p_last_name text, p_email text, p_phone text,
  p_cedula text default null, p_company text default null, p_job_title text default null,
  p_city text default null, p_country text default null, p_participation_type text default 'attendee',
  p_profile_data jsonb default '{}'::jsonb
) returns table(participation_id uuid, credential_token text, participation_status text)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_person uuid; v_part public.event_participations; v_pass public.passes; v_taken integer;
begin
  select organization_id into v_org from public.event_programs where id=p_program_id and status='published';
  if v_org is null then raise exception 'Programa no disponible' using errcode='check_violation'; end if;
  if p_participation_type not in ('attendee','guest','vip','speaker','exhibitor') then raise exception 'Perfil no disponible para registro público' using errcode='42501'; end if;
  select * into v_pass from public.passes where id=p_pass_id and program_id=p_program_id and is_public for update;
  if v_pass is null then raise exception 'Pase no disponible' using errcode='check_violation'; end if;
  if v_pass.capacity is not null and v_pass.capacity>0 then
    select count(*) into v_taken from public.participation_passes pp join public.event_participations ep on ep.id=pp.participation_id where pp.pass_id=p_pass_id and ep.status not in ('rejected','cancelled');
    if v_taken>=v_pass.capacity then raise exception 'Este pase alcanzó su capacidad' using errcode='check_violation'; end if;
  end if;
  if p_event_id is not null and not exists(select 1 from public.program_events where program_id=p_program_id and event_id=p_event_id) then raise exception 'Evento no pertenece al programa' using errcode='check_violation'; end if;
  insert into public.people(organization_id,first_name,last_name,email,phone,cedula,company,job_title,city,country,profile_data)
  values(v_org,trim(p_first_name),nullif(trim(p_last_name),''),lower(trim(p_email)),nullif(trim(p_phone),''),nullif(trim(p_cedula),''),nullif(trim(p_company),''),nullif(trim(p_job_title),''),nullif(trim(p_city),''),nullif(trim(p_country),''),coalesce(p_profile_data,'{}'::jsonb))
  on conflict(organization_id,email) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,cedula=excluded.cedula,company=excluded.company,job_title=excluded.job_title,city=excluded.city,country=excluded.country,profile_data=excluded.profile_data returning id into v_person;
  insert into public.event_participations(program_id,person_id,event_id,participation_type,status,source)
  values(p_program_id,v_person,p_event_id,p_participation_type,case when p_participation_type in ('speaker','exhibitor','vip') then 'pending' else 'approved' end,'public')
  on conflict(program_id,person_id,event_id,participation_type) do update set participation_type=excluded.participation_type returning * into v_part;
  insert into public.participation_passes(participation_id,pass_id) values(v_part.id,p_pass_id) on conflict do nothing;
  return query select v_part.id,v_part.credential_token,v_part.status;
end $$;
revoke all on function public.register_program_participant(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.register_program_participant(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) to anon, authenticated;
