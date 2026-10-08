-- Fase 3: preimpresion masiva, lotes auditables y separacion entre preimpresion y acreditacion onsite.

create table if not exists public.badge_print_batches(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  status text not null default 'preparing' check(status in ('preparing','queued','processing','completed','partial','failed','cancelled')),
  station_label text not null,
  printer_name text not null,
  total_jobs integer not null default 0,
  queued_jobs integer not null default 0,
  spooled_jobs integer not null default 0,
  failed_jobs integer not null default 0,
  cancelled_jobs integer not null default 0,
  allow_reprints boolean not null default false,
  filter_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_badge_print_batches_event on public.badge_print_batches(event_id,created_at desc);

alter table public.badge_print_jobs
  add column if not exists batch_id uuid references public.badge_print_batches(id) on delete set null,
  add column if not exists batch_sequence integer,
  add column if not exists fulfillment_mode text not null default 'onsite';
alter table public.badge_print_jobs drop constraint if exists badge_print_jobs_fulfillment_mode_check;
alter table public.badge_print_jobs add constraint badge_print_jobs_fulfillment_mode_check check(fulfillment_mode in ('onsite','preprint'));
create index if not exists idx_badge_print_jobs_batch on public.badge_print_jobs(batch_id,batch_sequence);

alter table public.badge_print_batches enable row level security;
drop policy if exists badge_print_batches_member_read on public.badge_print_batches;
create policy badge_print_batches_member_read on public.badge_print_batches for select to authenticated
using(public.is_org_member(organization_id) or public.is_platform_admin());
grant select on public.badge_print_batches to authenticated;

create or replace function public.list_event_badges_for_batch(
  p_event_id uuid,p_query text default '',p_participation_type text default null,p_include_printed boolean default false,p_limit integer default 250
) returns table(
  id uuid,record_type text,first_name text,last_name text,cedula text,company text,job_title text,
  participation_type text,status text,attendance_status text,credential_token text,seat_label text,
  badge_cancelled_at timestamptz,already_printed boolean,has_template boolean
) language plpgsql security definer set search_path='' as $$
declare term text;
begin
  if not exists(select 1 from public.events event where event.id=p_event_id and (public.has_event_staff_scope(event.id,null,'badges.print') or public.is_platform_admin())) then
    raise exception 'No autorizado' using errcode='42501';
  end if;
  term:='%'||replace(replace(trim(coalesce(p_query,'')),'%',''),'_','')||'%';
  return query
  with candidates as(
    select registration.id,'registration'::text record_type,registration.first_name,registration.last_name,registration.cedula,
      registration.company,registration.job_title,registration.participation_type,registration.status::text,
      registration.attendance_status::text,registration.credential_token,
      coalesce(seat.seat_number,nullif(concat_ws('',seat.row_label,seat.column_number::text),'')) seat_label,registration.badge_cancelled_at
    from public.registrations registration left join public.seats seat on seat.id=registration.seat_id
    where registration.event_id=p_event_id and registration.status='confirmed' and registration.badge_cancelled_at is null
    union all
    select participation.id,'participation'::text,person.first_name,person.last_name,person.cedula,person.company,person.job_title,
      participation.participation_type,participation.status,
      case when exists(select 1 from public.checkin_records record where record.participation_id=participation.id and record.event_id=p_event_id and record.result in ('allowed','validated')) then 'checked_in' else 'no_attendance' end,
      participation.credential_token,null::text,participation.badge_cancelled_at
    from public.event_participations participation join public.people person on person.id=participation.person_id
    where participation.status='approved' and participation.badge_cancelled_at is null and (
      participation.event_id=p_event_id or exists(
        select 1 from public.program_registration_orders orders
        join public.program_registration_order_items item on item.order_id=orders.id
        join public.program_registration_entitlements entitlement on entitlement.item_id=item.item_id
        left join public.event_sessions session on session.id=entitlement.session_id
        left join public.event_zones zone on zone.id=entitlement.zone_id
        where orders.participation_id=participation.id and orders.status='confirmed'
          and coalesce(entitlement.event_id,session.event_id,zone.event_id)=p_event_id
      )
    )
  )
  select candidate.*,
    exists(select 1 from public.badge_print_logs log where log.event_id=p_event_id and log.print_kind in ('initial','reprint') and ((candidate.record_type='registration' and log.registration_id=candidate.id) or (candidate.record_type='participation' and log.participation_id=candidate.id))) already_printed,
    exists(select 1 from public.badge_templates template where template.event_id=p_event_id and template.active and template.template_status='published' and template.participation_type=candidate.participation_type) has_template
  from candidates candidate
  where (p_participation_type is null or p_participation_type='' or candidate.participation_type=p_participation_type)
    and (candidate.first_name ilike term or coalesce(candidate.last_name,'') ilike term or coalesce(candidate.cedula,'') ilike term or coalesce(candidate.company,'') ilike term)
    and (p_include_printed or not exists(select 1 from public.badge_print_logs log where log.event_id=p_event_id and log.print_kind in ('initial','reprint') and ((candidate.record_type='registration' and log.registration_id=candidate.id) or (candidate.record_type='participation' and log.participation_id=candidate.id))))
  order by candidate.participation_type,candidate.first_name,candidate.last_name
  limit least(greatest(coalesce(p_limit,250),1),250);
end $$;

create or replace function public.create_badge_print_batch(
  p_event_id uuid,p_name text,p_records jsonb,p_station_label text,p_printer_name text,
  p_profile_snapshot jsonb default '{}'::jsonb,p_allow_reprints boolean default false,p_filter_snapshot jsonb default '{}'::jsonb
) returns table(batch_id uuid,job_id uuid,record_type text,record_id uuid,credential_token text,template_id uuid,batch_sequence integer)
language plpgsql security definer set search_path='' as $$
declare
  org_id uuid; operator_name text; operator_email text; created_batch uuid; item jsonb; sequence integer:=0;
  item_type text; item_id uuid; item_status text; item_token text; item_participation_type text; item_cancelled timestamptz;
  selected_template public.badge_templates; prior boolean; created_job uuid; new_token text;
begin
  select event.organization_id into org_id from public.events event where event.id=p_event_id;
  if org_id is null or not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)<1 or jsonb_array_length(p_records)>250 then raise exception 'Selecciona entre 1 y 250 credenciales'; end if;
  if nullif(btrim(p_station_label),'') is null or nullif(btrim(p_printer_name),'') is null then raise exception 'Selecciona una estacion y una impresora'; end if;
  select coalesce(nullif(btrim(account.raw_user_meta_data->>'display_name'),''),nullif(btrim(account.raw_user_meta_data->>'full_name'),''),account.email::text),account.email::text
    into operator_name,operator_email from auth.users account where account.id=auth.uid();
  insert into public.badge_print_batches(organization_id,event_id,name,status,station_label,printer_name,total_jobs,allow_reprints,filter_snapshot,created_by,created_by_name)
  values(org_id,p_event_id,left(coalesce(nullif(btrim(p_name),''),'Lote '||to_char(now(),'DD/MM HH24:MI')),160),'preparing',left(btrim(p_station_label),120),left(btrim(p_printer_name),240),jsonb_array_length(p_records),p_allow_reprints,coalesce(p_filter_snapshot,'{}'::jsonb),auth.uid(),operator_name)
  returning id into created_batch;
  for item in select value from jsonb_array_elements(p_records) loop
    sequence:=sequence+1; item_type:=item->>'record_type'; item_id:=(item->>'id')::uuid;
    if item_type='registration' then
      select registration.status::text,registration.credential_token,registration.participation_type,registration.badge_cancelled_at
        into item_status,item_token,item_participation_type,item_cancelled from public.registrations registration
        where registration.id=item_id and registration.event_id=p_event_id for update;
      if item_status is distinct from 'confirmed' then raise exception 'El registro % no esta confirmado',item_id; end if;
    elsif item_type='participation' then
      select participation.status,participation.credential_token,participation.participation_type,participation.badge_cancelled_at
        into item_status,item_token,item_participation_type,item_cancelled from public.event_participations participation
        where participation.id=item_id and (participation.event_id=p_event_id or exists(
          select 1 from public.program_registration_orders orders join public.program_registration_order_items order_item on order_item.order_id=orders.id
          join public.program_registration_entitlements entitlement on entitlement.item_id=order_item.item_id
          left join public.event_sessions session on session.id=entitlement.session_id left join public.event_zones zone on zone.id=entitlement.zone_id
          where orders.participation_id=participation.id and orders.status='confirmed' and coalesce(entitlement.event_id,session.event_id,zone.event_id)=p_event_id
        )) for update;
      if item_status is distinct from 'approved' then raise exception 'La participacion % no esta aprobada',item_id; end if;
    else raise exception 'Tipo de registro invalido'; end if;
    if item_cancelled is not null then raise exception 'La credencial % esta cancelada',item_id; end if;
    select template.* into selected_template from public.badge_templates template
      where template.event_id=p_event_id and template.participation_type=item_participation_type and template.active and template.template_status='published'
      order by template.version desc limit 1;
    if selected_template.id is null then raise exception 'Falta una plantilla publicada para %',item_participation_type; end if;
    select exists(select 1 from public.badge_print_logs log where log.event_id=p_event_id and log.print_kind in ('initial','reprint') and ((item_type='registration' and log.registration_id=item_id) or (item_type='participation' and log.participation_id=item_id))) into prior;
    if prior and not p_allow_reprints then raise exception 'El lote incluye credenciales ya impresas'; end if;
    new_token:=item_token;
    if prior then
      new_token:=encode(extensions.gen_random_bytes(16),'hex');
      if item_type='registration' then update public.registrations set credential_token=new_token,updated_at=now() where id=item_id;
      else update public.event_participations set credential_token=new_token where id=item_id; end if;
    end if;
    insert into public.badge_print_jobs(organization_id,event_id,registration_id,participation_id,template_id,status,print_kind,reason,station_label,printer_name,requested_by,requested_by_name,requested_by_email,output_sides,profile_snapshot,credential_token_snapshot,batch_id,batch_sequence,fulfillment_mode)
    values(org_id,p_event_id,case when item_type='registration' then item_id end,case when item_type='participation' then item_id end,selected_template.id,'queued',case when prior then 'reprint' else 'initial' end,case when prior then 'Reimpresion masiva autorizada' end,left(btrim(p_station_label),120),left(btrim(p_printer_name),240),auth.uid(),operator_name,operator_email,case when selected_template.double_sided then 2 else 1 end,coalesce(p_profile_snapshot,'{}'::jsonb),new_token,created_batch,sequence,'preprint') returning id into created_job;
    insert into public.badge_print_job_events(job_id,status,message,actor_id,actor_name) values(created_job,'queued','Preparado en lote '||created_batch::text,auth.uid(),operator_name);
    batch_id:=created_batch;job_id:=created_job;record_type:=item_type;record_id:=item_id;credential_token:=new_token;template_id:=selected_template.id;batch_sequence:=sequence;
    return next;
  end loop;
  update public.badge_print_batches set status='queued',queued_jobs=sequence,total_jobs=sequence where id=created_batch;
end $$;

create or replace function public.refresh_badge_print_batch() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; total_count integer; queued_count integer; spooled_count integer; failed_count integer; cancelled_count integer; next_status text;
begin
  target:=coalesce(new.batch_id,old.batch_id); if target is null then return null; end if;
  select count(*),count(*) filter(where status in ('queued','rendering','sent')),count(*) filter(where status in ('spooled','delivered')),count(*) filter(where status='failed'),count(*) filter(where status='cancelled')
    into total_count,queued_count,spooled_count,failed_count,cancelled_count from public.badge_print_jobs where batch_id=target;
  next_status:=case when total_count=0 then 'cancelled' when spooled_count=total_count then 'completed' when failed_count+cancelled_count=total_count then 'failed' when spooled_count+failed_count+cancelled_count=total_count then 'partial' when queued_count<total_count then 'processing' else 'queued' end;
  update public.badge_print_batches set total_jobs=total_count,queued_jobs=queued_count,spooled_jobs=spooled_count,failed_jobs=failed_count,cancelled_jobs=cancelled_count,status=next_status,completed_at=case when next_status in ('completed','partial','failed','cancelled') then coalesce(completed_at,now()) else null end where id=target;
  return null;
end $$;
drop trigger if exists trg_refresh_badge_print_batch on public.badge_print_jobs;
create trigger trg_refresh_badge_print_batch after insert or update of status or delete on public.badge_print_jobs for each row execute function public.refresh_badge_print_batch();

-- La preimpresion no acredita ni crea un check-in; solo los trabajos onsite lo hacen.
create or replace function public.update_badge_print_job(
  p_job_id uuid,p_status text,p_bridge_job_id text default null,p_payload_hash text default null,p_error_message text default null
) returns void language plpgsql security definer set search_path='' as $$
declare job public.badge_print_jobs; operator_name text; current_attempt integer;
begin
  select * into job from public.badge_print_jobs where id=p_job_id for update;
  if job.id is null or not(public.has_event_staff_scope(job.event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_status not in ('rendering','sent','spooled','delivered','failed','cancelled') then raise exception 'Estado de impresion invalido'; end if;
  if job.status in ('delivered','cancelled') and p_status<>job.status then raise exception 'El trabajo ya fue finalizado'; end if;
  select coalesce(nullif(btrim(account.raw_user_meta_data->>'display_name'),''),nullif(btrim(account.raw_user_meta_data->>'full_name'),''),account.email::text) into operator_name from auth.users account where account.id=auth.uid();
  current_attempt:=case when p_status='rendering' then job.attempt_count+1 else greatest(job.attempt_count,1) end;
  update public.badge_print_jobs set status=p_status,attempt_count=case when p_status='rendering' then current_attempt else attempt_count end,bridge_job_id=coalesce(nullif(p_bridge_job_id,''),bridge_job_id),payload_hash=coalesce(nullif(p_payload_hash,''),payload_hash),error_message=case when p_status='failed' then left(coalesce(p_error_message,'Fallo de impresion'),1000) else null end,sent_at=case when p_status in ('sent','spooled','delivered') then coalesce(sent_at,now()) else sent_at end,spooled_at=case when p_status='spooled' then now() else spooled_at end,delivered_at=case when p_status='delivered' then now() else delivered_at end,failed_at=case when p_status='failed' then now() else failed_at end,cancelled_at=case when p_status='cancelled' then now() else cancelled_at end,updated_at=now() where id=p_job_id;
  insert into public.badge_print_job_events(job_id,status,message,actor_id,actor_name) values(p_job_id,p_status,left(p_error_message,1000),auth.uid(),operator_name);
  insert into public.badge_print_job_attempts(job_id,attempt_number,bridge_job_id,printer_name,status,payload_hash,error_message,completed_at)
  values(p_job_id,current_attempt,nullif(p_bridge_job_id,''),job.printer_name,p_status,nullif(p_payload_hash,''),left(p_error_message,1000),case when p_status in ('spooled','failed','cancelled') then now() end)
  on conflict(job_id,attempt_number) do update set bridge_job_id=coalesce(excluded.bridge_job_id,public.badge_print_job_attempts.bridge_job_id),printer_name=excluded.printer_name,status=excluded.status,payload_hash=coalesce(excluded.payload_hash,public.badge_print_job_attempts.payload_hash),error_message=excluded.error_message,completed_at=coalesce(excluded.completed_at,public.badge_print_job_attempts.completed_at);
  if p_status='spooled' then
    insert into public.badge_print_logs(organization_id,event_id,registration_id,participation_id,print_kind,reason,printed_by,device_label,print_job_id)
    values(job.organization_id,job.event_id,job.registration_id,job.participation_id,job.print_kind,job.reason,auth.uid(),left(job.station_label||' / '||job.printer_name,120),job.id)
    on conflict(print_job_id) where print_job_id is not null do nothing;
    if job.fulfillment_mode='onsite' then
      if job.registration_id is not null then update public.registrations set attendance_status='checked_in',updated_at=now() where id=job.registration_id and attendance_status='no_attendance'; end if;
      if not exists(select 1 from public.checkin_records record where record.event_id=job.event_id and record.result in ('allowed','validated') and ((job.registration_id is not null and record.registration_id=job.registration_id) or (job.participation_id is not null and record.participation_id=job.participation_id))) then
        insert into public.checkin_records(organization_id,participation_id,registration_id,event_id,result,scanned_by,device_label)
        values(job.organization_id,job.participation_id,job.registration_id,job.event_id,'validated',auth.uid(),left(job.station_label,120));
      end if;
      update public.badge_print_jobs set checked_in_at=coalesce(checked_in_at,now()) where id=p_job_id;
    end if;
  end if;
end $$;

revoke all on function public.list_event_badges_for_batch(uuid,text,text,boolean,integer),public.create_badge_print_batch(uuid,text,jsonb,text,text,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.list_event_badges_for_batch(uuid,text,text,boolean,integer),public.create_badge_print_batch(uuid,text,jsonb,text,text,jsonb,boolean,jsonb) to authenticated;
notify pgrst,'reload schema';
