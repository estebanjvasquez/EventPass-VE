-- Corrige la resolucion de items compuestos y el contador de intentos detectados por plpgsql_check.

create or replace function public.prepare_badge_print_job(
  p_event_id uuid,p_record_type text,p_record_id uuid,p_template_id uuid,
  p_station_label text,p_printer_name text,p_reason text default null,
  p_output_sides integer default 1,p_profile_snapshot jsonb default '{}'::jsonb
) returns table(job_id uuid,print_kind text,credential_token text)
language plpgsql security definer set search_path='' as $$
declare org_id uuid; kind text; valid boolean:=false; operator_name text; operator_email text; new_token text; created_job uuid;
begin
  select event.organization_id into org_id from public.events event where event.id=p_event_id;
  if org_id is null or not(public.has_event_staff_scope(p_event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if nullif(btrim(p_station_label),'') is null or nullif(btrim(p_printer_name),'') is null then raise exception 'Selecciona una estacion y una impresora'; end if;
  if p_output_sides not in (1,2) then raise exception 'Cantidad de caras invalida'; end if;
  if p_record_type='registration' then
    select registration.status='confirmed' and registration.badge_cancelled_at is null,registration.credential_token into valid,new_token from public.registrations registration where registration.id=p_record_id and registration.event_id=p_event_id for update;
  elsif p_record_type='participation' then
    select participation.status='approved' and participation.badge_cancelled_at is null,participation.credential_token into valid,new_token
    from public.event_participations participation where participation.id=p_record_id and (
      participation.event_id=p_event_id or exists(
        select 1 from public.program_registration_orders orders
        join public.program_registration_order_items item on item.order_id=orders.id
        join public.program_registration_entitlements entitlement on entitlement.item_id=item.item_id
        left join public.event_sessions session on session.id=entitlement.session_id
        left join public.event_zones zone on zone.id=entitlement.zone_id
        where orders.participation_id=participation.id and orders.status='confirmed' and coalesce(entitlement.event_id,session.event_id,zone.event_id)=p_event_id
      )
    ) for update;
  else raise exception 'Tipo de registro invalido'; end if;
  if not coalesce(valid,false) then raise exception 'La credencial no esta confirmada o ya fue cancelada'; end if;
  if p_template_id is not null and not exists(select 1 from public.badge_templates template where template.id=p_template_id and template.event_id=p_event_id and template.active) then raise exception 'Plantilla no disponible'; end if;
  select case when exists(select 1 from public.badge_print_logs log where log.event_id=p_event_id and log.print_kind in ('initial','reprint') and ((p_record_type='registration' and log.registration_id=p_record_id) or (p_record_type='participation' and log.participation_id=p_record_id))) then 'reprint' else 'initial' end into kind;
  if kind='reprint' and nullif(btrim(p_reason),'') is null then raise exception 'La reimpresion requiere un motivo'; end if;
  if kind='reprint' then
    new_token:=encode(extensions.gen_random_bytes(16),'hex');
    if p_record_type='registration' then update public.registrations set credential_token=new_token,updated_at=now() where id=p_record_id;
    else update public.event_participations set credential_token=new_token where id=p_record_id; end if;
  end if;
  select coalesce(nullif(btrim(user_account.raw_user_meta_data->>'display_name'),''),nullif(btrim(user_account.raw_user_meta_data->>'full_name'),''),user_account.email::text),user_account.email::text into operator_name,operator_email from auth.users user_account where user_account.id=auth.uid();
  insert into public.badge_print_jobs(organization_id,event_id,registration_id,participation_id,template_id,status,print_kind,reason,station_label,printer_name,requested_by,requested_by_name,requested_by_email,output_sides,profile_snapshot,credential_token_snapshot)
  values(org_id,p_event_id,case when p_record_type='registration' then p_record_id end,case when p_record_type='participation' then p_record_id end,p_template_id,'queued',kind,nullif(btrim(p_reason),''),left(btrim(p_station_label),120),left(btrim(p_printer_name),240),auth.uid(),operator_name,operator_email,p_output_sides,coalesce(p_profile_snapshot,'{}'::jsonb),new_token)
  returning id into created_job;
  insert into public.badge_print_job_events(job_id,status,message,actor_id,actor_name) values(created_job,'queued','Trabajo preparado',auth.uid(),operator_name);
  return query select created_job,kind,new_token;
end $$;

create or replace function public.update_badge_print_job(
  p_job_id uuid,p_status text,p_bridge_job_id text default null,p_payload_hash text default null,p_error_message text default null
) returns void language plpgsql security definer set search_path='' as $$
declare job public.badge_print_jobs; operator_name text; current_attempt integer;
begin
  select * into job from public.badge_print_jobs where id=p_job_id for update;
  if job.id is null or not(public.has_event_staff_scope(job.event_id,null,'badges.print') or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_status not in ('rendering','sent','spooled','delivered','failed','cancelled') then raise exception 'Estado de impresion invalido'; end if;
  if job.status in ('delivered','cancelled') and p_status<>job.status then raise exception 'El trabajo ya fue finalizado'; end if;
  select coalesce(nullif(btrim(user_account.raw_user_meta_data->>'display_name'),''),nullif(btrim(user_account.raw_user_meta_data->>'full_name'),''),user_account.email::text) into operator_name from auth.users user_account where user_account.id=auth.uid();
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
    if job.registration_id is not null then
      update public.registrations set attendance_status='checked_in',updated_at=now() where id=job.registration_id and attendance_status='no_attendance';
    end if;
    if not exists(select 1 from public.checkin_records record where record.event_id=job.event_id and record.result in ('allowed','validated') and ((job.registration_id is not null and record.registration_id=job.registration_id) or (job.participation_id is not null and record.participation_id=job.participation_id))) then
      insert into public.checkin_records(organization_id,participation_id,registration_id,event_id,result,scanned_by,device_label)
      values(job.organization_id,job.participation_id,job.registration_id,job.event_id,'validated',auth.uid(),left(job.station_label,120));
    end if;
    update public.badge_print_jobs set checked_in_at=coalesce(checked_in_at,now()) where id=p_job_id;
  end if;
end $$;

notify pgrst,'reload schema';
