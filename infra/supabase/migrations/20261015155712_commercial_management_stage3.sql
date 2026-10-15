-- Commercial operations: observed usage, configurable costs, follow-up and cash ledger.
create table if not exists public.commercial_resource_rates(
 id uuid primary key default gen_random_uuid(),metric text not null check(metric in('ai_input_tokens','ai_cached_tokens','ai_output_tokens','email_accepted','storage_byte_month')),
 model text not null default '*',usd_per_unit numeric(20,12) not null check(usd_per_unit>=0 and usd_per_unit<100000),
 active boolean not null default true,created_at timestamptz not null default now(),created_by uuid references auth.users(id) on delete set null
);
create unique index if not exists commercial_rate_active on public.commercial_resource_rates(metric,model) where active;
create table if not exists public.commercial_resource_usage(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 event_id uuid references public.events(id) on delete set null,metric text not null,model text not null default '*',source_key text not null,
 units numeric(24,4) not null check(units>=0),cost_usd numeric(24,12),rate_id uuid references public.commercial_resource_rates(id),
 occurred_at timestamptz not null default now(),unique(organization_id,metric,source_key)
);
create index if not exists commercial_usage_org_time on public.commercial_resource_usage(organization_id,occurred_at);
create table if not exists public.commercial_usage_budgets(
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 monthly_usd numeric(12,2) not null check(monthly_usd>0),updated_at timestamptz not null default now()
);
create table if not exists public.commercial_followups(
 id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id) on delete cascade,
 lead_id uuid references public.platform_commercial_leads(id) on delete cascade,
 title text not null check(length(title) between 5 and 200),due_at timestamptz not null,assigned_to uuid references auth.users(id) on delete set null,
 status text not null default 'open' check(status in('open','done','cancelled')),note text not null default '',
 revision int not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((organization_id is not null)::int+(lead_id is not null)::int=1)
);
create index if not exists commercial_followups_due on public.commercial_followups(due_at) where status='open';
create table if not exists public.commercial_project_entries(
 id uuid primary key default gen_random_uuid(),contract_id uuid not null references public.commercial_contracts(id),
 organization_id uuid not null references public.organizations(id),event_id uuid not null references public.events(id),
 kind text not null check(kind in('receipt','expense','refund')),amount_usd numeric(12,2) not null check(amount_usd>0),
 reference text not null check(length(reference) between 3 and 200),description text not null check(length(description) between 5 and 2000),
 entry_date date not null,request_key uuid not null unique,voided_at timestamptz,void_reason text,
 actor_id uuid references auth.users(id) on delete set null,actor_identity jsonb not null,created_at timestamptz not null default now()
);
create index if not exists commercial_project_contract on public.commercial_project_entries(contract_id,entry_date);
create unique index if not exists commercial_project_payment_reference on public.commercial_project_entries(contract_id,kind,lower(reference)) where voided_at is null and kind in('receipt','refund');
do $$declare t text;begin for t in select unnest(array['commercial_resource_rates','commercial_resource_usage','commercial_usage_budgets','commercial_followups','commercial_project_entries']) loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('drop policy if exists commercial_admin_read on public.%I',t);
 execute format('create policy commercial_admin_read on public.%I for select to authenticated using(public.is_platform_admin())',t);
end loop;end $$;

create or replace function public.admin_resource_rate(p_metric text,p_model text,p_rate numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_metric is null or p_metric not in('ai_input_tokens','ai_cached_tokens','ai_output_tokens','email_accepted','storage_byte_month') or p_model is null or length(trim(p_model)) not between 1 and 100 or p_rate is null or p_rate<0 or p_rate>=100000 then raise exception 'Tarifa no válida';end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-rate:'||p_metric||':'||trim(p_model),0));
 update public.commercial_resource_rates set active=false where metric=p_metric and model=trim(p_model) and active;
 insert into public.commercial_resource_rates(metric,model,usd_per_unit,created_by) values(p_metric,trim(p_model),p_rate,auth.uid());
 insert into public.commercial_audit(actor_id,action,details) values(auth.uid(),'resource_rate',jsonb_build_object('metric',p_metric,'model',p_model,'usd_per_unit',p_rate));
end $$;
create or replace function public.worker_record_resource(p_org uuid,p_event uuid,p_metric text,p_model text,p_key text,p_units numeric) returns boolean language plpgsql security definer set search_path='' as $$
declare rate public.commercial_resource_rates; inserted int; pricing_metric text:=case when p_metric='storage_byte_days' then 'storage_byte_month' else p_metric end; price_units numeric:=p_units;
begin
 if not exists(select 1 from public.organizations where id=p_org) or (p_event is not null and not exists(select 1 from public.events where id=p_event and organization_id=p_org)) then raise exception 'Organización o evento no válido';end if;
 if p_units is null or p_units<0 or p_units>1e18 or p_metric is null or p_metric not in('ai_input_tokens','ai_cached_tokens','ai_output_tokens','email_accepted','storage_byte_days') or p_model is null or length(p_model)>100 or length(coalesce(p_key,'')) not between 1 and 300 then raise exception 'Uso no válido';end if;
 select * into rate from public.commercial_resource_rates r where active and metric=pricing_metric and model in(p_model,'*') order by (model=p_model) desc limit 1;
 if p_metric='storage_byte_days' then price_units:=p_units/extract(day from(date_trunc('month',now())+interval '1 month - 1 day'));end if;
 insert into public.commercial_resource_usage(organization_id,event_id,metric,model,source_key,units,cost_usd,rate_id)
 values(p_org,p_event,p_metric,p_model,p_key,p_units,case when rate.id is null then null else price_units*rate.usd_per_unit end,rate.id)
 on conflict(organization_id,metric,source_key) do nothing;
 get diagnostics inserted=row_count;return inserted=1;
end $$;
-- Email accepted by the provider is an observed unit, not proof of delivery.
create or replace function commercial_private.meter_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.organization_id is not null and coalesce(to_jsonb(new)->>'status','') in('accepted','sent','delivered') then
  perform public.worker_record_resource(new.organization_id,null,'email_accepted','*',new.id::text,1);
 end if;return new;
end $$;
drop trigger if exists commercial_meter_email on public.email_log;
create trigger commercial_meter_email after insert on public.email_log for each row execute function commercial_private.meter_email();
create or replace function commercial_private.meter_commercial_mail() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 if new.delivered_at is not null and old.delivered_at is null then
  select organization_id into org from public.commercial_notifications where id=new.notification_id;
  perform public.worker_record_resource(org,null,'email_accepted','*','commercial-mail:'||new.id::text,1);
 end if;return new;
end $$;
drop trigger if exists commercial_meter_outbox on commercial_private.mail_outbox;
create trigger commercial_meter_outbox after update on commercial_private.mail_outbox for each row execute function commercial_private.meter_commercial_mail();
create or replace function public.worker_storage_snapshot() returns integer language plpgsql security definer set search_path='' as $$
declare r record;total int:=0;
begin
 for r in select o.id,coalesce(sum(case when s.metadata->>'size' ~ '^[0-9]+$' then least((s.metadata->>'size')::numeric,1e18) else 0 end),0) bytes
 from public.organizations o left join storage.objects s on split_part(s.name,'/',1)=o.id::text group by o.id loop
  if public.worker_record_resource(r.id,null,'storage_byte_days','*','storage:'||current_date::text,r.bytes) then total:=total+1;end if;
 end loop;return total;
end $$;
create or replace function public.admin_usage_budget(p_org uuid,p_usd numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_usd is null or p_usd<=0 or p_usd>1e9 then raise exception 'Presupuesto no válido';end if;
 insert into public.commercial_usage_budgets values(p_org,p_usd,now()) on conflict(organization_id) do update set monthly_usd=excluded.monthly_usd,updated_at=now();
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),'usage_budget',jsonb_build_object('usd',p_usd));
end $$;

create or replace function public.admin_save_followup(p_id uuid,p_revision int,p_org uuid,p_lead uuid,p_title text,p_due timestamptz,p_assigned uuid,p_status text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.commercial_followups;v_id uuid;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_status is null or p_status not in('open','done','cancelled') or length(trim(coalesce(p_title,''))) not between 5 and 200 or p_due is null or length(coalesce(p_note,''))>2000 or (p_org is not null)::int+(p_lead is not null)::int<>1 then raise exception 'Seguimiento no válido';end if;
 if p_assigned is not null and (not exists(select 1 from public.platform_admins where user_id=p_assigned) or exists(select 1 from public.platform_user_controls where user_id=p_assigned and suspended_at is not null)) then raise exception 'Responsable comercial no disponible';end if;
 if p_id is not null then
  select * into item from public.commercial_followups where id=p_id for update;
  if item.id is null or p_revision is distinct from item.revision then raise exception 'El seguimiento cambió. Actualiza antes de guardar' using errcode='40001';end if;
  if item.organization_id is distinct from p_org or item.lead_id is distinct from p_lead then raise exception 'No se puede cambiar el cliente del seguimiento';end if;
  update public.commercial_followups set title=trim(p_title),due_at=p_due,assigned_to=p_assigned,status=p_status,note=coalesce(p_note,''),revision=revision+1,updated_at=now() where id=p_id returning id into v_id;
 else
  insert into public.commercial_followups(organization_id,lead_id,title,due_at,assigned_to,status,note) values(p_org,p_lead,trim(p_title),p_due,p_assigned,p_status,coalesce(p_note,'')) returning id into v_id;
 end if;
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),'followup_saved',jsonb_build_object('id',v_id,'status',p_status));return v_id;
end $$;
create or replace function public.admin_project_entry(p_contract uuid,p_kind text,p_amount numeric,p_reference text,p_description text,p_date date,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.commercial_contracts; received numeric;refunded numeric; v_id uuid;prior public.commercial_project_entries;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into c from public.commercial_contracts where id=p_contract and modality='event' for update;
 if c.id is null or p_kind is null or p_kind not in('receipt','expense','refund') or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>1e9 or p_key is null or p_date is null or p_date>current_date or length(trim(coalesce(p_reference,''))) not between 3 and 200 or length(trim(coalesce(p_description,''))) not between 5 and 2000 then raise exception 'Movimiento no válido';end if;
 select * into prior from public.commercial_project_entries where request_key=p_key;
 if prior.id is not null then
  if prior.contract_id<>p_contract or prior.kind<>p_kind or prior.amount_usd<>p_amount or prior.reference<>trim(p_reference) or prior.description<>trim(p_description) or prior.entry_date<>p_date then raise exception 'La clave de reintento pertenece a otro movimiento';end if;return prior.id;
 end if;
 if p_kind in('receipt','refund') and exists(select 1 from public.commercial_project_entries where contract_id=c.id and kind=p_kind and lower(reference)=lower(trim(p_reference)) and voided_at is null) then raise exception 'La referencia ya está registrada para este contrato. Revisa el historial antes de registrar otro cobro o devolución';end if;
 select coalesce(sum(amount_usd) filter(where kind='receipt'),0),coalesce(sum(amount_usd) filter(where kind='refund'),0) into received,refunded from public.commercial_project_entries where contract_id=c.id and voided_at is null;
 if p_kind='receipt' and received-refunded+p_amount>c.price_usd then raise exception 'El cobro supera el saldo del contrato';end if;
 if p_kind='refund' and p_amount>received-refunded then raise exception 'La devolución supera lo cobrado';end if;
 insert into public.commercial_project_entries(contract_id,organization_id,event_id,kind,amount_usd,reference,description,entry_date,request_key,actor_id,actor_identity)
 values(c.id,c.organization_id,c.event_id,p_kind,p_amount,trim(p_reference),trim(p_description),p_date,p_key,auth.uid(),jsonb_build_object('user_id',auth.uid())) returning id into v_id;
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(c.organization_id,auth.uid(),'project_entry',jsonb_build_object('id',v_id,'contract_id',c.id,'kind',p_kind,'usd',p_amount));return v_id;
end $$;
create or replace function public.admin_void_project_entry(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare item public.commercial_project_entries;c public.commercial_contracts;received numeric;refunded numeric;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Motivo de anulación requerido';end if;
 select * into item from public.commercial_project_entries where id=p_id;
 if item.id is null then raise exception 'Movimiento inexistente';end if;
 select * into c from public.commercial_contracts where id=item.contract_id for update;
 select * into item from public.commercial_project_entries where id=p_id for update;
 if item.voided_at is not null then return;end if;
 select coalesce(sum(amount_usd) filter(where kind='receipt'),0),coalesce(sum(amount_usd) filter(where kind='refund'),0) into received,refunded from public.commercial_project_entries where contract_id=c.id and voided_at is null and id<>item.id;
 if refunded>received or received-refunded>c.price_usd then raise exception 'La anulación dejaría cobros o devoluciones inconsistentes';end if;
 update public.commercial_project_entries set voided_at=now(),void_reason=trim(p_reason) where id=p_id;
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(c.organization_id,auth.uid(),'project_entry_void',jsonb_build_object('id',p_id,'reason',p_reason));
end $$;

create or replace function public.admin_commercial_management() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501';end if;
 return jsonb_build_object(
 'storage_unattributed_objects',(select count(*) from storage.objects s where not exists(select 1 from public.organizations o where o.id::text=split_part(s.name,'/',1))),
 'storage_unknown_size_objects',(select count(*) from storage.objects where coalesce(metadata->>'size','') !~ '^[0-9]+$'),
 'organizations',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.organizations),
 'rates',(select coalesce(jsonb_agg(r order by metric,model),'[]') from public.commercial_resource_rates r where active),
 'usage',(select coalesce(jsonb_agg(x order by x.name),'[]') from (
  select o.id organization_id,o.name,b.monthly_usd budget_usd,coalesce(sum(u.cost_usd),0) estimated_usd,count(u.id) filter(where u.cost_usd is null and u.units>0) unpriced_units,
  coalesce(sum(u.units) filter(where u.metric like 'ai_%'),0) ai_tokens,coalesce(sum(u.units) filter(where u.metric='email_accepted'),0) emails,
  (select units from public.commercial_resource_usage where organization_id=o.id and metric='storage_byte_days' order by occurred_at desc limit 1) storage_bytes,
  (select max(occurred_at) from public.commercial_resource_usage where organization_id=o.id) measured_at
  from public.organizations o left join public.commercial_resource_usage u on u.organization_id=o.id and u.occurred_at>=date_trunc('month',now()) left join public.commercial_usage_budgets b on b.organization_id=o.id group by o.id,o.name,b.monthly_usd) x),
 'followups',(select coalesce(jsonb_agg(x),'[]') from(select f.*,coalesce(o.name,l.organization_name) customer_name from public.commercial_followups f left join public.organizations o on o.id=f.organization_id left join public.platform_commercial_leads l on l.id=f.lead_id order by(f.status='open') desc,f.due_at limit 300) x),
 'lead_actions',(select coalesce(jsonb_agg(x),'[]') from(select id,name,organization_name,assigned_to,next_action_at,stage from public.platform_commercial_leads where stage not in('won','lost') order by next_action_at nulls last limit 100) x),
 'renewals',(select coalesce(jsonb_agg(x),'[]') from(select c.id,c.organization_id,o.name,c.modality,c.ends_at,c.price_usd from public.commercial_contracts c join public.organizations o on o.id=c.organization_id where c.status='active' and c.modality in('monthly','legacy') and (c.ends_at is null or c.ends_at<now()+interval '30 days') and not exists(select 1 from public.commercial_contracts newer where newer.organization_id=c.organization_id and newer.modality in('monthly','legacy') and newer.status='active' and newer.starts_at>=c.ends_at and newer.ends_at>c.ends_at) order by c.ends_at nulls first limit 300) x),
 'projects',(select coalesce(jsonb_agg(x),'[]') from(select c.id,c.organization_id,o.name organization_name,e.name event_name,c.price_usd contracted_usd,c.status,c.ends_at,
  coalesce(sum(p.amount_usd) filter(where p.kind='receipt' and p.voided_at is null),0) receipts_usd,
  coalesce(sum(p.amount_usd) filter(where p.kind='refund' and p.voided_at is null),0) refunds_usd,
  coalesce(sum(p.amount_usd) filter(where p.kind='expense' and p.voided_at is null),0) expenses_usd
  from public.commercial_contracts c join public.organizations o on o.id=c.organization_id join public.events e on e.id=c.event_id left join public.commercial_project_entries p on p.contract_id=c.id where c.modality='event' group by c.id,o.name,e.name order by c.created_at desc limit 300) x),
 'entries',(select coalesce(jsonb_agg(x),'[]') from(select * from public.commercial_project_entries order by created_at desc limit 300) x));
end $$;

revoke all on function public.admin_resource_rate(text,text,numeric),public.admin_usage_budget(uuid,numeric),public.admin_save_followup(uuid,int,uuid,uuid,text,timestamptz,uuid,text,text),public.admin_project_entry(uuid,text,numeric,text,text,date,uuid),public.admin_void_project_entry(uuid,text),public.admin_commercial_management() from public,anon,authenticated;
grant execute on function public.admin_resource_rate(text,text,numeric),public.admin_usage_budget(uuid,numeric),public.admin_save_followup(uuid,int,uuid,uuid,text,timestamptz,uuid,text,text),public.admin_project_entry(uuid,text,numeric,text,text,date,uuid),public.admin_void_project_entry(uuid,text),public.admin_commercial_management() to authenticated;
revoke all on function public.worker_record_resource(uuid,uuid,text,text,text,numeric),public.worker_storage_snapshot() from public,anon,authenticated;
grant execute on function public.worker_record_resource(uuid,uuid,text,text,text,numeric),public.worker_storage_snapshot() to service_role;
revoke all on all functions in schema commercial_private from public,anon,authenticated;
notify pgrst,'reload schema';
