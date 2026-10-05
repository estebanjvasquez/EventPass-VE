-- Corrige la confirmación idempotente de reservas de sesiones en el registro compuesto.
create or replace function public.register_program_selection(
  p_program_id uuid,p_item_ids uuid[],p_first_name text,p_last_name text,p_email text,p_phone text,
  p_cedula text default null,p_company text default null,p_job_title text default null,p_city text default null,p_country text default null,
  p_participation_type text default 'attendee',p_profile_data jsonb default '{}'::jsonb,p_visit_id uuid default null
) returns table(participation_id uuid,credential_token text,participation_status text,order_id uuid,order_token text,order_status text,total numeric,currency text)
language plpgsql security definer set search_path='' as $$
declare pr public.event_programs; org uuid; person uuid; part public.event_participations; ord public.program_registration_orders; ids uuid[]; item public.program_registration_items; session_row public.event_sessions; reserved integer; total_amount numeric:=0; curr text:='USD'; snap jsonb; timeout_days integer;
begin
  select * into pr from public.event_programs where id=p_program_id and status='published' for share;
  if pr.id is null or coalesce(pr.registration_config->>'registration_mode','separate')='separate' then raise exception 'El registro conjunto no estÃ¡ disponible'; end if;
  if p_participation_type not in ('attendee','guest','vip','speaker','exhibitor') then raise exception 'Perfil no disponible' using errcode='42501'; end if;
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_email),'') is null then raise exception 'Nombre y correo son obligatorios'; end if;
  org:=pr.organization_id;
  select array_agg(distinct id) into ids from public.program_registration_items where program_id=p_program_id and active and is_public and (selection_type='required' or id=any(coalesce(p_item_ids,'{}'::uuid[])));
  if coalesce(array_length(ids,1),0)=0 then raise exception 'Selecciona al menos un acceso'; end if;
  if exists(select 1 from unnest(coalesce(p_item_ids,'{}'::uuid[])) x where not exists(select 1 from public.program_registration_items i where i.id=x and i.program_id=p_program_id and i.active and i.is_public)) then raise exception 'Uno de los accesos no estÃ¡ disponible'; end if;
  perform 1 from public.program_registration_items where id=any(ids) order by id for update;
  select coalesce(sum(i.price),0),coalesce(max(i.currency) filter(where i.price>0),'USD') into total_amount,curr from public.program_registration_items i where i.id=any(ids);
  if (select count(distinct i.currency) from public.program_registration_items i where i.id=any(ids) and i.price>0)>1 then raise exception 'Todos los accesos pagos deben usar la misma moneda'; end if;
  for item in select * from public.program_registration_items where id=any(ids) loop
    if (item.sales_start is not null and item.sales_start>now()) or (item.sales_end is not null and item.sales_end<now()) then raise exception 'El acceso % no estÃ¡ a la venta',item.name; end if;
    select count(*)::int into reserved from public.program_registration_order_items oi join public.program_registration_orders o on o.id=oi.order_id where oi.item_id=item.id and (o.status in ('payment_submitted','confirmed') or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now())));
    if item.capacity is not null and reserved>=item.capacity then raise exception 'El acceso % alcanzÃ³ su capacidad',item.name; end if;
  end loop;
  for session_row in select s.* from public.event_sessions s where exists(select 1 from public.program_registration_entitlements en where en.session_id=s.id and en.item_id=any(ids)) order by s.id for update loop
    if session_row.capacity is not null then
      select
        (select count(*)::int from public.session_reservations r where r.session_id=session_row.id and r.status in ('confirmed','checked_in'))
        +
        (select count(distinct o.id)::int from public.program_registration_orders o join public.program_registration_order_items oi on oi.order_id=o.id join public.program_registration_entitlements en on en.item_id=oi.item_id where en.session_id=session_row.id and (o.status='payment_submitted' or (o.status='pending_payment' and (o.payment_deadline is null or o.payment_deadline>now()))))
      into reserved;
      if reserved>=session_row.capacity then raise exception 'La sesiÃ³n % alcanzÃ³ su capacidad',session_row.name; end if;
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
