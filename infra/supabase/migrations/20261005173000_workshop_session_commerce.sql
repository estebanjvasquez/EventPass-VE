-- Talleres y sesiones comerciales dentro de un programa.
-- Une agenda, cupo y precio en una sola operacion transaccional.

alter table public.event_sessions drop constraint if exists event_sessions_session_type_check;
alter table public.event_sessions add constraint event_sessions_session_type_check
  check (session_type in ('lecture','keynote','panel','workshop','roundtable','training','networking','break','other'));

create or replace function public.save_program_session_offer(
  p_program_id uuid,
  p_event_id uuid,
  p_session_id uuid,
  p_name text,
  p_description text,
  p_session_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_stage_id uuid,
  p_capacity integer,
  p_registration_policy text,
  p_price numeric,
  p_currency text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.event_programs;
  v_event public.events;
  v_session_id uuid;
  v_item_id uuid;
  v_price numeric(12,2);
  v_currency text;
begin
  select * into v_program from public.event_programs where id=p_program_id for update;
  if v_program.id is null or not (public.is_org_member(v_program.organization_id) or public.is_platform_admin()) then
    raise exception 'No autorizado' using errcode='42501';
  end if;
  select e.* into v_event
  from public.events e join public.program_events pe on pe.event_id=e.id
  where pe.program_id=p_program_id and e.id=p_event_id;
  if v_event.id is null then raise exception 'El evento no pertenece al programa'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Indica el nombre de la sesion'; end if;
  if p_session_type not in ('lecture','keynote','panel','workshop','roundtable','training','networking','break','other') then raise exception 'Tipo de sesion no valido'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'El horario de la sesion no es valido'; end if;
  if p_capacity is not null and p_capacity<0 then raise exception 'El cupo no puede ser negativo'; end if;
  if p_registration_policy not in ('included','optional_free','optional_paid','closed') then raise exception 'Modalidad de registro no valida'; end if;
  if p_session_type='break' then p_registration_policy:='closed'; end if;
  v_price:=case when p_registration_policy='optional_paid' then coalesce(p_price,0) else 0 end;
  v_currency:=upper(coalesce(nullif(trim(p_currency),''),'USD'));
  if v_price<0 then raise exception 'El precio no puede ser negativo'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'La moneda debe tener tres letras'; end if;
  if p_stage_id is not null and not exists(select 1 from public.event_stages where id=p_stage_id and event_id=p_event_id) then raise exception 'La sala no pertenece al evento'; end if;

  if p_session_id is null then
    insert into public.event_sessions(organization_id,event_id,name,description,session_type,starts_at,ends_at,stage_id,capacity,sort_order)
    values(v_program.organization_id,p_event_id,trim(p_name),nullif(trim(p_description),''),p_session_type,p_starts_at,p_ends_at,p_stage_id,case when p_session_type='break' then null else p_capacity end,
      coalesce((select max(sort_order)+1 from public.event_sessions where event_id=p_event_id),0))
    returning id into v_session_id;
  else
    if not exists(select 1 from public.event_sessions where id=p_session_id and event_id=p_event_id) then raise exception 'La sesion no pertenece al evento'; end if;
    update public.event_sessions set
      name=trim(p_name),description=nullif(trim(p_description),''),session_type=p_session_type,
      starts_at=p_starts_at,ends_at=p_ends_at,stage_id=p_stage_id,
      capacity=case when p_session_type='break' then null else p_capacity end
    where id=p_session_id returning id into v_session_id;
  end if;

  select i.id into v_item_id
  from public.program_registration_items i
  join public.program_registration_entitlements en on en.item_id=i.id
  where i.program_id=p_program_id and i.item_type='session' and en.session_id=v_session_id
  order by i.created_at limit 1 for update of i;

  if p_registration_policy='closed' then
    update public.program_registration_items i set active=false,is_public=false
    where i.program_id=p_program_id and i.item_type='session'
      and exists(select 1 from public.program_registration_entitlements en where en.item_id=i.id and en.session_id=v_session_id);
  else
    if v_item_id is null then
      insert into public.program_registration_items(program_id,name,description,item_type,selection_type,price,currency,capacity,is_public,active,sort_order)
      values(p_program_id,trim(p_name),nullif(trim(p_description),''),'session',case when p_registration_policy='included' then 'required' else 'optional' end,v_price,v_currency,p_capacity,true,true,
        coalesce((select max(sort_order)+1 from public.program_registration_items where program_id=p_program_id),0))
      returning id into v_item_id;
      insert into public.program_registration_entitlements(item_id,session_id) values(v_item_id,v_session_id);
    else
      update public.program_registration_items set
        name=trim(p_name),description=nullif(trim(p_description),''),
        selection_type=case when p_registration_policy='included' then 'required' else 'optional' end,
        price=v_price,currency=v_currency,capacity=p_capacity,is_public=true,active=true
      where id=v_item_id;
    end if;
  end if;
  return v_session_id;
end $$;

grant execute on function public.save_program_session_offer(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,integer,text,numeric,text) to authenticated;

