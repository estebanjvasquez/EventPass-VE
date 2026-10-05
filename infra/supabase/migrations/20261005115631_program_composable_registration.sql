-- Registro compuesto de programas: componentes incluidos, opcionales y pagos.
-- Mantiene el registro individual existente y añade una compra/credencial única.

alter table public.program_events
  add column if not exists registration_policy text not null default 'independent',
  add column if not exists registration_price numeric(12,2) not null default 0,
  add column if not exists registration_currency text not null default 'USD',
  add column if not exists registration_capacity integer;

alter table public.program_events drop constraint if exists program_events_registration_policy_check;
alter table public.program_events add constraint program_events_registration_policy_check
  check (registration_policy in ('included','optional_free','optional_paid','independent','invite_only'));
alter table public.program_events drop constraint if exists program_events_registration_price_check;
alter table public.program_events add constraint program_events_registration_price_check check (registration_price >= 0);
alter table public.program_events drop constraint if exists program_events_registration_capacity_check;
alter table public.program_events add constraint program_events_registration_capacity_check check (registration_capacity is null or registration_capacity >= 0);
alter table public.program_events drop constraint if exists program_events_registration_currency_check;
alter table public.program_events add constraint program_events_registration_currency_check check (registration_currency ~ '^[A-Z]{3}$');

create table if not exists public.program_registration_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.event_programs(id) on delete cascade,
  source_event_id uuid references public.events(id) on delete cascade,
  name text not null,
  description text,
  item_type text not null default 'bundle' check (item_type in ('event','session','zone','bundle')),
  selection_type text not null default 'optional' check (selection_type in ('required','optional')),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  capacity integer check (capacity is null or capacity >= 0),
  sales_start timestamptz,
  sales_end timestamptz,
  is_public boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sales_end is null or sales_start is null or sales_end > sales_start)
);
create unique index if not exists uq_program_registration_item_event
  on public.program_registration_items(program_id,source_event_id) where source_event_id is not null and item_type='event';
create index if not exists idx_program_registration_items_public
  on public.program_registration_items(program_id,active,is_public,sort_order);

create table if not exists public.program_registration_entitlements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.program_registration_items(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  session_id uuid references public.event_sessions(id) on delete cascade,
  zone_id uuid references public.event_zones(id) on delete cascade,
  access_date date,
  created_at timestamptz not null default now(),
  check (((event_id is not null)::int + (session_id is not null)::int + (zone_id is not null)::int + (access_date is not null)::int) = 1)
);
create unique index if not exists uq_program_registration_entitlement_event on public.program_registration_entitlements(item_id,event_id) where event_id is not null;
create unique index if not exists uq_program_registration_entitlement_session on public.program_registration_entitlements(item_id,session_id) where session_id is not null;
create unique index if not exists uq_program_registration_entitlement_zone on public.program_registration_entitlements(item_id,zone_id) where zone_id is not null;
create unique index if not exists uq_program_registration_entitlement_date on public.program_registration_entitlements(item_id,access_date) where access_date is not null;

create table if not exists public.program_registration_orders (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.event_programs(id) on delete cascade,
  participation_id uuid not null references public.event_participations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null check (status in ('pending_payment','payment_submitted','confirmed','rejected','cancelled','expired')),
  total numeric(12,2) not null default 0 check (total >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_deadline timestamptz,
  payment_token text not null unique default encode(gen_random_bytes(24),'hex'),
  comprobante_path text,
  payment_method text,
  payment_amount numeric(12,2),
  payment_currency text,
  rejection_reason text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_program_registration_orders_program on public.program_registration_orders(program_id,status,created_at desc);
create index if not exists idx_program_registration_orders_participation on public.program_registration_orders(participation_id,created_at desc);

create table if not exists public.program_registration_order_items (
  order_id uuid not null references public.program_registration_orders(id) on delete cascade,
  item_id uuid not null references public.program_registration_items(id) on delete restrict,
  name_snapshot text not null,
  price_snapshot numeric(12,2) not null check (price_snapshot >= 0),
  currency_snapshot text not null check (currency_snapshot ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  primary key(order_id,item_id)
);
create index if not exists idx_program_order_items_capacity on public.program_registration_order_items(item_id,order_id);

drop trigger if exists trg_program_registration_item_updated on public.program_registration_items;
create trigger trg_program_registration_item_updated before update on public.program_registration_items
for each row execute function public.set_updated_at();
drop trigger if exists trg_program_registration_order_updated on public.program_registration_orders;
create trigger trg_program_registration_order_updated before update on public.program_registration_orders
for each row execute function public.set_updated_at();

alter table public.program_registration_items enable row level security;
alter table public.program_registration_entitlements enable row level security;
alter table public.program_registration_orders enable row level security;
alter table public.program_registration_order_items enable row level security;

grant select,insert,update,delete on public.program_registration_items to authenticated;
grant select,insert,update,delete on public.program_registration_entitlements to authenticated;
grant select,update on public.program_registration_orders to authenticated;
grant select on public.program_registration_order_items to authenticated;

drop policy if exists program_registration_items_member_all on public.program_registration_items;
create policy program_registration_items_member_all on public.program_registration_items for all to authenticated
using (exists(select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())))
with check (exists(select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
drop policy if exists program_registration_entitlements_member_all on public.program_registration_entitlements;
create policy program_registration_entitlements_member_all on public.program_registration_entitlements for all to authenticated
using (exists(select 1 from public.program_registration_items i join public.event_programs p on p.id=i.program_id where i.id=item_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())))
with check (exists(select 1 from public.program_registration_items i join public.event_programs p on p.id=i.program_id where i.id=item_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
drop policy if exists program_registration_orders_member_read on public.program_registration_orders;
create policy program_registration_orders_member_read on public.program_registration_orders for select to authenticated
using (exists(select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));
drop policy if exists program_registration_order_items_member_read on public.program_registration_order_items;
create policy program_registration_order_items_member_read on public.program_registration_order_items for select to authenticated
using (exists(select 1 from public.program_registration_orders o join public.event_programs p on p.id=o.program_id where o.id=order_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));

create or replace function public.enforce_program_item_capacity_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare reserved integer;
begin
  if new.capacity is null or new.capacity is not distinct from old.capacity then return new; end if;
  select count(*)::int into reserved
  from public.program_registration_order_items oi join public.program_registration_orders o on o.id=oi.order_id
  where oi.item_id=new.id and (o.status in ('payment_submitted','confirmed') or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now())));
  if new.capacity < reserved then raise exception 'El cupo no puede ser menor que las % plazas ya reservadas.',reserved using errcode='check_violation'; end if;
  return new;
end $$;
drop trigger if exists enforce_program_item_capacity_change on public.program_registration_items;
create trigger enforce_program_item_capacity_change before update of capacity on public.program_registration_items
for each row execute function public.enforce_program_item_capacity_change();

create or replace function public.validate_program_registration_entitlement()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_program_id uuid;
begin
  select i.program_id into v_program_id from public.program_registration_items i where i.id=new.item_id;
  if v_program_id is null then raise exception 'Oferta no disponible'; end if;
  if new.event_id is not null and not exists(select 1 from public.program_events pe where pe.program_id=v_program_id and pe.event_id=new.event_id) then raise exception 'El evento no pertenece al programa'; end if;
  if new.session_id is not null and not exists(select 1 from public.event_sessions s join public.program_events pe on pe.event_id=s.event_id where s.id=new.session_id and pe.program_id=v_program_id) then raise exception 'La sesión no pertenece al programa'; end if;
  if new.zone_id is not null and not exists(select 1 from public.event_zones z join public.program_events pe on pe.event_id=z.event_id where z.id=new.zone_id and pe.program_id=v_program_id) then raise exception 'La zona no pertenece al programa'; end if;
  return new;
end $$;
drop trigger if exists validate_program_registration_entitlement on public.program_registration_entitlements;
create trigger validate_program_registration_entitlement before insert or update on public.program_registration_entitlements
for each row execute function public.validate_program_registration_entitlement();

create or replace function public.save_program_registration_config(p_program_id uuid,p_mode text,p_components jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare pr public.event_programs; c jsonb; eid uuid; policy text; amount numeric; curr text; cap integer; item_id uuid; event_name text;
begin
  select * into pr from public.event_programs where id=p_program_id for update;
  if pr.id is null or not (public.is_org_member(pr.organization_id) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_mode not in ('separate','unified','modular','hybrid') then raise exception 'Modo de registro no válido'; end if;
  if jsonb_typeof(coalesce(p_components,'[]'::jsonb))<>'array' then raise exception 'Componentes no válidos'; end if;
  update public.event_programs set registration_config=jsonb_set(coalesce(registration_config,'{}'::jsonb),'{registration_mode}',to_jsonb(p_mode),true) where id=p_program_id;
  for c in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    eid:=(c->>'event_id')::uuid; policy:=coalesce(c->>'policy','independent'); amount:=coalesce((c->>'price')::numeric,0); curr:=upper(coalesce(nullif(c->>'currency',''),'USD')); cap:=nullif(c->>'capacity','')::integer;
    if policy not in ('included','optional_free','optional_paid','independent','invite_only') or amount<0 or cap<0 then raise exception 'Configuración inválida'; end if;
    if not exists(select 1 from public.program_events where program_id=p_program_id and event_id=eid) then raise exception 'El evento no pertenece al programa'; end if;
    update public.program_events set registration_policy=policy,registration_price=case when policy='optional_paid' then amount else 0 end,registration_currency=curr,registration_capacity=cap where program_id=p_program_id and event_id=eid;
    select name into event_name from public.events where id=eid;
    select id into item_id from public.program_registration_items where program_id=p_program_id and source_event_id=eid and item_type='event';
    if policy in ('included','optional_free','optional_paid') then
      if item_id is null then
        insert into public.program_registration_items(program_id,source_event_id,name,item_type,selection_type,price,currency,capacity,is_public,active)
        values(p_program_id,eid,event_name,'event',case when policy='included' then 'required' else 'optional' end,case when policy='optional_paid' then amount else 0 end,curr,cap,true,true) returning id into item_id;
      else
        update public.program_registration_items set name=event_name,selection_type=case when policy='included' then 'required' else 'optional' end,price=case when policy='optional_paid' then amount else 0 end,currency=curr,capacity=cap,is_public=true,active=true where id=item_id;
      end if;
      insert into public.program_registration_entitlements(item_id,event_id) values(item_id,eid) on conflict do nothing;
    elsif item_id is not null then
      update public.program_registration_items set active=false,is_public=false where id=item_id;
    end if;
  end loop;
end $$;

create or replace function public.get_public_program_registration_catalog(p_program_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when p.id is null then null else jsonb_build_object(
    'program',jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'venue_name',p.venue_name,'starts_at',p.starts_at,'ends_at',p.ends_at,'mode',coalesce(p.registration_config->>'registration_mode','separate'),'timezone',coalesce(p.registration_config->>'timezone','America/Caracas'),'brand_name',p.registration_config->>'brand_name','primary_color',p.registration_config->>'primary_color'),
    'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'event_type',e.event_type,'policy',pe.registration_policy,'price',pe.registration_price,'currency',pe.registration_currency,'capacity',pe.registration_capacity) order by pe.sort_order,e.name),'[]'::jsonb) from public.program_events pe join public.events e on e.id=pe.event_id where pe.program_id=p.id and e.status='published'),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'description',i.description,'item_type',i.item_type,'selection_type',i.selection_type,'price',i.price,'currency',i.currency,'capacity',i.capacity,'reserved',(select count(*) from public.program_registration_order_items oi join public.program_registration_orders o on o.id=oi.order_id where oi.item_id=i.id and (o.status in ('payment_submitted','confirmed') or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now())))),'sales_start',i.sales_start,'sales_end',i.sales_end,'entitlements',(select coalesce(jsonb_agg(jsonb_build_object('event_id',en.event_id,'session_id',en.session_id,'zone_id',en.zone_id,'access_date',en.access_date,'label',coalesce(ev.name,se.name,zo.name,en.access_date::text))),'[]'::jsonb) from public.program_registration_entitlements en left join public.events ev on ev.id=en.event_id left join public.event_sessions se on se.id=en.session_id left join public.event_zones zo on zo.id=en.zone_id where en.item_id=i.id)) order by i.sort_order,i.created_at),'[]'::jsonb) from public.program_registration_items i where i.program_id=p.id and i.active and i.is_public and (i.sales_start is null or i.sales_start<=now()) and (i.sales_end is null or i.sales_end>=now()))
  ) end from public.event_programs p where p.id=p_program_id and p.status='published';
$$;

create or replace function public.register_program_selection(
  p_program_id uuid,p_item_ids uuid[],p_first_name text,p_last_name text,p_email text,p_phone text,
  p_cedula text default null,p_company text default null,p_job_title text default null,p_city text default null,p_country text default null,
  p_participation_type text default 'attendee',p_profile_data jsonb default '{}'::jsonb,p_visit_id uuid default null
) returns table(participation_id uuid,credential_token text,participation_status text,order_id uuid,order_token text,order_status text,total numeric,currency text)
language plpgsql security definer set search_path='' as $$
declare pr public.event_programs; org uuid; person uuid; part public.event_participations; ord public.program_registration_orders; ids uuid[]; item public.program_registration_items; session_row public.event_sessions; reserved integer; total_amount numeric:=0; curr text:='USD'; snap jsonb; timeout_days integer;
begin
  select * into pr from public.event_programs where id=p_program_id and status='published' for share;
  if pr.id is null or coalesce(pr.registration_config->>'registration_mode','separate')='separate' then raise exception 'El registro conjunto no está disponible'; end if;
  if p_participation_type not in ('attendee','guest','vip','speaker','exhibitor') then raise exception 'Perfil no disponible' using errcode='42501'; end if;
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_email),'') is null then raise exception 'Nombre y correo son obligatorios'; end if;
  org:=pr.organization_id;
  select array_agg(distinct id) into ids from public.program_registration_items where program_id=p_program_id and active and is_public and (selection_type='required' or id=any(coalesce(p_item_ids,'{}'::uuid[])));
  if coalesce(array_length(ids,1),0)=0 then raise exception 'Selecciona al menos un acceso'; end if;
  if exists(select 1 from unnest(coalesce(p_item_ids,'{}'::uuid[])) x where not exists(select 1 from public.program_registration_items i where i.id=x and i.program_id=p_program_id and i.active and i.is_public)) then raise exception 'Uno de los accesos no está disponible'; end if;
  perform 1 from public.program_registration_items where id=any(ids) order by id for update;
  select coalesce(sum(i.price),0),coalesce(max(i.currency) filter(where i.price>0),'USD') into total_amount,curr from public.program_registration_items i where i.id=any(ids);
  if (select count(distinct i.currency) from public.program_registration_items i where i.id=any(ids) and i.price>0)>1 then raise exception 'Todos los accesos pagos deben usar la misma moneda'; end if;
  for item in select * from public.program_registration_items where id=any(ids) loop
    if (item.sales_start is not null and item.sales_start>now()) or (item.sales_end is not null and item.sales_end<now()) then raise exception 'El acceso % no está a la venta',item.name; end if;
    select count(*)::int into reserved from public.program_registration_order_items oi join public.program_registration_orders o on o.id=oi.order_id where oi.item_id=item.id and (o.status in ('payment_submitted','confirmed') or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now())));
    if item.capacity is not null and reserved>=item.capacity then raise exception 'El acceso % alcanzó su capacidad',item.name; end if;
  end loop;
  for session_row in select s.* from public.event_sessions s where exists(select 1 from public.program_registration_entitlements en where en.session_id=s.id and en.item_id=any(ids)) order by s.id for update loop
    if session_row.capacity is not null then
      select
        (select count(*)::int from public.session_reservations r where r.session_id=session_row.id and r.status in ('confirmed','checked_in'))
        +
        (select count(distinct o.id)::int from public.program_registration_orders o join public.program_registration_order_items oi on oi.order_id=o.id join public.program_registration_entitlements en on en.item_id=oi.item_id where en.session_id=session_row.id and (o.status='payment_submitted' or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now()))))
      into reserved;
      if reserved>=session_row.capacity then raise exception 'La sesión % alcanzó su capacidad',session_row.name; end if;
    end if;
  end loop;
  if exists(select 1 from public.program_registration_entitlements a join public.event_sessions sa on sa.id=a.session_id join public.program_registration_entitlements b on b.item_id=any(ids) and b.session_id is not null and b.session_id<>a.session_id join public.event_sessions sb on sb.id=b.session_id where a.item_id=any(ids) and sa.starts_at is not null and sa.ends_at is not null and sb.starts_at is not null and sb.ends_at is not null and sa.starts_at<sb.ends_at and sb.starts_at<sa.ends_at) then raise exception 'Hay talleres o sesiones seleccionados con horarios superpuestos'; end if;
  insert into public.people(organization_id,first_name,last_name,email,phone,cedula,company,job_title,city,country,profile_data)
  values(org,trim(p_first_name),nullif(trim(p_last_name),''),lower(trim(p_email)),nullif(trim(p_phone),''),nullif(trim(p_cedula),''),nullif(trim(p_company),''),nullif(trim(p_job_title),''),nullif(trim(p_city),''),nullif(trim(p_country),''),coalesce(p_profile_data,'{}'::jsonb))
  on conflict(organization_id,email) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,cedula=excluded.cedula,company=excluded.company,job_title=excluded.job_title,city=excluded.city,country=excluded.country,profile_data=excluded.profile_data returning id into person;
  snap:=jsonb_build_object('event_name',pr.name,'starts_at',pr.starts_at,'venue',pr.venue_name,'timezone',coalesce(pr.registration_config->>'timezone','America/Caracas'),'amount',total_amount,'currency',curr,'benefits',(select jsonb_agg(name order by sort_order,created_at) from public.program_registration_items where id=any(ids)));
  select ep.* into part from public.event_participations ep where ep.program_id=p_program_id and ep.person_id=person and ep.event_id is null and ep.participation_type=p_participation_type order by ep.created_at desc limit 1 for update;
  if part.id is null then
    insert into public.event_participations(program_id,person_id,event_id,participation_type,status,source,purchase_snapshot) values(p_program_id,person,null,p_participation_type,case when total_amount=0 then 'approved' else 'pending' end,'public',snap) returning * into part;
  else
    update public.event_participations set status=case when total_amount=0 or status='approved' then 'approved' else 'pending' end,purchase_snapshot=case when purchase_snapshot='{}'::jsonb then snap else purchase_snapshot end where id=part.id returning * into part;
  end if;
  timeout_days:=greatest(coalesce((pr.registration_config->>'payment_timeout_days')::integer,10),1);
  insert into public.program_registration_orders(program_id,participation_id,person_id,status,total,currency,payment_deadline,snapshot)
  values(p_program_id,part.id,person,case when total_amount=0 then 'confirmed' else 'pending_payment' end,total_amount,curr,case when total_amount>0 then now()+make_interval(days=>timeout_days) end,snap) returning * into ord;
  insert into public.program_registration_order_items(order_id,item_id,name_snapshot,price_snapshot,currency_snapshot) select ord.id,i.id,i.name,i.price,i.currency from public.program_registration_items i where i.id=any(ids);
  if total_amount=0 then
    insert into public.session_reservations(organization_id,event_id,session_id,participation_id,status)
    select s.organization_id,s.event_id,s.id,part.id,'confirmed' from public.program_registration_entitlements en join public.event_sessions s on s.id=en.session_id where en.item_id=any(ids)
    on conflict do nothing;
    update public.session_reservations r set status='confirmed' where r.participation_id=part.id and r.session_id in (select en.session_id from public.program_registration_entitlements en where en.item_id=any(ids) and en.session_id is not null);
  end if;
  if p_visit_id is not null then update public.event_funnel_visits v set participation_id=part.id,completed_at=coalesce(v.completed_at,now()) where v.id=p_visit_id and v.program_id=p_program_id and v.participation_id is null; end if;
  return query select part.id,part.credential_token,part.status,ord.id,ord.payment_token,ord.status,ord.total,ord.currency;
end $$;

create or replace function public.get_program_order_by_token(p_token text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('order_id',o.id,'organization_id',p.organization_id,'program_id',p.id,'program_name',p.name,'first_name',pe.first_name,'status',o.status,'total',o.total,'currency',o.currency,'payment_deadline',o.payment_deadline,'has_comprobante',o.comprobante_path is not null,'items',(select coalesce(jsonb_agg(jsonb_build_object('name',oi.name_snapshot,'price',oi.price_snapshot,'currency',oi.currency_snapshot)),'[]'::jsonb) from public.program_registration_order_items oi where oi.order_id=o.id))
  from public.program_registration_orders o join public.event_programs p on p.id=o.program_id join public.people pe on pe.id=o.person_id where o.payment_token=trim(p_token);
$$;

create or replace function public.submit_program_comprobante(p_token text,p_path text,p_method text default null,p_amount numeric default null,p_currency text default null)
returns void language plpgsql security definer set search_path='' as $$
declare o public.program_registration_orders; org uuid;
begin
  select * into o from public.program_registration_orders where payment_token=trim(p_token) for update;
  if o.id is null or o.status not in ('pending_payment','payment_submitted') or (o.payment_deadline is not null and o.payment_deadline<now()) then raise exception 'El enlace de pago no está disponible'; end if;
  select organization_id into org from public.event_programs where id=o.program_id;
  if p_path not like org::text||'/'||o.id::text||'/%' then raise exception 'Ruta de comprobante inválida'; end if;
  update public.program_registration_orders set comprobante_path=p_path,payment_method=nullif(trim(p_method),''),payment_amount=p_amount,payment_currency=upper(coalesce(nullif(trim(p_currency),''),o.currency)),status='payment_submitted' where id=o.id;
end $$;

create or replace function public.review_program_order(p_order_id uuid,p_approve boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare o public.program_registration_orders; pr public.event_programs; en public.event_sessions; taken integer;
begin
  select * into o from public.program_registration_orders where id=p_order_id for update;
  select * into pr from public.event_programs where id=o.program_id;
  if o.id is null or not (public.is_org_member(pr.organization_id) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if o.status<>'payment_submitted' then raise exception 'Este pago ya no está pendiente de revisión'; end if;
  if p_approve then
    for en in select s.* from public.event_sessions s where exists(select 1 from public.program_registration_order_items oi join public.program_registration_entitlements e on e.item_id=oi.item_id where oi.order_id=o.id and e.session_id=s.id) order by s.id for update loop
      if en.capacity is not null then select count(*)::int into taken from public.session_reservations r where r.session_id=en.id and r.status in ('confirmed','checked_in') and r.participation_id<>o.participation_id; if taken>=en.capacity then raise exception 'La sesión % alcanzó su capacidad',en.name; end if; end if;
      insert into public.session_reservations(organization_id,event_id,session_id,participation_id,status) values(en.organization_id,en.event_id,en.id,o.participation_id,'confirmed') on conflict(session_id,participation_id) where participation_id is not null do update set status='confirmed';
    end loop;
    update public.program_registration_orders set status='confirmed',rejection_reason=null where id=o.id;
    update public.event_participations set status='approved' where id=o.participation_id;
  else
    update public.program_registration_orders set status='rejected',rejection_reason=coalesce(nullif(trim(p_reason),''),'Pago rechazado') where id=o.id;
    update public.event_participations set status=case when exists(select 1 from public.program_registration_orders other where other.participation_id=o.participation_id and other.id<>o.id and other.status='confirmed') then 'approved' else 'rejected' end where id=o.participation_id;
  end if;
end $$;

-- La compra compuesta proporciona su propia fotografía inmutable.
create or replace function public.capture_program_purchase()
returns trigger language plpgsql security definer set search_path='' as $$
declare pr public.event_programs; e public.events;
begin
  if tg_op='UPDATE' then
    if new.purchase_snapshot is distinct from old.purchase_snapshot and old.purchase_snapshot<>'{}'::jsonb then raise exception 'Las condiciones adquiridas no se pueden modificar'; end if;
    return new;
  end if;
  if new.purchase_snapshot<>'{}'::jsonb then return new; end if;
  select * into pr from public.event_programs where id=new.program_id;
  if new.event_id is not null then select * into e from public.events where id=new.event_id; end if;
  new.purchase_snapshot:=jsonb_build_object('event_name',coalesce(e.name,pr.name),'starts_at',coalesce(e.start_date,pr.starts_at),'venue',pr.venue_name,'timezone',coalesce(pr.registration_config->>'timezone','America/Caracas'),'amount',null,'currency',null);
  return new;
end $$;

-- Credencial única: acepta derechos heredados y derechos de compras compuestas confirmadas.
create or replace function public.validate_program_checkin(p_credential_token text,p_access_point_id uuid,p_device_label text default null)
returns table(result text,participant_name text,reason text,event_id uuid)
language plpgsql security definer set search_path='' as $$
declare point public.access_points; part public.event_participations; person public.people; allowed boolean;
begin
  select * into point from public.access_points a where a.id=p_access_point_id;
  if point.id is null or not public.has_event_staff_scope(point.event_id,point.id,'checkin.perform') then raise exception 'No tienes permiso de check-in en este punto de acceso' using errcode='42501'; end if;
  select ep.* into part from public.event_participations ep join public.people pe on pe.id=ep.person_id where ep.credential_token=trim(p_credential_token) and pe.organization_id=point.organization_id limit 1;
  if part.id is null then return query select 'denied'::text,null::text,'Código no válido para esta organización.'::text,point.event_id; return; end if;
  select * into person from public.people pe where pe.id=part.person_id;
  if part.status<>'approved' then return query select 'denied'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Participación sin aprobar.'::text,point.event_id; return; end if;
  select exists(select 1 from public.participation_passes pp join public.pass_entitlements en on en.pass_id=pp.pass_id where pp.participation_id=part.id and (en.event_id=point.event_id or en.zone_id=point.zone_id or en.access_date=current_date))
    or exists(select 1 from public.program_registration_orders o join public.program_registration_order_items oi on oi.order_id=o.id join public.program_registration_entitlements en on en.item_id=oi.item_id where o.participation_id=part.id and o.status='confirmed' and (en.event_id=point.event_id or en.zone_id=point.zone_id or en.access_date=current_date)) into allowed;
  if not allowed then return query select 'denied'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'La credencial no habilita este acceso.'::text,point.event_id; return; end if;
  if exists(select 1 from public.checkin_records r where r.participation_id=part.id and r.access_point_id=point.id and r.result in ('allowed','validated')) then return query select 'duplicate'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Esta credencial ya fue validada en este punto.'::text,point.event_id; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(point.organization_id,part.id,point.event_id,point.id,'allowed',auth.uid(),nullif(trim(p_device_label),''));
  return query select 'allowed'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Acceso autorizado.'::text,point.event_id;
end $$;

create or replace function public.validate_session_checkin(p_credential_token text,p_access_point_id uuid,p_session_id uuid,p_device_label text default null)
returns table(result text,participant_name text,reason text,remaining int)
language plpgsql security definer set search_path='' as $$
declare point public.access_points; session public.event_sessions; part public.event_participations; person public.people; allowed boolean; left_count integer;
begin
  select * into point from public.access_points a where a.id=p_access_point_id;
  select * into session from public.event_sessions s where s.id=p_session_id;
  if point.id is null or session.id is null or point.event_id<>session.event_id then raise exception 'Punto de acceso o sesión no disponibles' using errcode='42501'; end if;
  if not public.has_event_staff_scope(session.event_id,point.id,'checkin.perform') and not (public.has_org_role(session.organization_id,array['owner','admin']::public.member_role[]) or exists(select 1 from public.session_staff_assignments a where a.session_id=p_session_id and a.user_id=auth.uid() and a.responsibility in ('host','moderator','checkin'))) then raise exception 'No tienes permiso operativo para esta sesión' using errcode='42501'; end if;
  select ep.* into part from public.event_participations ep join public.people pe on pe.id=ep.person_id where ep.credential_token=trim(p_credential_token) and pe.organization_id=session.organization_id limit 1;
  if part.id is null or part.status<>'approved' then return query select 'denied'::text,null::text,'Credencial no válida o pendiente de aprobación.'::text,null::int; return; end if;
  select * into person from public.people pe where pe.id=part.person_id;
  select exists(select 1 from public.participation_passes pp join public.pass_entitlements en on en.pass_id=pp.pass_id where pp.participation_id=part.id and (en.session_id=p_session_id or en.event_id=session.event_id))
    or exists(select 1 from public.program_registration_orders o join public.program_registration_order_items oi on oi.order_id=o.id join public.program_registration_entitlements en on en.item_id=oi.item_id where o.participation_id=part.id and o.status='confirmed' and (en.session_id=p_session_id or en.event_id=session.event_id)) into allowed;
  if not allowed then return query select 'denied'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'La credencial no habilita esta sesión.'::text,null::int; return; end if;
  if session.session_type='workshop' and not exists(select 1 from public.session_reservations r where r.session_id=p_session_id and r.participation_id=part.id and r.status in ('confirmed','checked_in')) then return query select 'denied'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Requiere una reserva confirmada para este taller.'::text,null::int; return; end if;
  if exists(select 1 from public.checkin_records r where r.participation_id=part.id and r.access_point_id=point.id and r.result in ('allowed','validated')) then return query select 'duplicate'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Ya fue validado en este punto.'::text,null::int; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(session.organization_id,part.id,session.event_id,point.id,'validated',auth.uid(),nullif(trim(p_device_label),''));
  update public.session_reservations set status='checked_in',checked_in_at=now() where session_id=p_session_id and participation_id=part.id and status='confirmed';
  if session.capacity is not null then select greatest(session.capacity-count(*)::int,0) into left_count from public.session_reservations r where r.session_id=p_session_id and r.status in ('confirmed','checked_in'); end if;
  return query select 'allowed'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Acceso a la sesión autorizado.'::text,left_count;
end $$;

create or replace function public.manual_program_checkin(p_participation_id uuid,p_access_point_id uuid)
returns table(result text,participant_name text,reason text)
language plpgsql security definer set search_path='' as $$
declare part public.event_participations; point public.access_points; person public.people; allowed boolean;
begin
  select * into part from public.event_participations ep where ep.id=p_participation_id;
  select * into point from public.access_points a where a.id=p_access_point_id;
  if part.id is null or point.id is null or not public.has_event_staff_scope(point.event_id,point.id,'checkin.perform') then raise exception 'No tienes permiso de check-in en este punto' using errcode='42501'; end if;
  if coalesce((select (e.config->>'checkin_enabled')::boolean from public.events e where e.id=point.event_id),true) is false then return query select 'disabled'::text,null::text,'El check-in está desactivado para este evento.'::text; return; end if;
  select * into person from public.people pe where pe.id=part.person_id;
  if part.status<>'approved' then return query select 'denied'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Participación sin aprobar.'::text; return; end if;
  select exists(select 1 from public.participation_passes pp join public.pass_entitlements en on en.pass_id=pp.pass_id where pp.participation_id=part.id and (en.event_id=point.event_id or en.zone_id=point.zone_id or en.access_date=current_date))
    or exists(select 1 from public.program_registration_orders o join public.program_registration_order_items oi on oi.order_id=o.id join public.program_registration_entitlements en on en.item_id=oi.item_id where o.participation_id=part.id and o.status='confirmed' and (en.event_id=point.event_id or en.zone_id=point.zone_id or en.access_date=current_date)) into allowed;
  if not allowed then return query select 'denied'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'La credencial no habilita este acceso.'::text; return; end if;
  if exists(select 1 from public.checkin_records r where r.participation_id=part.id and r.access_point_id=point.id and r.result in ('allowed','validated')) then return query select 'duplicate'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Ya fue validado en este punto.'::text; return; end if;
  insert into public.checkin_records(organization_id,participation_id,event_id,access_point_id,result,scanned_by,device_label) values(point.organization_id,part.id,point.event_id,point.id,'validated',auth.uid(),'manual');
  return query select 'allowed'::text,trim(person.first_name||' '||coalesce(person.last_name,'')),'Ingreso manual registrado.'::text;
end $$;

create or replace function public.get_participant_records(p_session_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.participant_access; result jsonb;
begin
  select * into a from public.participant_access where token_hash=p_session_hash and kind='session' and revoked_at is null and expires_at>now();
  if a.token_hash is null then return null; end if;
  select coalesce(jsonb_agg(row),'[]') into result from (
    select jsonb_build_object('id',r.id,'reference',left(r.id::text,8),'event_id',e.id,'program_id',null,'name',r.first_name||' '||coalesce(r.last_name,''),'status',r.status,'reason',r.rejection_reason,'deadline',r.payment_deadline,'snapshot',case when r.purchase_snapshot='{}'::jsonb then jsonb_build_object('event_name',e.name,'starts_at',e.start_date,'timezone',coalesce(e.config->>'timezone','America/Caracas'),'amount',null,'currency',null,'legacy',true) else r.purchase_snapshot end,'credential_token',case when r.status='confirmed' then r.credential_token end,'upload_token',case when r.status='pending_payment' and (r.payment_deadline is null or r.payment_deadline>now()) then r.credential_token end,'email_status',(select status from public.email_log where registration_id=r.id order by created_at desc limit 1)) row
    from public.registrations r join public.events e on e.id=r.event_id where r.id=any(a.registration_ids)
    union all
    select jsonb_build_object('id',ep.id,'reference',left(ep.id::text,8),'program_id',pr.id,'event_id',ep.event_id,'name',pe.first_name||' '||coalesce(pe.last_name,''),'status',coalesce(po.status,case ep.status when 'approved' then 'confirmed' when 'pending' then 'pending_approval' else ep.status end),'reason',po.rejection_reason,'deadline',po.payment_deadline,'snapshot',coalesce(po.snapshot,case when ep.purchase_snapshot='{}'::jsonb then jsonb_build_object('event_name',pr.name,'starts_at',pr.starts_at,'venue',pr.venue_name,'timezone','America/Caracas','amount',null,'legacy',true) else ep.purchase_snapshot end),'passes',coalesce((select jsonb_agg(oi.name_snapshot) from public.program_registration_order_items oi where oi.order_id=po.id),(select jsonb_agg(p.name) from public.participation_passes pp join public.passes p on p.id=pp.pass_id where pp.participation_id=ep.id),'[]'::jsonb),'credential_token',case when ep.status='approved' then ep.credential_token end,'upload_token',case when po.status in ('pending_payment','payment_submitted') and (po.payment_deadline is null or po.payment_deadline>now()) then po.payment_token end,'upload_kind',case when po.id is not null then 'program' end) row
    from public.event_participations ep join public.people pe on pe.id=ep.person_id join public.event_programs pr on pr.id=ep.program_id left join lateral(select o.* from public.program_registration_orders o where o.participation_id=ep.id order by o.created_at desc limit 1) po on true where ep.id=any(a.participation_ids)
  ) records;
  return result;
end $$;
revoke all on function public.get_participant_records(text) from public,anon,authenticated;
grant execute on function public.get_participant_records(text) to service_role;

revoke all on function public.enforce_program_item_capacity_change(),public.validate_program_registration_entitlement() from public,anon,authenticated;
revoke all on function public.save_program_registration_config(uuid,text,jsonb),public.get_public_program_registration_catalog(uuid),public.register_program_selection(uuid,uuid[],text,text,text,text,text,text,text,text,text,text,jsonb,uuid),public.get_program_order_by_token(text),public.submit_program_comprobante(text,text,text,numeric,text),public.review_program_order(uuid,boolean,text) from public;
grant execute on function public.save_program_registration_config(uuid,text,jsonb),public.review_program_order(uuid,boolean,text) to authenticated;
grant execute on function public.get_public_program_registration_catalog(uuid),public.register_program_selection(uuid,uuid[],text,text,text,text,text,text,text,text,text,text,jsonb,uuid),public.get_program_order_by_token(text),public.submit_program_comprobante(text,text,text,numeric,text) to anon,authenticated;
revoke all on function public.validate_program_checkin(text,uuid,text),public.validate_session_checkin(text,uuid,uuid,text),public.manual_program_checkin(uuid,uuid) from public,anon;
grant execute on function public.validate_program_checkin(text,uuid,text),public.validate_session_checkin(text,uuid,uuid,text),public.manual_program_checkin(uuid,uuid) to authenticated;

notify pgrst,'reload schema';
