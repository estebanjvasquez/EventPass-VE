-- Taller individual: sesiones, precios adicionales, elegibilidad y reservas.

alter table public.event_sessions
  add column if not exists registration_policy text not null default 'closed',
  add column if not exists price numeric(12,2) not null default 0,
  add column if not exists currency text not null default 'USD',
  add column if not exists sales_start timestamptz,
  add column if not exists sales_end timestamptz,
  add column if not exists track text,
  add column if not exists allow_overlap boolean not null default false;
alter table public.event_sessions drop constraint if exists event_sessions_registration_policy_check;
alter table public.event_sessions add constraint event_sessions_registration_policy_check check(registration_policy in ('included','optional_free','optional_paid','closed'));
alter table public.event_sessions drop constraint if exists event_sessions_price_check;
alter table public.event_sessions add constraint event_sessions_price_check check(price>=0);
alter table public.event_sessions drop constraint if exists event_sessions_currency_check;
alter table public.event_sessions add constraint event_sessions_currency_check check(currency ~ '^[A-Z]{3}$');
alter table public.event_sessions drop constraint if exists event_sessions_sales_range_check;
alter table public.event_sessions add constraint event_sessions_sales_range_check check(sales_end is null or sales_start is null or sales_end>sales_start);

create table if not exists public.event_session_ticket_categories(
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  category_id uuid not null references public.event_ticket_categories(id) on delete cascade,
  primary key(session_id,category_id)
);
alter table public.event_session_ticket_categories enable row level security;
grant select,insert,delete on public.event_session_ticket_categories to authenticated;
drop policy if exists event_session_ticket_categories_member_all on public.event_session_ticket_categories;
create policy event_session_ticket_categories_member_all on public.event_session_ticket_categories for all to authenticated
using(exists(select 1 from public.event_sessions s where s.id=session_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())))
with check(exists(select 1 from public.event_sessions s join public.event_ticket_categories c on c.id=category_id where s.id=session_id and c.event_id=s.event_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())));

create table if not exists public.event_registration_session_items(
  registration_id uuid not null references public.registrations(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete restrict,
  name_snapshot text not null,
  price_snapshot numeric(12,2) not null check(price_snapshot>=0),
  currency_snapshot text not null check(currency_snapshot ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  primary key(registration_id,session_id)
);
alter table public.event_registration_session_items enable row level security;
grant select on public.event_registration_session_items to authenticated;
drop policy if exists event_registration_session_items_member_read on public.event_registration_session_items;
create policy event_registration_session_items_member_read on public.event_registration_session_items for select to authenticated
using(exists(select 1 from public.registrations r where r.id=registration_id and (public.is_org_member(r.organization_id) or public.is_platform_admin())));

alter table public.session_reservations drop constraint if exists session_reservations_status_check;
alter table public.session_reservations add constraint session_reservations_status_check check(status in ('pending_payment','confirmed','cancelled','checked_in'));

create or replace function public.enforce_event_session_capacity_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_reserved integer;
begin
  if new.capacity is null or new.capacity is not distinct from old.capacity then return new; end if;
  select count(*)::int into v_reserved from public.session_reservations sr left join public.registrations r on r.id=sr.registration_id
  where sr.session_id=new.id and (sr.status in ('confirmed','checked_in') or (sr.status='pending_payment' and (r.payment_deadline is null or r.payment_deadline>now())));
  if new.capacity<v_reserved then raise exception 'El cupo no puede ser menor que las % reservas activas',v_reserved; end if;
  return new;
end $$;
drop trigger if exists enforce_event_session_capacity_change on public.event_sessions;
create trigger enforce_event_session_capacity_change before update of capacity on public.event_sessions for each row execute function public.enforce_event_session_capacity_change();

create or replace function public.save_event_workshop_session(
  p_event_id uuid,p_session_id uuid,p_name text,p_description text,p_session_type text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_stage_id uuid,p_capacity integer,
  p_registration_policy text,p_price numeric,p_currency text,p_sales_start timestamptz,p_sales_end timestamptz,
  p_track text,p_allow_overlap boolean,p_category_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events; sid uuid; v_policy text; v_price numeric; v_currency text;
begin
  select * into e from public.events where id=p_event_id for update;
  if e.id is null or e.event_type not in ('workshop','forum') or not(public.is_org_member(e.organization_id) or public.is_platform_admin()) then raise exception 'Evento no disponible' using errcode='42501'; end if;
  if nullif(trim(p_name),'') is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Completa un nombre y un horario valido'; end if;
  if p_session_type not in ('lecture','keynote','panel','workshop','roundtable','training','networking','break','other') then raise exception 'Tipo de sesion no valido'; end if;
  if p_capacity is not null and p_capacity<0 then raise exception 'El cupo no puede ser negativo'; end if;
  v_policy:=case when p_session_type='break' then 'closed' else p_registration_policy end;
  if v_policy not in ('included','optional_free','optional_paid','closed') then raise exception 'Modalidad no valida'; end if;
  v_price:=case when v_policy='optional_paid' then coalesce(p_price,0) else 0 end;
  v_currency:=upper(coalesce(nullif(trim(p_currency),''),'USD'));
  if v_price<0 or v_currency !~ '^[A-Z]{3}$' then raise exception 'Precio o moneda no validos'; end if;
  if p_sales_end is not null and p_sales_start is not null and p_sales_end<=p_sales_start then raise exception 'La venta debe finalizar despues de comenzar'; end if;
  if p_stage_id is not null and not exists(select 1 from public.event_stages where id=p_stage_id and event_id=e.id) then raise exception 'La sala no pertenece al evento'; end if;
  if exists(select 1 from unnest(coalesce(p_category_ids,'{}'::uuid[])) cid where not exists(select 1 from public.event_ticket_categories c where c.id=cid and c.event_id=e.id)) then raise exception 'Una categoria no pertenece al evento'; end if;
  if p_session_id is null then
    insert into public.event_sessions(organization_id,event_id,name,description,session_type,starts_at,ends_at,stage_id,capacity,registration_policy,price,currency,sales_start,sales_end,track,allow_overlap,sort_order)
    values(e.organization_id,e.id,trim(p_name),nullif(trim(p_description),''),p_session_type,p_starts_at,p_ends_at,p_stage_id,case when p_session_type='break' then null else p_capacity end,v_policy,v_price,v_currency,p_sales_start,p_sales_end,nullif(trim(p_track),''),coalesce(p_allow_overlap,false),coalesce((select max(sort_order)+1 from public.event_sessions where event_id=e.id),0)) returning id into sid;
  else
    update public.event_sessions set name=trim(p_name),description=nullif(trim(p_description),''),session_type=p_session_type,starts_at=p_starts_at,ends_at=p_ends_at,stage_id=p_stage_id,capacity=case when p_session_type='break' then null else p_capacity end,registration_policy=v_policy,price=v_price,currency=v_currency,sales_start=p_sales_start,sales_end=p_sales_end,track=nullif(trim(p_track),''),allow_overlap=coalesce(p_allow_overlap,false)
    where id=p_session_id and event_id=e.id returning id into sid;
    if sid is null then raise exception 'La sesion no pertenece al evento'; end if;
  end if;
  delete from public.event_session_ticket_categories where session_id=sid;
  insert into public.event_session_ticket_categories(session_id,category_id) select sid,cid from unnest(coalesce(p_category_ids,'{}'::uuid[])) cid on conflict do nothing;
  return sid;
end $$;

create or replace function public.get_public_event_session_catalog(p_event_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'name',s.name,'description',s.description,'session_type',s.session_type,'starts_at',s.starts_at,'ends_at',s.ends_at,
  'stage_name',st.name,'capacity',s.capacity,'reserved',(select count(*) from public.session_reservations sr left join public.registrations r on r.id=sr.registration_id where sr.session_id=s.id and (sr.status in ('confirmed','checked_in') or (sr.status='pending_payment' and (r.payment_deadline is null or r.payment_deadline>now())))),
  'registration_policy',s.registration_policy,'price',s.price,'currency',s.currency,'sales_start',s.sales_start,'sales_end',s.sales_end,'track',s.track,'allow_overlap',s.allow_overlap,
  'eligible_category_ids',(select coalesce(jsonb_agg(x.category_id),'[]'::jsonb) from public.event_session_ticket_categories x where x.session_id=s.id)
) order by s.starts_at,s.sort_order),'[]'::jsonb)
from public.event_sessions s join public.events e on e.id=s.event_id left join public.event_stages st on st.id=s.stage_id
where e.id=p_event_id and e.status='published' and s.status='scheduled' and s.registration_policy<>'closed'
  and (s.sales_start is null or s.sales_start<=now()) and (s.sales_end is null or s.sales_end>now());
$$;

create or replace function public.capture_registration_purchase()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.events; cat public.event_ticket_categories; s public.seats; amount numeric; curr text; taken int; reserved int;
begin
  if tg_op='UPDATE' then
    if (new.purchase_snapshot is distinct from old.purchase_snapshot or new.ticket_category_id is distinct from old.ticket_category_id or new.event_id is distinct from old.event_id or new.organization_id is distinct from old.organization_id)
      and coalesce(current_setting('app.session_checkout',true),'')<>'1' then raise exception 'Las condiciones adquiridas no se pueden modificar'; end if;
    if old.status='rejected' and new.status<>'rejected' then
      select * into e from public.events where id=new.event_id for update;
      select count(*) into taken from public.registrations where event_id=e.id and status<>'rejected';
      select coalesce(sum(reserved_capacity),0)::int into reserved from public.seat_reservation_categories where event_id=e.id and is_active;
      if e.total_slots>0 and taken>=greatest(e.total_slots-reserved,0) then raise exception 'Aforo publico agotado'; end if;
      select * into cat from public.event_ticket_categories where id=new.ticket_category_id;
      if cat.capacity is not null and (select count(*) from public.registrations where ticket_category_id=cat.id and status<>'rejected')>=cat.capacity then raise exception 'Categoria agotada'; end if;
    end if;
    return new;
  end if;
  select * into e from public.events where id=new.event_id for update;
  if new.organization_id<>e.organization_id then raise exception 'Organizacion invalida' using errcode='42501'; end if;
  if coalesce((e.config->>'ticket_categories_enabled')::boolean,false) and new.ticket_category_id is null then raise exception 'Selecciona una categoria de entrada'; end if;
  if new.ticket_category_id is not null then
    select * into cat from public.event_ticket_categories where id=new.ticket_category_id and event_id=e.id and organization_id=e.organization_id;
    if cat.id is null or not cat.published or (cat.sales_start>now()) or (cat.sales_end<=now()) then raise exception 'Categoria no disponible'; end if;
    select count(*) into taken from public.registrations where ticket_category_id=cat.id and status<>'rejected';
    if cat.capacity is not null and taken>=cat.capacity then raise exception 'Categoria agotada'; end if;
  end if;
  select count(*) into taken from public.registrations where event_id=e.id and status<>'rejected';
  select coalesce(sum(reserved_capacity),0)::int into reserved from public.seat_reservation_categories where event_id=e.id and is_active;
  if e.total_slots>0 and taken>=greatest(e.total_slots-reserved,0) then raise exception 'Aforo publico agotado'; end if;
  if new.seat_id is not null then
    select * into s from public.seats where id=new.seat_id and event_id=e.id for update;
    if s.id is null or s.reservation_category_id is not null or s.status<>'available' then raise exception 'Asiento no disponible'; end if;
  end if;
  amount:=case when cat.id is not null then cat.price when e.config->>'registration_mode'='free' then 0 else coalesce(s.price,nullif(e.config->>'price','')::numeric) end;
  curr:=case when cat.id is not null then cat.currency else coalesce(e.config->>'currency','USD') end;
  new.purchase_snapshot:=jsonb_build_object('event_name',e.name,'starts_at',e.start_date,'timezone',coalesce(e.config->>'timezone','America/Caracas'),'venue',coalesce(e.config->>'venue_name',e.config->>'location'),'category',cat.name,'benefits',to_jsonb(cat.benefits),'amount',amount,'currency',curr,'seat',s.seat_number,'price_policy',case when cat.id is not null then 'category' else 'seat_or_event' end);
  if cat.id is not null then
    new.status:=case when amount=0 then 'confirmed'::public.registration_status else 'pending_payment'::public.registration_status end;
    new.payment_deadline:=case when amount>0 then now()+make_interval(days=>e.payment_timeout_days) end;
    new.payment_confirmed_at:=case when amount=0 then now() end;
  end if;
  return new;
end $$;

create or replace function public.sync_registration_session_reservations()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    update public.session_reservations set status=case when new.status='confirmed' then 'confirmed' when new.status='rejected' then 'cancelled' else 'pending_payment' end
    where registration_id=new.id and status<>'checked_in';
  end if;
  return new;
end $$;
drop trigger if exists sync_registration_session_reservations on public.registrations;
create trigger sync_registration_session_reservations after update of status on public.registrations for each row execute function public.sync_registration_session_reservations();

create or replace function public.register_event_session_purchase(
  p_event_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text,p_cedula text default null,
  p_seat_id uuid default null,p_category_id uuid default null,p_session_ids uuid[] default '{}',p_visit_id uuid default null
) returns table(registration_id uuid,registration_status public.registration_status,credential_token text,payment_required boolean)
language plpgsql security definer set search_path='' as $$
declare e public.events; v public.event_funnel_visits; base record; reg public.registrations; ids uuid[]; ses public.event_sessions; reserved int; base_amount numeric:=0; total_amount numeric:=0; curr text:='USD'; session_amount numeric:=0; final_status public.registration_status;
begin
  select * into e from public.events where id=p_event_id and status='published' for update;
  if e.id is null then raise exception 'Registro no disponible'; end if;
  select * into v from public.event_funnel_visits where id=p_visit_id and event_id=p_event_id and created_at>=now()-interval '30 minutes' for update;
  select * into base from public.register_event_purchase(p_event_id,p_first_name,p_last_name,p_email,p_phone,p_cedula,p_seat_id,v.campaign,v.source,v.medium,p_category_id);
  select * into reg from public.registrations where id=base.registration_id for update;
  base_amount:=coalesce((reg.purchase_snapshot->>'amount')::numeric,0); curr:=coalesce(reg.purchase_snapshot->>'currency','USD');
  select array_agg(distinct s.id) into ids from public.event_sessions s where s.event_id=e.id and s.status='scheduled' and s.registration_policy<>'closed'
    and ((s.registration_policy='included' and (not exists(select 1 from public.event_session_ticket_categories x where x.session_id=s.id) or p_category_id in(select x.category_id from public.event_session_ticket_categories x where x.session_id=s.id))) or s.id=any(coalesce(p_session_ids,'{}'::uuid[])));
  if exists(select 1 from unnest(coalesce(p_session_ids,'{}'::uuid[])) x where not exists(select 1 from public.event_sessions s where s.id=x and s.event_id=e.id and s.registration_policy in ('optional_free','optional_paid') and s.status='scheduled')) then raise exception 'Una sesion seleccionada no esta disponible'; end if;
  if exists(select 1 from public.event_sessions s where s.id=any(coalesce(ids,'{}'::uuid[])) and exists(select 1 from public.event_session_ticket_categories x where x.session_id=s.id) and (p_category_id is null or not exists(select 1 from public.event_session_ticket_categories x where x.session_id=s.id and x.category_id=p_category_id))) then raise exception 'Tu entrada no habilita una de las sesiones'; end if;
  perform 1 from public.event_sessions where id=any(coalesce(ids,'{}'::uuid[])) order by id for update;
  for ses in select * from public.event_sessions where id=any(coalesce(ids,'{}'::uuid[])) loop
    if (ses.sales_start is not null and ses.sales_start>now()) or (ses.sales_end is not null and ses.sales_end<=now()) then raise exception 'La sesion % no esta disponible',ses.name; end if;
    select count(*)::int into reserved from public.session_reservations sr left join public.registrations r on r.id=sr.registration_id where sr.session_id=ses.id and (sr.status in ('confirmed','checked_in') or (sr.status='pending_payment' and (r.payment_deadline is null or r.payment_deadline>now())));
    if ses.capacity is not null and reserved>=ses.capacity then raise exception 'La sesion % alcanzo su cupo',ses.name; end if;
  end loop;
  if exists(select 1 from public.event_sessions a join public.event_sessions b on b.id=any(coalesce(ids,'{}'::uuid[])) and b.id<>a.id where a.id=any(coalesce(ids,'{}'::uuid[])) and not a.allow_overlap and not b.allow_overlap and a.starts_at<b.ends_at and b.starts_at<a.ends_at) then raise exception 'Hay sesiones seleccionadas con horarios superpuestos'; end if;
  select coalesce(sum(case when registration_policy='optional_paid' then price else 0 end),0) into session_amount from public.event_sessions where id=any(coalesce(ids,'{}'::uuid[]));
  if session_amount>0 and exists(select 1 from public.event_sessions where id=any(ids) and registration_policy='optional_paid' and currency<>curr and base_amount>0) then raise exception 'La entrada y las sesiones deben usar la misma moneda'; end if;
  if base_amount=0 and session_amount>0 then select max(currency) into curr from public.event_sessions where id=any(ids) and registration_policy='optional_paid'; end if;
  if (select count(distinct currency) from public.event_sessions where id=any(coalesce(ids,'{}'::uuid[])) and registration_policy='optional_paid')>1 then raise exception 'Las sesiones pagas deben usar la misma moneda'; end if;
  total_amount:=base_amount+session_amount; final_status:=case when total_amount=0 then 'confirmed'::public.registration_status else 'pending_payment'::public.registration_status end;
  perform set_config('app.session_checkout','1',true);
  update public.registrations set status=final_status,payment_deadline=case when total_amount>0 then now()+make_interval(days=>e.payment_timeout_days) end,payment_confirmed_at=case when total_amount=0 then now() end,purchase_snapshot=reg.purchase_snapshot||jsonb_build_object('amount',total_amount,'currency',curr,'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'price',case when s.registration_policy='optional_paid' then s.price else 0 end,'currency',s.currency,'starts_at',s.starts_at) order by s.starts_at),'[]'::jsonb) from public.event_sessions s where s.id=any(coalesce(ids,'{}'::uuid[])))) where id=reg.id returning * into reg;
  insert into public.event_registration_session_items(registration_id,session_id,name_snapshot,price_snapshot,currency_snapshot) select reg.id,s.id,s.name,case when s.registration_policy='optional_paid' then s.price else 0 end,s.currency from public.event_sessions s where s.id=any(coalesce(ids,'{}'::uuid[]));
  insert into public.session_reservations(organization_id,event_id,session_id,registration_id,status) select e.organization_id,e.id,s.id,reg.id,case when final_status='confirmed' then 'confirmed' else 'pending_payment' end from public.event_sessions s where s.id=any(coalesce(ids,'{}'::uuid[]));
  if v.id is not null and v.completed_at is null then update public.event_funnel_visits set form_at=coalesce(form_at,now()),completed_at=now(),registration_id=reg.id where id=v.id; end if;
  return query select reg.id,reg.status,reg.credential_token,reg.status='pending_payment';
end $$;

revoke all on function public.enforce_event_session_capacity_change(),public.sync_registration_session_reservations() from public,anon,authenticated;
revoke all on function public.save_event_workshop_session(uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,integer,text,numeric,text,timestamptz,timestamptz,text,boolean,uuid[]),public.get_public_event_session_catalog(uuid),public.register_event_session_purchase(uuid,text,text,text,text,text,uuid,uuid,uuid[],uuid) from public,anon;
grant execute on function public.save_event_workshop_session(uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,integer,text,numeric,text,timestamptz,timestamptz,text,boolean,uuid[]) to authenticated;
grant execute on function public.get_public_event_session_catalog(uuid),public.register_event_session_purchase(uuid,text,text,text,text,text,uuid,uuid,uuid[],uuid) to anon,authenticated;
notify pgrst,'reload schema';
