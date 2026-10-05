-- Seleccion jerarquica: evento/taller padre y sesiones con cupo/precio propios.

alter table public.program_registration_items add column if not exists parent_item_id uuid references public.program_registration_items(id) on delete cascade;
create index if not exists idx_program_registration_items_parent on public.program_registration_items(parent_item_id,sort_order);

-- Los talleres antiguos sin tarifa quedaron marcados como pagos aunque no existia nada que cobrar.
update public.events e set config=jsonb_set(coalesce(e.config,'{}'::jsonb),'{registration_mode}','"free"'::jsonb,true)
where e.event_type='workshop' and coalesce(e.config->>'registration_mode','paid')='paid' and nullif(e.config->>'price','') is null
  and not exists(select 1 from public.event_ticket_categories c where c.event_id=e.id and c.published);

update public.program_registration_items child set parent_item_id=parent.id
from public.program_registration_entitlements en
join public.event_sessions s on s.id=en.session_id
join public.program_registration_items parent on parent.source_event_id=s.event_id and parent.item_type='event'
where en.item_id=child.id and child.item_type='session' and parent.program_id=child.program_id and child.parent_item_id is null;

create or replace function public.event_session_reserved_count(p_session_id uuid)
returns integer language sql stable security definer set search_path='' as $$
select count(*)::integer from (
  select 'r:'||sr.registration_id::text key from public.session_reservations sr left join public.registrations r on r.id=sr.registration_id
  where sr.session_id=p_session_id and sr.registration_id is not null and (sr.status in ('confirmed','checked_in') or (sr.status='pending_payment' and (r.payment_deadline is null or r.payment_deadline>now())))
  union
  select 'p:'||sr.participation_id::text from public.session_reservations sr where sr.session_id=p_session_id and sr.participation_id is not null and sr.status in ('confirmed','checked_in')
  union
  select 'p:'||o.participation_id::text from public.program_registration_orders o join public.program_registration_order_items oi on oi.order_id=o.id join public.program_registration_entitlements en on en.item_id=oi.item_id
  where en.session_id=p_session_id and (o.status in ('payment_submitted','confirmed') or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now())))
) active;
$$;

create or replace function public.enforce_event_session_capacity_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_reserved integer;
begin
  if new.capacity is null or new.capacity is not distinct from old.capacity then return new; end if;
  v_reserved:=public.event_session_reserved_count(new.id);
  if new.capacity<v_reserved then raise exception 'El cupo no puede ser menor que las % reservas activas',v_reserved; end if;
  return new;
end $$;

create or replace function public.sync_session_program_offers()
returns trigger language plpgsql security definer set search_path='' as $$
declare link record; child uuid;
begin
  for link in
    select pe.program_id,parent.id parent_id
    from public.program_events pe
    left join public.program_registration_items parent on parent.program_id=pe.program_id and parent.source_event_id=new.event_id and parent.item_type='event'
    where pe.event_id=new.event_id
  loop
    select i.id into child from public.program_registration_items i join public.program_registration_entitlements en on en.item_id=i.id
    where i.program_id=link.program_id and i.item_type='session' and en.session_id=new.id order by i.created_at limit 1;
    if new.registration_policy='closed' or new.session_type='break' then
      if child is not null then update public.program_registration_items set active=false,is_public=false where id=child; end if;
    elsif child is null then
      insert into public.program_registration_items(program_id,parent_item_id,name,description,item_type,selection_type,price,currency,capacity,is_public,active,sort_order)
      values(link.program_id,link.parent_id,new.name,new.description,'session',case when new.registration_policy='included' then 'required' else 'optional' end,case when new.registration_policy='optional_paid' then new.price else 0 end,new.currency,new.capacity,true,true,coalesce((select max(sort_order)+1 from public.program_registration_items where program_id=link.program_id),0)) returning id into child;
      insert into public.program_registration_entitlements(item_id,session_id) values(child,new.id);
    else
      update public.program_registration_items set parent_item_id=link.parent_id,name=new.name,description=new.description,selection_type=case when new.registration_policy='included' then 'required' else 'optional' end,price=case when new.registration_policy='optional_paid' then new.price else 0 end,currency=new.currency,capacity=new.capacity,is_public=true,active=true where id=child;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists sync_session_program_offers on public.event_sessions;
create trigger sync_session_program_offers after insert or update of name,description,registration_policy,price,currency,capacity on public.event_sessions for each row execute function public.sync_session_program_offers();

create or replace function public.attach_program_session_children()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.item_type='event' and new.source_event_id is not null then
    update public.program_registration_items child set parent_item_id=new.id
    where child.program_id=new.program_id and child.item_type='session' and exists(
      select 1 from public.program_registration_entitlements en join public.event_sessions s on s.id=en.session_id
      where en.item_id=child.id and s.event_id=new.source_event_id
    );
  end if;
  return new;
end $$;
drop trigger if exists attach_program_session_children on public.program_registration_items;
create trigger attach_program_session_children after insert or update of source_event_id on public.program_registration_items for each row execute function public.attach_program_session_children();

-- Sincroniza las sesiones comerciales ya existentes con sus programas.
update public.event_sessions set registration_policy=registration_policy where registration_policy<>'closed';

create or replace function public.get_public_program_registration_catalog(p_program_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select case when p.id is null then null else jsonb_build_object(
  'program',jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'venue_name',p.venue_name,'starts_at',p.starts_at,'ends_at',p.ends_at,'mode',coalesce(p.registration_config->>'registration_mode','separate'),'timezone',coalesce(p.registration_config->>'timezone','America/Caracas'),'brand_name',p.registration_config->>'brand_name','primary_color',p.registration_config->>'primary_color'),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'event_type',e.event_type,'policy',pe.registration_policy,'price',pe.registration_price,'currency',pe.registration_currency,'capacity',pe.registration_capacity) order by pe.sort_order,e.name),'[]'::jsonb) from public.program_events pe join public.events e on e.id=pe.event_id where pe.program_id=p.id and e.status='published'),
  'items',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'parent_item_id',i.parent_item_id,'source_event_id',i.source_event_id,'name',i.name,'description',i.description,'item_type',i.item_type,'selection_type',i.selection_type,'price',i.price,'currency',i.currency,'capacity',i.capacity,
    'reserved',case when i.item_type='session' then coalesce((select public.event_session_reserved_count(en.session_id) from public.program_registration_entitlements en where en.item_id=i.id and en.session_id is not null limit 1),(select count(*) from public.program_registration_order_items oi join public.program_registration_orders o on o.id=oi.order_id where oi.item_id=i.id and (o.status in ('payment_submitted','confirmed') or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now()))))) else (select count(*) from public.program_registration_order_items oi join public.program_registration_orders o on o.id=oi.order_id where oi.item_id=i.id and (o.status in ('payment_submitted','confirmed') or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now())))) end,
    'sales_start',i.sales_start,'sales_end',i.sales_end,
    'entitlements',(select coalesce(jsonb_agg(jsonb_build_object('event_id',en.event_id,'session_id',en.session_id,'session_event_id',se.event_id,'session_type',se.session_type,'starts_at',se.starts_at,'ends_at',se.ends_at,'stage_name',st.name,'allow_overlap',coalesce(se.allow_overlap,false),'zone_id',en.zone_id,'access_date',en.access_date,'label',coalesce(ev.name,se.name,zo.name,en.access_date::text))),'[]'::jsonb) from public.program_registration_entitlements en left join public.events ev on ev.id=en.event_id left join public.event_sessions se on se.id=en.session_id left join public.event_stages st on st.id=se.stage_id left join public.event_zones zo on zo.id=en.zone_id where en.item_id=i.id)
  ) order by i.sort_order,i.created_at),'[]'::jsonb) from public.program_registration_items i where i.program_id=p.id and i.active and i.is_public and (i.sales_start is null or i.sales_start<=now()) and (i.sales_end is null or i.sales_end>=now()))
) end from public.event_programs p where p.id=p_program_id and p.status='published';
$$;

create or replace function public.register_program_selection(
  p_program_id uuid,p_item_ids uuid[],p_first_name text,p_last_name text,p_email text,p_phone text,
  p_cedula text default null,p_company text default null,p_job_title text default null,p_city text default null,p_country text default null,
  p_participation_type text default 'attendee',p_profile_data jsonb default '{}'::jsonb,p_visit_id uuid default null
) returns table(participation_id uuid,credential_token text,participation_status text,order_id uuid,order_token text,order_status text,total numeric,currency text)
language plpgsql security definer set search_path='' as $$
declare pr public.event_programs; org uuid; person uuid; part public.event_participations; ord public.program_registration_orders; top_ids uuid[]; ids uuid[]; item public.program_registration_items; session_row public.event_sessions; reserved integer; total_amount numeric:=0; curr text:='USD'; snap jsonb; timeout_days integer;
begin
  select * into pr from public.event_programs where id=p_program_id and status='published' for share;
  if pr.id is null or coalesce(pr.registration_config->>'registration_mode','separate')='separate' then raise exception 'El registro conjunto no esta disponible'; end if;
  if p_participation_type not in ('attendee','guest','vip','speaker','exhibitor') then raise exception 'Perfil no disponible' using errcode='42501'; end if;
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_email),'') is null then raise exception 'Nombre y correo son obligatorios'; end if;
  org:=pr.organization_id;
  select array_agg(distinct i.id) into top_ids from public.program_registration_items i where i.program_id=p_program_id and i.parent_item_id is null and i.active and i.is_public and (i.selection_type='required' or i.id=any(coalesce(p_item_ids,'{}'::uuid[])));
  select array_agg(distinct i.id) into ids from public.program_registration_items i where i.program_id=p_program_id and i.active and i.is_public and (
    i.id=any(coalesce(top_ids,'{}'::uuid[])) or
    (i.parent_item_id=any(coalesce(top_ids,'{}'::uuid[])) and (i.selection_type='required' or i.id=any(coalesce(p_item_ids,'{}'::uuid[]))))
  );
  if coalesce(array_length(ids,1),0)=0 then raise exception 'Selecciona al menos un acceso'; end if;
  if exists(select 1 from unnest(coalesce(p_item_ids,'{}'::uuid[])) x where not exists(select 1 from public.program_registration_items i where i.id=x and i.program_id=p_program_id and i.active and i.is_public and (i.parent_item_id is null or i.parent_item_id=any(coalesce(top_ids,'{}'::uuid[]))))) then raise exception 'Uno de los accesos no esta disponible o requiere seleccionar su taller'; end if;
  perform 1 from public.program_registration_items where id=any(ids) order by id for update;
  select coalesce(sum(i.price),0),coalesce(max(i.currency) filter(where i.price>0),'USD') into total_amount,curr from public.program_registration_items i where i.id=any(ids);
  if (select count(distinct i.currency) from public.program_registration_items i where i.id=any(ids) and i.price>0)>1 then raise exception 'Todos los accesos pagos deben usar la misma moneda'; end if;
  for item in select * from public.program_registration_items where id=any(ids) loop
    if (item.sales_start is not null and item.sales_start>now()) or (item.sales_end is not null and item.sales_end<now()) then raise exception 'El acceso % no esta a la venta',item.name; end if;
    if item.item_type='session' then select coalesce((select public.event_session_reserved_count(en.session_id) from public.program_registration_entitlements en where en.item_id=item.id and en.session_id is not null limit 1),0) into reserved;
    else select count(*)::int into reserved from public.program_registration_order_items oi join public.program_registration_orders o on o.id=oi.order_id where oi.item_id=item.id and (o.status in ('payment_submitted','confirmed') or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now()))); end if;
    if item.capacity is not null and reserved>=item.capacity then raise exception 'El acceso % alcanzo su capacidad',item.name; end if;
  end loop;
  for session_row in select s.* from public.event_sessions s where exists(select 1 from public.program_registration_entitlements en where en.session_id=s.id and en.item_id=any(ids)) order by s.id for update loop
    reserved:=public.event_session_reserved_count(session_row.id); if session_row.capacity is not null and reserved>=session_row.capacity then raise exception 'La sesion % alcanzo su capacidad',session_row.name; end if;
  end loop;
  if exists(select 1 from public.program_registration_entitlements a join public.event_sessions sa on sa.id=a.session_id join public.program_registration_entitlements b on b.item_id=any(ids) and b.session_id is not null and b.session_id<>a.session_id join public.event_sessions sb on sb.id=b.session_id where a.item_id=any(ids) and not coalesce(sa.allow_overlap,false) and not coalesce(sb.allow_overlap,false) and sa.starts_at<sb.ends_at and sb.starts_at<sa.ends_at) then raise exception 'Hay sesiones seleccionadas con horarios superpuestos'; end if;
  insert into public.people(organization_id,first_name,last_name,email,phone,cedula,company,job_title,city,country,profile_data)
  values(org,trim(p_first_name),nullif(trim(p_last_name),''),lower(trim(p_email)),nullif(trim(p_phone),''),nullif(trim(p_cedula),''),nullif(trim(p_company),''),nullif(trim(p_job_title),''),nullif(trim(p_city),''),nullif(trim(p_country),''),coalesce(p_profile_data,'{}'::jsonb))
  on conflict(organization_id,email) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,cedula=excluded.cedula,company=excluded.company,job_title=excluded.job_title,city=excluded.city,country=excluded.country,profile_data=excluded.profile_data returning id into person;
  snap:=jsonb_build_object('event_name',pr.name,'starts_at',pr.starts_at,'venue',pr.venue_name,'timezone',coalesce(pr.registration_config->>'timezone','America/Caracas'),'amount',total_amount,'currency',curr,'benefits',(select jsonb_agg(name order by sort_order,created_at) from public.program_registration_items where id=any(ids)));
  select ep.* into part from public.event_participations ep where ep.program_id=p_program_id and ep.person_id=person and ep.event_id is null and ep.participation_type=p_participation_type order by ep.created_at desc limit 1 for update;
  if part.id is null then insert into public.event_participations(program_id,person_id,event_id,participation_type,status,source,purchase_snapshot) values(p_program_id,person,null,p_participation_type,case when total_amount=0 then 'approved' else 'pending' end,'public',snap) returning * into part;
  else update public.event_participations set status=case when total_amount=0 or status='approved' then 'approved' else 'pending' end,purchase_snapshot=case when purchase_snapshot='{}'::jsonb then snap else purchase_snapshot end where id=part.id returning * into part; end if;
  timeout_days:=greatest(coalesce((pr.registration_config->>'payment_timeout_days')::integer,10),1);
  insert into public.program_registration_orders(program_id,participation_id,person_id,status,total,currency,payment_deadline,snapshot) values(p_program_id,part.id,person,case when total_amount=0 then 'confirmed' else 'pending_payment' end,total_amount,curr,case when total_amount>0 then now()+make_interval(days=>timeout_days) end,snap) returning * into ord;
  insert into public.program_registration_order_items(order_id,item_id,name_snapshot,price_snapshot,currency_snapshot) select ord.id,i.id,i.name,i.price,i.currency from public.program_registration_items i where i.id=any(ids);
  if total_amount=0 then
    insert into public.session_reservations(organization_id,event_id,session_id,participation_id,status) select s.organization_id,s.event_id,s.id,part.id,'confirmed' from public.program_registration_entitlements en join public.event_sessions s on s.id=en.session_id where en.item_id=any(ids) on conflict do nothing;
    update public.session_reservations r set status='confirmed' where r.participation_id=part.id and r.session_id in (select en.session_id from public.program_registration_entitlements en where en.item_id=any(ids) and en.session_id is not null);
  end if;
  if p_visit_id is not null then update public.event_funnel_visits v set participation_id=part.id,completed_at=coalesce(v.completed_at,now()) where v.id=p_visit_id and v.program_id=p_program_id and v.participation_id is null; end if;
  return query select part.id,part.credential_token,part.status,ord.id,ord.payment_token,ord.status,ord.total,ord.currency;
end $$;

-- Un taller sin precio base puede registrarse gratis y cobrar solo las sesiones elegidas.
create or replace function public.get_public_event_registration_state(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; v_paid boolean; v_categories boolean; v_price_known boolean; v_payment_methods boolean; v_session_offer boolean; v_session_paid boolean; v_reason text;
begin
  select * into e from public.events where id=p_event_id and status='published';
  if e.id is null then return jsonb_build_object('available',false,'reason','El evento no esta disponible.'); end if;
  v_paid:=coalesce(e.config->>'registration_mode','paid')='paid'; v_categories:=coalesce((e.config->>'ticket_categories_enabled')::boolean,false);
  select exists(select 1 from public.event_ticket_categories c where c.event_id=e.id and c.published and (c.sales_start is null or c.sales_start<=now()) and (c.sales_end is null or c.sales_end>now())) into v_price_known;
  if not v_categories then v_price_known:=nullif(e.config->>'price','') is not null or exists(select 1 from public.seats s where s.event_id=e.id and s.status='available' and s.price is not null); end if;
  select exists(select 1 from public.event_sessions s where s.event_id=e.id and s.status='scheduled' and s.registration_policy in ('included','optional_free','optional_paid')),exists(select 1 from public.event_sessions s where s.event_id=e.id and s.status='scheduled' and s.registration_policy='optional_paid' and s.price>0) into v_session_offer,v_session_paid;
  if e.event_type='workshop' and v_session_offer and not v_price_known then v_paid:=v_session_paid; v_price_known:=true; end if;
  select exists(select 1 from public.payment_methods p where p.organization_id=e.organization_id and p.is_active and (p.event_id is null or p.event_id=e.id)) into v_payment_methods;
  v_reason:=case when e.end_date is not null and e.end_date<=now() then 'Este evento ya finalizo.' when e.registration_deadline is not null and e.registration_deadline<=now() then 'El plazo de registro termino.' when coalesce(e.config->>'registration_mode','paid')='invitation' then 'El acceso a este evento es por invitacion.' when v_paid and not v_price_known then 'El organizador todavia debe definir el precio.' when v_paid and not v_payment_methods then 'El organizador todavia debe activar un metodo de pago.' else null end;
  return jsonb_build_object('available',v_reason is null,'reason',v_reason,'payment_required',v_paid,'price_known',not v_paid or v_price_known,'payment_methods_ready',not v_paid or v_payment_methods);
end $$;

create or replace function public.get_public_event_session_catalog(p_event_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'session_type',s.session_type,'starts_at',s.starts_at,'ends_at',s.ends_at,'stage_name',st.name,'capacity',s.capacity,'reserved',public.event_session_reserved_count(s.id),'registration_policy',s.registration_policy,'price',s.price,'currency',s.currency,'sales_start',s.sales_start,'sales_end',s.sales_end,'track',s.track,'allow_overlap',s.allow_overlap,'eligible_category_ids',(select coalesce(jsonb_agg(x.category_id),'[]'::jsonb) from public.event_session_ticket_categories x where x.session_id=s.id)) order by s.starts_at,s.sort_order),'[]'::jsonb)
from public.event_sessions s join public.events e on e.id=s.event_id left join public.event_stages st on st.id=s.stage_id where e.id=p_event_id and e.status='published' and s.status='scheduled' and s.registration_policy<>'closed' and (s.sales_start is null or s.sales_start<=now()) and (s.sales_end is null or s.sales_end>now());
$$;

revoke all on function public.event_session_reserved_count(uuid),public.sync_session_program_offers(),public.attach_program_session_children() from public,anon,authenticated;
grant execute on function public.event_session_reserved_count(uuid) to anon,authenticated;
notify pgrst,'reload schema';
