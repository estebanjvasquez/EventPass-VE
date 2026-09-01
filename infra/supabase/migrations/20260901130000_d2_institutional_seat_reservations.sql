-- D2: reservas institucionales por categoria, aforo publico protegido y auditoria.

create table if not exists public.seat_reservation_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  color text not null default '#7C3AED' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  reserved_capacity integer not null default 0 check (reserved_capacity >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists seat_reservation_categories_event_name_uidx
  on public.seat_reservation_categories(event_id, lower(name));
create index if not exists seat_reservation_categories_event_idx
  on public.seat_reservation_categories(event_id, is_active, sort_order);

alter table public.seats
  add column if not exists reservation_category_id uuid
    references public.seat_reservation_categories(id) on delete restrict,
  add column if not exists reservation_notes text;
create index if not exists seats_reservation_category_idx
  on public.seats(reservation_category_id) where reservation_category_id is not null;

create table if not exists public.seat_reservation_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid references public.seat_reservation_categories(id) on delete set null,
  seat_id uuid references public.seats(id) on delete set null,
  action text not null check (action in ('category_created','category_updated','category_deleted','seat_reserved','seat_released')),
  actor_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists seat_reservation_audit_event_created_idx
  on public.seat_reservation_audit(event_id, created_at desc);

alter table public.seat_reservation_categories enable row level security;
alter table public.seat_reservation_audit enable row level security;

drop policy if exists seat_reservation_categories_member_read on public.seat_reservation_categories;
create policy seat_reservation_categories_member_read on public.seat_reservation_categories
  for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists seat_reservation_audit_admin_read on public.seat_reservation_audit;
create policy seat_reservation_audit_admin_read on public.seat_reservation_audit
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.organization_id = seat_reservation_audit.organization_id
        and m.user_id = (select auth.uid())
        and m.role::text in ('owner','admin')
    )
  );

grant select on public.seat_reservation_categories to authenticated;
grant select on public.seat_reservation_audit to authenticated;

create or replace function public.manage_seat_reservation_category(
  p_event_id uuid,
  p_name text,
  p_color text,
  p_reserved_capacity integer,
  p_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_category public.seat_reservation_categories;
  v_other_capacity integer;
  v_public_taken integer;
  v_result uuid;
  v_action text;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if v_event.id is null then raise exception 'Evento no encontrado' using errcode = 'P0002'; end if;
  if not (public.is_platform_admin() or exists (
    select 1 from public.memberships m where m.organization_id = v_event.organization_id
      and m.user_id = (select auth.uid()) and m.role::text in ('owner','admin')
  )) then raise exception 'No tienes permisos para gestionar reservas' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) < 2 then raise exception 'Indica un nombre de categoria valido' using errcode = '22023'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'El color no es valido' using errcode = '22023'; end if;
  if coalesce(p_reserved_capacity,-1) < 0 then raise exception 'La cantidad reservada no puede ser negativa' using errcode = '22023'; end if;

  if p_category_id is not null then
    select * into v_category from public.seat_reservation_categories
      where id = p_category_id and event_id = p_event_id for update;
    if v_category.id is null then raise exception 'Categoria no encontrada' using errcode = 'P0002'; end if;
    if p_reserved_capacity < (select count(*) from public.seats where reservation_category_id = p_category_id) then
      raise exception 'Libera asientos antes de reducir la cantidad reservada' using errcode = 'check_violation';
    end if;
  end if;

  select coalesce(sum(reserved_capacity),0)::integer into v_other_capacity
  from public.seat_reservation_categories
  where event_id = p_event_id and is_active and id is distinct from p_category_id;
  select count(*)::integer into v_public_taken from public.registrations
  where event_id = p_event_id and status <> 'rejected';
  if v_event.total_slots > 0 and v_other_capacity + p_reserved_capacity + v_public_taken > v_event.total_slots then
    raise exception 'La reserva supera el aforo disponible. Ya hay % registro(s) y % cupo(s) en otras categorias.', v_public_taken, v_other_capacity using errcode = 'check_violation';
  end if;

  if p_category_id is null then
    insert into public.seat_reservation_categories(organization_id,event_id,name,color,reserved_capacity,created_by)
    values(v_event.organization_id,p_event_id,btrim(p_name),upper(p_color),p_reserved_capacity,(select auth.uid()))
    returning id into v_result;
    v_action := 'category_created';
  else
    update public.seat_reservation_categories
    set name=btrim(p_name), color=upper(p_color), reserved_capacity=p_reserved_capacity, updated_at=now()
    where id=p_category_id returning id into v_result;
    v_action := 'category_updated';
  end if;
  insert into public.seat_reservation_audit(organization_id,event_id,category_id,action,actor_user_id,details)
  values(v_event.organization_id,p_event_id,v_result,v_action,(select auth.uid()),jsonb_build_object('name',btrim(p_name),'color',upper(p_color),'reserved_capacity',p_reserved_capacity));
  return v_result;
end $$;

create or replace function public.assign_seats_to_reservation_category(
  p_category_id uuid,
  p_seat_ids uuid[],
  p_reserved_for text default null,
  p_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_category public.seat_reservation_categories; v_count integer; v_existing integer;
begin
  select * into v_category from public.seat_reservation_categories where id=p_category_id and is_active for update;
  if v_category.id is null then raise exception 'Categoria no encontrada' using errcode='P0002'; end if;
  if not (public.is_platform_admin() or exists (
    select 1 from public.memberships m where m.organization_id=v_category.organization_id
      and m.user_id=(select auth.uid()) and m.role::text in ('owner','admin')
  )) then raise exception 'No tienes permisos para gestionar reservas' using errcode='42501'; end if;
  select count(distinct id)::integer into v_count from public.seats where id=any(coalesce(p_seat_ids,'{}'::uuid[])) and event_id=v_category.event_id;
  if v_count <> cardinality(coalesce(p_seat_ids,'{}'::uuid[])) then raise exception 'La seleccion contiene asientos invalidos o repetidos' using errcode='22023'; end if;
  if exists (select 1 from public.seats s where s.id=any(p_seat_ids) and (s.status <> 'available' or s.reservation_category_id is not null)) then
    raise exception 'Solo se pueden asignar asientos disponibles' using errcode='check_violation';
  end if;
  if exists (select 1 from public.registrations r where r.seat_id=any(p_seat_ids) and r.status <> 'rejected') then
    raise exception 'Un asiento esta vinculado a un registro activo' using errcode='check_violation';
  end if;
  select count(*)::integer into v_existing from public.seats where reservation_category_id=p_category_id;
  if v_existing + v_count > v_category.reserved_capacity then
    raise exception 'La seleccion supera los % cupos definidos para %', v_category.reserved_capacity, v_category.name using errcode='check_violation';
  end if;
  update public.seats set status='reserved'::public.seat_status, reservation_category_id=p_category_id,
    reserved_for=coalesce(nullif(btrim(p_reserved_for),''),v_category.name), reservation_notes=nullif(btrim(p_notes),'')
  where id=any(p_seat_ids);
  insert into public.seat_reservation_audit(organization_id,event_id,category_id,seat_id,action,actor_user_id,details)
  select v_category.organization_id,v_category.event_id,v_category.id,s.id,'seat_reserved',(select auth.uid()),
    jsonb_build_object('reserved_for',s.reserved_for,'notes',s.reservation_notes) from public.seats s where s.id=any(p_seat_ids);
  return v_count;
end $$;

create or replace function public.release_institutional_seats(p_seat_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer; v_org uuid; v_event uuid;
begin
  select s.organization_id,s.event_id into v_org,v_event from public.seats s where s.id=any(coalesce(p_seat_ids,'{}'::uuid[])) limit 1;
  if v_org is null then raise exception 'No se encontraron asientos' using errcode='P0002'; end if;
  if not (public.is_platform_admin() or exists (select 1 from public.memberships m where m.organization_id=v_org and m.user_id=(select auth.uid()) and m.role::text in ('owner','admin'))) then
    raise exception 'No tienes permisos para gestionar reservas' using errcode='42501'; end if;
  if exists (select 1 from public.seats s where s.id=any(p_seat_ids) and (s.organization_id<>v_org or s.event_id<>v_event or s.reservation_category_id is null)) then
    raise exception 'La seleccion contiene asientos que no son reservas institucionales del evento' using errcode='22023';
  end if;
  if exists (select 1 from public.registrations r where r.seat_id=any(p_seat_ids) and r.status<>'rejected') then
    raise exception 'Un asiento esta vinculado a un registro activo' using errcode='check_violation';
  end if;
  insert into public.seat_reservation_audit(organization_id,event_id,category_id,seat_id,action,actor_user_id,details)
  select s.organization_id,s.event_id,s.reservation_category_id,s.id,'seat_released',(select auth.uid()),jsonb_build_object('reserved_for',s.reserved_for)
  from public.seats s where s.id=any(p_seat_ids);
  update public.seats set status='available'::public.seat_status,reservation_category_id=null,reserved_for=null,reservation_notes=null where id=any(p_seat_ids);
  get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.delete_seat_reservation_category(p_category_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_category public.seat_reservation_categories;
begin
  select * into v_category from public.seat_reservation_categories where id=p_category_id for update;
  if v_category.id is null then raise exception 'Categoria no encontrada' using errcode='P0002'; end if;
  if not (public.is_platform_admin() or exists (select 1 from public.memberships m where m.organization_id=v_category.organization_id and m.user_id=(select auth.uid()) and m.role::text in ('owner','admin'))) then raise exception 'No tienes permisos para gestionar reservas' using errcode='42501'; end if;
  if exists(select 1 from public.seats where reservation_category_id=p_category_id) then raise exception 'Libera los asientos de la categoria antes de eliminarla' using errcode='check_violation'; end if;
  insert into public.seat_reservation_audit(organization_id,event_id,category_id,action,actor_user_id,details)
  values(v_category.organization_id,v_category.event_id,v_category.id,'category_deleted',(select auth.uid()),jsonb_build_object('name',v_category.name,'reserved_capacity',v_category.reserved_capacity));
  delete from public.seat_reservation_categories where id=p_category_id;
end $$;

revoke all on function public.manage_seat_reservation_category(uuid,text,text,integer,uuid) from public,anon,authenticated;
revoke all on function public.assign_seats_to_reservation_category(uuid,uuid[],text,text) from public,anon,authenticated;
revoke all on function public.release_institutional_seats(uuid[]) from public,anon,authenticated;
revoke all on function public.delete_seat_reservation_category(uuid) from public,anon,authenticated;
grant execute on function public.manage_seat_reservation_category(uuid,text,text,integer,uuid) to authenticated;
grant execute on function public.assign_seats_to_reservation_category(uuid,uuid[],text,text) to authenticated;
grant execute on function public.release_institutional_seats(uuid[]) to authenticated;
grant execute on function public.delete_seat_reservation_category(uuid) to authenticated;

-- El registro publico nunca consume la cuota institucional, aunque sus sillas aun no hayan sido ubicadas.
create or replace function public.register_event_participant(
  p_event_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text,
  p_cedula text default null, p_seat_id uuid default null
)
returns table(registration_id uuid, registration_status public.registration_status, credential_token text, payment_required boolean)
language plpgsql security definer set search_path='' as $$
declare v_event public.events; v_mode text; v_seat_mode text; v_taken integer; v_reserved integer; v_seat public.seats; v_registration public.registrations;
begin
  select * into v_event from public.events where id=p_event_id for update;
  if not found or v_event.status<>'published' then raise exception 'Evento no disponible' using errcode='check_violation'; end if;
  if v_event.registration_deadline is not null and v_event.registration_deadline<now() then raise exception 'El período de registro finalizó' using errcode='check_violation'; end if;
  if length(trim(coalesce(p_first_name,'')))<2 then raise exception 'Ingresa un nombre válido' using errcode='check_violation'; end if;
  if position('@' in trim(coalesce(p_email,'')))<2 then raise exception 'Ingresa un correo válido' using errcode='check_violation'; end if;
  v_mode:=coalesce(v_event.config->>'registration_mode','paid');
  if v_mode='invitation' then raise exception 'Este evento solo admite registros por invitación' using errcode='insufficient_privilege'; end if;
  if v_mode not in ('free','paid') then raise exception 'Modalidad de registro no válida' using errcode='check_violation'; end if;
  if exists(select 1 from public.registrations r where r.event_id=p_event_id and lower(r.email)=lower(trim(p_email)) and r.status<>'rejected') then raise exception 'Ya existe un registro con ese correo para este evento' using errcode='unique_violation'; end if;
  select count(*)::integer into v_taken from public.registrations r where r.event_id=p_event_id and r.status<>'rejected';
  select coalesce(sum(c.reserved_capacity),0)::integer into v_reserved from public.seat_reservation_categories c where c.event_id=p_event_id and c.is_active;
  if v_event.total_slots>0 and v_taken>=greatest(v_event.total_slots-v_reserved,0) then raise exception 'Se agotaron los cupos disponibles para registro general; el resto del aforo está reservado' using errcode='check_violation'; end if;
  v_seat_mode:=coalesce(v_event.config->>'seat_assignment_mode','admin');
  if p_seat_id is not null then
    if coalesce((v_event.config->>'public_seat_selection_enabled')::boolean,false) is not true or v_seat_mode<>'attendee' then raise exception 'La selección pública de puestos no está habilitada' using errcode='insufficient_privilege'; end if;
    select * into v_seat from public.seats s where s.id=p_seat_id and s.event_id=p_event_id for update;
    if v_seat.id is null then raise exception 'Puesto no encontrado' using errcode='no_data_found'; end if;
    if v_seat.status<>'available' or v_seat.reservation_category_id is not null then raise exception 'El puesto ya no está disponible' using errcode='check_violation'; end if;
  end if;
  insert into public.registrations(organization_id,event_id,first_name,last_name,email,phone,cedula,seat_id,status,payment_deadline,payment_confirmed_at)
  values(v_event.organization_id,p_event_id,trim(p_first_name),nullif(trim(p_last_name),''),lower(trim(p_email)),nullif(trim(p_phone),''),nullif(trim(p_cedula),''),p_seat_id,
    case when v_mode='free' then 'confirmed'::public.registration_status else 'pending_payment'::public.registration_status end,
    case when v_mode='paid' then now()+make_interval(days=>v_event.payment_timeout_days) else null end,
    case when v_mode='free' then now() else null end) returning * into v_registration;
  if p_seat_id is not null then update public.seats set status=case when v_mode='free' then 'confirmed'::public.seat_status else 'reserved'::public.seat_status end where id=p_seat_id; end if;
  return query select v_registration.id,v_registration.status,v_registration.credential_token,v_mode='paid';
end $$;
revoke all on function public.register_event_participant(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.register_event_participant(uuid,text,text,text,text,text,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
