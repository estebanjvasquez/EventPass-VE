-- Comercial v1: ofertas inmutables, contratos, prueba, cobro y derechos.
-- No cambia precios existentes ni condiciones de clientes anteriores.
create schema if not exists commercial_private;
revoke all on schema commercial_private from public, anon, authenticated;
alter table public.organizations add column if not exists trial_ends_at timestamptz;

create table if not exists public.offer_versions (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 plan public.org_plan not null, name text not null, modality text not null check(modality in ('monthly','event','trial','legacy')),
 price_usd numeric(10,2) not null check(price_usd>=0), capabilities jsonb not null,
 limits jsonb not null, terms_version text not null default '2026-10-14', active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.commercial_contracts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 event_id uuid references public.events(id), offer_id uuid references public.offer_versions(id),
 modality text not null check(modality in ('monthly','event','trial','legacy')),
 plan public.org_plan not null, starts_at timestamptz not null, ends_at timestamptz,
 capabilities jsonb not null, limits jsonb not null, price_usd numeric(10,2) not null default 0,
 status text not null default 'active' check(status in ('active','cancelled')), terms_version text not null,
 reason text, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at)
);
create index if not exists commercial_contract_org_dates on public.commercial_contracts(organization_id,starts_at,ends_at);
create table if not exists public.subscription_quotes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 offer_id uuid not null references public.offer_versions(id), plan public.org_plan not null,
 period_months int not null check(period_months in (1,3,12)), amount_usd numeric(10,2) not null,
 starts_at timestamptz not null, ends_at timestamptz not null, action text not null,
 baseline_contract_id uuid references public.commercial_contracts(id),
 snapshot jsonb not null, expires_at timestamptz not null default now()+interval '30 minutes',
 requested_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.subscription_payments add column if not exists quote_id uuid references public.subscription_quotes(id);
alter table public.subscription_payments add column if not exists method_id uuid references public.platform_payment_methods(id);
alter table public.subscription_payments add column if not exists contract_id uuid references public.commercial_contracts(id);
alter table public.subscription_payments add column if not exists received_usd numeric(10,2);
create unique index if not exists subscription_payment_quote_uq on public.subscription_payments(quote_id) where quote_id is not null;
create table if not exists public.commercial_notifications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 payment_id uuid references public.subscription_payments(id), message text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.commercial_audit (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id),
 actor_id uuid references auth.users(id), action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
-- Existing customers retain their scope. These are not treated as paid MRR.
insert into public.commercial_contracts(organization_id,modality,plan,starts_at,ends_at,capabilities,limits,price_usd,terms_version,reason)
select o.id,'legacy',o.plan,now(),(select max(s.current_period_end) from public.subscriptions s where s.organization_id=o.id),
 '{"core":true,"programs":true,"exposure":true,"leads":true,"sponsorship":true,"campaigns":true,"print_batches":true}',
 jsonb_build_object('events',p.max_events,'participants_event',p.max_regs_per_event),p.price_usd,'legacy','Condiciones anteriores preservadas; revisar contrato con cliente'
from public.organizations o join public.plans p on p.plan=o.plan
where not exists(select 1 from public.commercial_contracts c where c.organization_id=o.id)
and coalesce((select max(s.current_period_end) from public.subscriptions s where s.organization_id=o.id),now()+interval '1 day')>now();

insert into public.offer_versions(code,plan,name,modality,price_usd,capabilities,limits)
select 'monthly-v1-'||p.plan,p.plan,case when p.plan='asociacion' then 'Organización' else p.name end,'monthly',p.price_usd,
 jsonb_build_object('core',true,'programs',p.plan<>'arranque','exposure',p.plan='asociacion','leads',p.plan='asociacion','sponsorship',p.plan='asociacion','campaigns',p.plan<>'arranque','print_batches',p.plan<>'arranque'),
 case p.plan when 'arranque' then '{"events":1,"participants_event":200,"participants_month":200,"users":3,"stations":1,"access_points":2,"companies":0}'::jsonb
 when 'profesional' then '{"events":3,"participants_event":1000,"participants_month":2000,"users":8,"stations":3,"access_points":5,"companies":0}'::jsonb
 else '{"events":6,"participants_event":2500,"participants_month":5000,"users":15,"stations":6,"access_points":10,"companies":75}'::jsonb end
from public.plans p where p.is_active on conflict(code) do nothing;
insert into public.offer_versions(code,plan,name,modality,price_usd,capabilities,limits)
values('trial-v1','arranque','Prueba 14 días','trial',0,'{"core":true,"programs":true,"exposure":true,"leads":false,"sponsorship":true,"campaigns":true,"print_batches":true}',
 '{"events":1,"participants_event":50,"participants_month":50,"users":2,"stations":1,"access_points":1,"companies":5}') on conflict(code) do nothing;

create or replace function commercial_private.can_manage(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.has_org_role(p_org,array['owner','admin']::public.member_role[]) or public.is_platform_admin());
$$;
create or replace function commercial_private.entitlement(p_org uuid,p_event uuid default null)
returns public.commercial_contracts language sql stable security definer set search_path='' as $$
 select c from public.commercial_contracts c where c.organization_id=p_org and c.status='active'
 and c.starts_at<=now() and (c.ends_at is null or c.ends_at>now())
 and (c.event_id is null or c.event_id=p_event)
 order by (c.event_id is not null) desc,(c.modality<>'legacy') desc,c.starts_at desc,c.created_at desc limit 1;
$$;
create or replace function public.commercial_account(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.commercial_contracts; o public.organizations; v_end timestamptz; v_events int;
begin
 if not (public.is_org_member(p_org) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into o from public.organizations where id=p_org;
 c:=commercial_private.entitlement(p_org);
 select max(ends_at) into v_end from public.commercial_contracts where organization_id=p_org and status='active';
 select count(*) into v_events from public.events where organization_id=p_org and status<>'archived';
 return jsonb_build_object('state',case when o.status='suspended' then 'suspended' when c.id is null and exists(select 1 from public.commercial_contracts where organization_id=p_org and modality='event' and status='active' and starts_at<=now() and ends_at>now()) then 'event_only' when c.id is null then 'read_only' when c.modality='trial' then 'trial' when c.modality='legacy' then 'legacy' else 'active' end,
 'plan',coalesce(c.plan,o.plan),'ends_at',coalesce(c.ends_at,v_end),'trial_ends_at',o.trial_ends_at,'capabilities',coalesce(c.capabilities,(select capabilities from public.commercial_contracts where organization_id=p_org and modality='event' and status='active' and starts_at<=now() and ends_at>now() order by ends_at desc limit 1),'{}'),
 'limits',coalesce(c.limits,(select limits from public.commercial_contracts where organization_id=p_org and modality='event' and status='active' and starts_at<=now() and ends_at>now() order by ends_at desc limit 1),'{}'),'events_used',v_events,'contract_id',c.id,
 'usage',jsonb_build_object('events',v_events,'users',(select count(*) from public.memberships where organization_id=p_org),'stations',(select count(distinct station_key) from public.badge_print_stations where organization_id=p_org and last_seen_at>now()-interval '8 hours'),'access_points',(select count(*) from public.access_points where organization_id=p_org),'companies',(select count(*) from public.companies where organization_id=p_org and kind='exhibitor'),'participants_month',(select count(distinct identity_hash) from commercial_private.participant_usage where organization_id=p_org and period_month=date_trunc('month',now() at time zone 'UTC')::date)),
 'event_contracts',(select coalesce(jsonb_agg(jsonb_build_object('event_id',event_id,'ends_at',ends_at,'reason',reason)),'[]') from public.commercial_contracts where organization_id=p_org and event_id is not null and status='active' and starts_at<=now() and ends_at>now()));
end $$;
-- Defense in depth: domain writes, including privileged registration RPCs,
-- are controlled by contractual scope; reads/export remain available.
create or replace function commercial_private.check_write() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; prev jsonb; v_org uuid; v_event uuid; c public.commercial_contracts; v_cap text:=TG_ARGV[0]; v_max int; v_count int; v_key text; v_parent_org uuid;
begin
 r:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 prev:=case when TG_OP='UPDATE' then to_jsonb(old) else null end;
 v_event:=nullif(r->>'event_id','')::uuid;
 v_org:=nullif(r->>'organization_id','')::uuid;
 if TG_TABLE_NAME='events' then v_event:=(r->>'id')::uuid; end if;
 if v_org is null and v_event is not null then select organization_id into v_org from public.events where id=v_event; end if;
 if v_org is null and r->>'map_id' is not null then select organization_id,event_id into v_org,v_event from public.venue_maps where id=(r->>'map_id')::uuid; end if;
 if v_org is null and r->>'event_sponsorship_id' is not null then select organization_id,event_id into v_org,v_event from public.event_sponsorships where id=(r->>'event_sponsorship_id')::uuid; end if;
 if v_org is null and r->>'provider_id' is not null then select organization_id into v_org from public.providers where id=(r->>'provider_id')::uuid; end if;
 if v_org is null and TG_TABLE_NAME='booth_assignments' then select organization_id,event_id into v_org,v_event from public.companies where id=(r->>'company_id')::uuid; end if;
 if v_org is null and r->>'program_id' is not null then select organization_id into v_org from public.event_programs where id=(r->>'program_id')::uuid; end if;
 if r->>'event_id' is not null then select organization_id into v_parent_org from public.events where id=(r->>'event_id')::uuid; if v_parent_org is distinct from v_org then raise exception 'El evento no pertenece a esta organización'; end if; end if;
 if r->>'program_id' is not null then select organization_id into v_parent_org from public.event_programs where id=(r->>'program_id')::uuid; if v_parent_org is distinct from v_org then raise exception 'El programa no pertenece a esta organización'; end if; end if;
 if r->>'person_id' is not null then select organization_id into v_parent_org from public.people where id=(r->>'person_id')::uuid; if v_parent_org is distinct from v_org then raise exception 'El participante no pertenece a esta organización'; end if; end if;
 if v_org is null then raise exception 'No se pudo determinar la organización'; end if;
 if TG_OP='UPDATE' and (r->>'organization_id' is distinct from prev->>'organization_id' or r->>'event_id' is distinct from prev->>'event_id' or r->>'program_id' is distinct from prev->>'program_id') then raise exception 'No se permite trasladar registros entre organizaciones o eventos'; end if;
 -- Serialize only quota-changing writes. Printing/status updates must not
 -- acquire a global mutex after locking their job/participant rows.
 if (TG_OP='INSERT' and TG_TABLE_NAME in('events','memberships','badge_print_stations','access_points','companies'))
 or (TG_OP='UPDATE' and TG_TABLE_NAME='events' and prev->>'status'='archived' and r->>'status'<>'archived') then
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,8));
 end if;
 if exists(select 1 from public.organizations where id=v_org and status='suspended') then raise exception 'Organización suspendida'; end if;
 c:=commercial_private.entitlement(v_org,v_event);
 if c.id is null and v_event is null then select * into c from public.commercial_contracts where organization_id=v_org and modality='event' and status='active' and starts_at<=now() and ends_at>now() order by ends_at desc limit 1; end if;
 if c.id is null then raise exception 'Contrato vencido: consulta y exportación disponibles. Renueva para operar.' using errcode='42501'; end if;
 if v_cap='exposure' and TG_TABLE_NAME in('venue_maps','venue_map_elements','venue_map_versions') and exists(select 1 from public.events e where e.id=v_event and coalesce(to_jsonb(e)->>'event_type','exhibition')<>'exhibition') then v_cap:='core'; end if;
 if TG_TABLE_NAME='venue_map_elements' and r->>'element_type'='stand' then v_cap:='exposure'; end if;
 if TG_TABLE_NAME='companies' and r->>'kind'='sponsor' then v_cap:='sponsorship'; end if;
 if not coalesce((c.capabilities->>v_cap)::boolean,false) then raise exception 'Este contrato no incluye el módulo %',v_cap using errcode='42501'; end if;
 if TG_OP='DELETE' then return old; end if;
 if TG_TABLE_NAME='events' and r->>'status'<>'archived' and (TG_OP='INSERT' or prev->>'status'='archived') then
  v_max:=(c.limits->>'events')::int;
  select count(*) into v_count from public.events where organization_id=v_org and status<>'archived' and id<>(r->>'id')::uuid;
 elsif TG_TABLE_NAME='memberships' and TG_OP='INSERT' then
  v_max:=(c.limits->>'users')::int; select count(*) into v_count from public.memberships where organization_id=v_org and user_id<>(r->>'user_id')::uuid;
 elsif TG_TABLE_NAME='badge_print_stations' and TG_OP='INSERT' then
  v_max:=(c.limits->>'stations')::int; select count(*) into v_count from public.badge_print_stations where organization_id=v_org and last_seen_at>now()-interval '8 hours' and station_key<>(r->>'station_key')::uuid;
 elsif TG_TABLE_NAME='access_points' and TG_OP='INSERT' then
  v_max:=(c.limits->>'access_points')::int; select count(*) into v_count from public.access_points where organization_id=v_org and id<>(r->>'id')::uuid;
 elsif TG_TABLE_NAME='companies' and TG_OP='INSERT' and r->>'kind'='exhibitor' then
  v_max:=(c.limits->>'companies')::int; select count(*) into v_count from public.companies where organization_id=v_org and kind='exhibitor';
 end if;
 if v_max is not null and v_count>=v_max then raise exception 'Alcanzaste la cuota contratada (%). Solicita ampliación antes de operar.',v_max using errcode='23514'; end if;
 return new;
end $$;

create or replace function public.enforce_event_limit() returns trigger language plpgsql set search_path='' as $$begin return new; end $$;
create table if not exists commercial_private.participant_usage(
 organization_id uuid not null references public.organizations(id),event_id uuid,scope_key text not null,identity_hash text not null,period_month date not null,
 primary key(organization_id,scope_key,identity_hash,period_month)
);
alter table commercial_private.participant_usage enable row level security;
insert into commercial_private.participant_usage(organization_id,event_id,scope_key,identity_hash,period_month)
select organization_id,event_id,'event:'||event_id,encode(sha256(convert_to(coalesce(nullif(lower(trim(email)),''),'registration:'||id::text),'UTF8')),'hex'),date_trunc('month',created_at at time zone 'UTC')::date from public.registrations on conflict do nothing;
insert into commercial_private.participant_usage(organization_id,event_id,scope_key,identity_hash,period_month)
select p.organization_id,ep.event_id,coalesce('event:'||ep.event_id,'program:'||ep.program_id),encode(sha256(convert_to(coalesce(nullif(lower(trim(p.email)),''),'person:'||p.id::text),'UTF8')),'hex'),date_trunc('month',ep.created_at at time zone 'UTC')::date from public.event_participations ep join public.people p on p.id=ep.person_id on conflict do nothing;
create or replace function public.enforce_registration_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new); v_org uuid; v_event uuid:=nullif(r->>'event_id','')::uuid; c public.commercial_contracts; v_max int; v_count int; v_identity text;
begin
 if TG_OP='UPDATE' then return new; end if;
 if TG_TABLE_NAME='registrations' then v_org:=(r->>'organization_id')::uuid; v_identity:=coalesce(nullif(lower(trim(r->>'email')),''),'registration:'||(r->>'id'));
 else select organization_id,coalesce(nullif(lower(trim(email)),''),'person:'||id::text) into v_org,v_identity from public.people where id=(r->>'person_id')::uuid; end if;
 if v_event is null then
  select organization_id into v_org from public.event_programs where id=(r->>'program_id')::uuid;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,8));
 c:=commercial_private.entitlement(v_org,v_event);
 if c.id is null then raise exception 'Contrato vencido; renueva para registrar participantes'; end if;
 insert into commercial_private.participant_usage(organization_id,event_id,scope_key,identity_hash,period_month)
 values(v_org,v_event,coalesce('event:'||v_event,'program:'||(r->>'program_id')),encode(sha256(convert_to(v_identity,'UTF8')),'hex'),date_trunc('month',now() at time zone 'UTC')::date) on conflict do nothing;
 v_max:=(c.limits->>'participants_event')::int;
 if v_event is not null and v_max is not null then
 select count(distinct identity_hash) into v_count from commercial_private.participant_usage where organization_id=v_org and event_id=v_event;
 if v_count>v_max then raise exception 'Cuota de participantes del evento agotada (%)',v_max using errcode='23514'; end if;
 end if;
 v_max:=(c.limits->>'participants_month')::int;
 if v_max is not null then
 select count(distinct identity_hash) into v_count from commercial_private.participant_usage where organization_id=v_org and period_month=date_trunc('month',now() at time zone 'UTC')::date;
 if v_count>v_max then raise exception 'Cuota mensual de participantes agotada (%)',v_max using errcode='23514'; end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_participation_commercial_limit on public.event_participations;
create trigger trg_participation_commercial_limit before insert on public.event_participations for each row execute function public.enforce_registration_limit();
drop trigger if exists trg_event_limit on public.events;
-- Tables without an organization_id require their own domain authorization;
-- selected event/program tables resolve their parent tenant here.
do $$declare t record; cap text; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and table_name in(select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE') and
 (column_name in('organization_id','event_id','program_id','map_id','event_sponsorship_id','provider_id') or table_name='booth_assignments')
 and table_name not in('subscriptions','subscription_payments','commercial_contracts','subscription_quotes','commercial_notifications','commercial_audit','memberships','email_log','participant_profile_consents','event_staff_scopes','admin_actions','platform_user_audit','support_tickets','commercial_acceptances') loop
  cap:=case when t.table_name in('event_programs','program_events','passes','event_zones','pass_entitlements','program_registration_entitlements','program_registration_items','program_registration_orders','program_agendas') then 'programs'
   when t.table_name in('companies','venue_maps','venue_map_elements','booth_assignments','exhibitor_stand_visits','exhibitor_portal_members','exhibitor_portal_tasks','exhibitor_portal_documents','exhibitor_portal_payments','exhibitor_portal_activities','exhibitor_portal_audit','exhibitor_staff','venue_map_versions','venue_map_imports','floor_plan_packages','floor_plan_extras','floor_plan_reservations','floor_plan_routes','floor_plan_analytics') then 'exposure'
   when t.table_name like '%sponsor%' or t.table_name like '%provider%' then 'sponsorship'
   when t.table_name like '%campaign%' or t.table_name like '%lead_%' then 'campaigns'
   when t.table_name='badge_print_batches' then 'print_batches' else 'core' end;
  execute format('drop trigger if exists commercial_write_guard on public.%I',t.table_name);
  execute format('create trigger commercial_write_guard before insert or update or delete on public.%I for each row execute function commercial_private.check_write(%L)',t.table_name,cap);
 end loop;
end $$;

-- Restore privacy in scan, list and exports: no permission means no profile.
create or replace function public.scan_exhibitor_stand_badge(p_event_id uuid,p_company_id uuid,p_element_id uuid,p_credential_token text,p_device_label text default null)
returns table(result text,reason text,profile_shared boolean,visitor_name text,visitor_company text,visitor_job_title text,visitor_email text,visit_count bigint,visited_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_org uuid; c public.commercial_contracts; can_share boolean;
begin
 select organization_id into v_org from public.events where id=p_event_id;
 c:=commercial_private.entitlement(v_org,p_event_id); can_share:=coalesce((c.capabilities->>'leads')::boolean,false);
 return query select s.result,s.reason,(s.profile_shared and can_share),case when can_share then s.visitor_name end,case when can_share then s.visitor_company end,case when can_share then s.visitor_job_title end,case when can_share then s.visitor_email end,s.visit_count,s.visited_at
 from public.scan_exhibitor_stand_badge_with_live_consent(p_event_id,p_company_id,p_element_id,p_credential_token,p_device_label) s;
end $$;
-- Evidence of changes remains separate from the current permission record.
create table if not exists commercial_private.consent_history(id uuid primary key default gen_random_uuid(),subject jsonb not null,notice_version text not null default '2026-10-14',created_at timestamptz not null default now());
alter table commercial_private.consent_history enable row level security;
create or replace function commercial_private.log_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into commercial_private.consent_history(subject) values(case when TG_OP='DELETE' then to_jsonb(old)||'{"revoked":true}' else to_jsonb(new) end); return coalesce(new,old); end $$;
drop trigger if exists consent_history on public.participant_profile_consents;
create trigger consent_history after insert or update or delete on public.participant_profile_consents for each row execute function commercial_private.log_consent();

create or replace function commercial_private.protect_org() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is not null and not public.is_platform_admin() and
 (new.plan<>old.plan or new.status<>old.status or new.trial_ends_at is distinct from old.trial_ends_at) then
 raise exception 'El contrato se modifica desde facturación' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists commercial_org_guard on public.organizations;
create trigger commercial_org_guard before update on public.organizations for each row execute function commercial_private.protect_org();

create or replace function public.create_organization(p_name text,p_slug text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_offer public.offer_versions;
begin
 if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception 'Ya perteneces a una organización'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 150 or p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' or public.is_reserved_slug(p_slug) then raise exception 'Nombre o subdominio inválido'; end if;
 select * into strict v_offer from public.offer_versions where code='trial-v1';
 insert into public.organizations(name,slug,status,trial_ends_at) values(trim(p_name),p_slug,'trial',now()+interval '14 days') returning id into v_id;


 insert into public.memberships(organization_id,user_id,role) values(v_id,auth.uid(),'owner');
 return v_id;
end $$;

create or replace function public.quote_subscription(p_org uuid,p_plan public.org_plan,p_months int default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.offer_versions; c public.commercial_contracts; q public.subscription_quotes; v_start timestamptz:=now(); v_end timestamptz; v_amount numeric; v_action text:='contract'; old_price numeric;
begin
 if not commercial_private.can_manage(p_org) then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_months not in(1,3,12) or p_months is null then raise exception 'Período no permitido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,3));
 if exists(select 1 from public.subscription_payments where organization_id=p_org and status='pending') then raise exception 'Ya hay un pago en revisión'; end if;
 select * into f from public.offer_versions where plan=p_plan and modality='monthly' and active order by created_at desc limit 1;
 if f.id is null or not exists(select 1 from public.plans where plan=p_plan and is_active) then raise exception 'Plan no disponible'; end if;
 c:=commercial_private.entitlement(p_org);
 if exists(select 1 from public.commercial_contracts where organization_id=p_org and status='active' and starts_at>now() and modality='monthly') then raise exception 'Ya existe una renovación programada'; end if;
 v_amount:=f.price_usd*p_months;
 if c.modality in('monthly','legacy') and c.ends_at>now() then
  old_price:=c.price_usd;
  if c.plan=p_plan then v_start:=c.ends_at; v_action:='renew';
  elsif f.price_usd<=old_price then v_start:=c.ends_at; v_action:='downgrade';
  else
   -- Difference for the remaining paid period + new full months. No free upgrade of prepaid time.
   v_amount:=v_amount+round((f.price_usd-old_price)*extract(epoch from(c.ends_at-now()))/2592000,2); v_action:='upgrade';
  end if;
 end if;
 v_end:=case when v_action='upgrade' then c.ends_at else v_start end+make_interval(months=>p_months);
 insert into public.subscription_quotes(organization_id,offer_id,plan,period_months,amount_usd,starts_at,ends_at,action,baseline_contract_id,snapshot,requested_by)
 values(p_org,f.id,p_plan,p_months,v_amount,v_start,v_end,v_action,c.id,to_jsonb(f)||jsonb_build_object('currency','USD','tax_policy','Sin impuesto adicional configurado; recibo no fiscal','proration_basis','30 días'),auth.uid()) returning * into q;
 return to_jsonb(q);
end $$;
-- Disable ambiguous legacy API; older clients must refresh before payment.
create or replace function public.request_subscription(p_plan public.org_plan,p_amount numeric,p_method text,p_reference text,p_receipt_path text,p_months int default 1)
returns uuid language plpgsql security definer set search_path='' as $$begin raise exception 'Actualiza la página para cotizar el pago y seleccionar la organización'; end $$;
create or replace function public.submit_subscription_quote(p_quote uuid,p_method_id uuid,p_reference text,p_receipt_path text) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.subscription_quotes; m public.platform_payment_methods; v_id uuid;
begin
 select * into q from public.subscription_quotes where id=p_quote for update;
 if q.id is null or not commercial_private.can_manage(q.organization_id) or q.requested_by<>auth.uid() then raise exception 'No autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(q.organization_id::text,3));
 if not exists(select 1 from public.commercial_acceptances where user_id=auth.uid() and organization_id=q.organization_id and terms_version='2026-10-14' and privacy_version='2026-10-14') then raise exception 'Acepta las condiciones vigentes antes de enviar el pago'; end if;
 if q.expires_at<now() then raise exception 'La cotización expiró; cotiza de nuevo'; end if;
 if exists(select 1 from public.subscription_payments where organization_id=q.organization_id and status='pending') then raise exception 'Ya hay un pago en revisión'; end if;
 select * into m from public.platform_payment_methods where id=p_method_id and is_active;
 if m.id is null then raise exception 'Selecciona un medio de pago activo'; end if;
 if length(coalesce(trim(p_reference),'')) not between 3 and 200 then raise exception 'Indica la referencia de pago'; end if;
 if p_receipt_path is null or split_part(p_receipt_path,'/',1)<>q.organization_id::text or not exists(select 1 from storage.objects where bucket_id='subs' and name=p_receipt_path) then raise exception 'Comprobante inválido para esta organización'; end if;
 insert into public.subscription_payments(organization_id,plan,amount_usd,method,method_id,reference,receipt_path,period_months,requested_by,quote_id)
 values(q.organization_id,q.plan,q.amount_usd,m.name,m.id,trim(p_reference),p_receipt_path,q.period_months,auth.uid(),q.id) returning id into v_id;
 insert into public.commercial_notifications(organization_id,payment_id,message) values(q.organization_id,v_id,'Comprobante recibido. Consulta aquí la revisión y resolución; plazo objetivo: un día laboral.');
 return v_id;
end $$;

create or replace function public.approve_subscription_payment(p_payment_id uuid) returns timestamptz language plpgsql security definer set search_path='' as $$
begin raise exception 'Concilia el monto recibido antes de aprobar'; end $$;
create or replace function public.reconcile_subscription_payment(p_payment_id uuid,p_received numeric) returns timestamptz language plpgsql security definer set search_path='' as $$
declare p public.subscription_payments; q public.subscription_quotes; c public.commercial_contracts; v_contract uuid; v_end timestamptz;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into p from public.subscription_payments where id=p_payment_id for update;
 if p.id is null or p.status<>'pending' then raise exception 'Sólo se puede aprobar un pago pendiente'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p.organization_id::text,3));
 if p_received is null or p_received<>p.amount_usd then raise exception 'El monto recibido debe coincidir con el cotizado'; end if;
 select * into q from public.subscription_quotes where id=p.quote_id;
 if q.id is not null and (q.organization_id<>p.organization_id or q.plan<>p.plan or q.amount_usd<>p.amount_usd or q.period_months<>p.period_months) then raise exception 'El pago no coincide con su cotización inmutable'; end if;
 if q.id is null then raise exception 'Pago anterior sin cotización: rechaza y solicita un nuevo comprobante con cotización'; end if;
 c:=commercial_private.entitlement(p.organization_id);
 if c.id is distinct from q.baseline_contract_id and c.id is not null then raise exception 'El contrato cambió; rechaza y cotiza de nuevo'; end if;
 if q.action in('renew','downgrade') and q.starts_at<now() then q.starts_at:=now(); q.ends_at:=now()+make_interval(months=>q.period_months); end if;
 if q.action='upgrade' and q.ends_at<=now() then raise exception 'Cotización fuera de vigencia'; end if;
 if q.action='contract' then q.ends_at:=now()+make_interval(months=>q.period_months); end if;
 if q.action in('upgrade','contract') then
  update public.commercial_contracts set status='cancelled',ends_at=case when starts_at<now() then now() else ends_at end where id=c.id;
  q.starts_at:=now();
 end if;
 insert into public.commercial_contracts(organization_id,offer_id,modality,plan,starts_at,ends_at,capabilities,limits,price_usd,terms_version,created_by,reason)
 values(p.organization_id,q.offer_id,'monthly',q.plan,q.starts_at,q.ends_at,q.snapshot->'capabilities',q.snapshot->'limits',(q.snapshot->>'price_usd')::numeric,q.snapshot->>'terms_version',auth.uid(),'Pago conciliado '||p.id) returning id into v_contract;
 update public.subscription_payments set status='approved',received_usd=p_received,contract_id=v_contract,reviewed_by=auth.uid(),reviewed_at=now() where id=p.id;
 insert into public.subscriptions(organization_id,plan,status,current_period_end) values(p.organization_id,q.plan,'active',q.ends_at);
 -- Plan is resolved from temporal contracts; scheduled downgrades must not change today's plan.
 if q.starts_at<=now() then update public.organizations set plan=q.plan,status='active' where id=p.organization_id and status<>'suspended'; end if;
 insert into public.commercial_notifications(organization_id,payment_id,message) values(p.organization_id,p.id,'Pago aprobado. Contrato vigente desde '||q.starts_at::date||' hasta '||q.ends_at::date||'.');
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(p.organization_id,auth.uid(),'payment_approved',jsonb_build_object('payment_id',p.id,'received_usd',p_received,'contract_id',v_contract));
 return q.ends_at;
end $$;
create or replace function public.reject_subscription_payment(p_payment_id uuid,p_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare p public.subscription_payments;
begin
 if not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 if length(coalesce(trim(p_note),''))<3 then raise exception 'Indica el motivo del rechazo'; end if;
 update public.subscription_payments set status='rejected',note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now() where id=p_payment_id and status='pending' returning * into p;
 if p.id is null then raise exception 'Sólo se puede rechazar un pago pendiente'; end if;
 insert into public.commercial_notifications(organization_id,payment_id,message) values(p.organization_id,p.id,'Pago rechazado: '||trim(p_note)||'. Puedes corregirlo y enviar una nueva solicitud.');
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(p.organization_id,auth.uid(),'payment_rejected',jsonb_build_object('payment_id',p.id,'note',trim(p_note)));
end $$;

-- Explicit read policies; writes only through validated functions.
do $$declare t text; begin
 foreach t in array array['offer_versions','commercial_contracts','subscription_quotes','commercial_notifications','commercial_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
drop policy if exists offer_read on public.offer_versions;
drop policy if exists offer_read on public.offer_versions;
create policy offer_read on public.offer_versions for select to authenticated using(active or public.is_platform_admin());
drop policy if exists contract_read on public.commercial_contracts;
drop policy if exists contract_read on public.commercial_contracts;
create policy contract_read on public.commercial_contracts for select to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists quote_read on public.subscription_quotes;
drop policy if exists quote_read on public.subscription_quotes;
create policy quote_read on public.subscription_quotes for select to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists commercial_notification_read on public.commercial_notifications;
drop policy if exists commercial_notification_read on public.commercial_notifications;
create policy commercial_notification_read on public.commercial_notifications for select to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists commercial_audit_read on public.commercial_audit;
drop policy if exists commercial_audit_read on public.commercial_audit;
create policy commercial_audit_read on public.commercial_audit for select to authenticated using(public.is_platform_admin());
revoke all on all functions in schema commercial_private from public,anon,authenticated;
revoke all on function public.commercial_account(uuid),public.quote_subscription(uuid,public.org_plan,int),public.submit_subscription_quote(uuid,uuid,text,text),public.reconcile_subscription_payment(uuid,numeric) from public,anon,authenticated;
grant execute on function public.commercial_account(uuid),public.quote_subscription(uuid,public.org_plan,int),public.submit_subscription_quote(uuid,uuid,text,text),public.reconcile_subscription_payment(uuid,numeric) to authenticated;
notify pgrst,'reload schema';

create or replace function public.get_exhibitor_stand_visitors(
  p_event_id uuid,
  p_company_id uuid,
  p_element_id uuid default null
)
returns table(
  visitor_key text,
  profile_shared boolean,
  visitor_name text,
  visitor_company text,
  visitor_job_title text,
  visitor_email text,
  first_visit timestamptz,
  last_visit timestamptz,
  visit_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para consultar visitantes' using errcode = '42501';
  end if;
  select c.organization_id into v_organization_id
  from public.companies c where c.id=p_company_id and c.event_id=p_event_id and c.kind='exhibitor';
  if v_organization_id is null or not (
    exists(select 1 from public.exhibitor_portal_members m where m.event_id=p_event_id and m.company_id=p_company_id and m.user_id=(select auth.uid()) and m.status='active')
    or public.is_org_member(v_organization_id)
    or public.is_platform_admin()
  ) then
    raise exception 'No tienes permiso para consultar estos visitantes' using errcode = '42501';
  end if;
  if p_element_id is not null and not exists(
    select 1 from public.booth_assignments ba
    join public.venue_map_elements element on element.id=ba.element_id
    join public.venue_maps vm on vm.id=element.map_id
    where ba.company_id=p_company_id and ba.element_id=p_element_id
      and ba.status<>'cancelled' and vm.event_id=p_event_id and vm.organization_id=v_organization_id
  ) then
    raise exception 'El stand no pertenece a este expositor' using errcode='42501';
  end if;

  return query
  with visits as (
    select visit.*,
      (coalesce(consent.share_with_exhibitors,false) and coalesce(((commercial_private.entitlement(v_organization_id,p_event_id)).capabilities->>'leads')::boolean,false)) as can_share,
      coalesce(reg.first_name,person.first_name) as first_name,
      coalesce(reg.last_name,person.last_name) as last_name,
      coalesce(reg.company,person.company) as professional_company,
      coalesce(reg.job_title,person.job_title) as professional_job_title,
      coalesce(reg.email,person.email) as professional_email
    from public.exhibitor_stand_visits visit
    left join public.registrations reg on reg.id=visit.registration_id
    left join public.event_participations participation on participation.id=visit.participation_id
    left join public.people person on person.id=participation.person_id
    left join public.participant_profile_consents consent
      on consent.registration_id=visit.registration_id or consent.participation_id=visit.participation_id
    where visit.event_id=p_event_id and visit.company_id=p_company_id
      and (p_element_id is null or visit.element_id=p_element_id)
  )
  select
    case when visits.registration_id is not null then 'registration:'||visits.registration_id::text else 'participation:'||visits.participation_id::text end,
    bool_or(visits.can_share),
    case when bool_or(visits.can_share) then trim(max(visits.first_name)||' '||coalesce(max(visits.last_name),'')) end,
    case when bool_or(visits.can_share) then max(visits.professional_company) end,
    case when bool_or(visits.can_share) then max(visits.professional_job_title) end,
    case when bool_or(visits.can_share) then max(visits.professional_email) end,
    min(visits.visited_at),max(visits.visited_at),count(*)
  from visits
  group by visits.registration_id,visits.participation_id
  order by max(visits.visited_at) desc;
end;
$$;


-- Commercial operations isolated from the leads owned by event organizers.
create table if not exists public.platform_commercial_leads(
 id uuid primary key default gen_random_uuid(), name text not null, email text not null, organization_name text not null,
 event_type text not null, expected_participants int not null check(expected_participants between 1 and 100000),
 needs_printing boolean not null default false, source text not null default 'website',
 stage text not null default 'new' check(stage in ('new','demo','proposal','won','lost')), assigned_to uuid references auth.users(id),
 next_action_at timestamptz, note text, notice_version text not null default '2026-10-14', created_at timestamptz not null default now()
);
create table if not exists public.support_tickets(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), event_id uuid references public.events(id),
 title text not null check(length(title) between 5 and 200), description text not null check(length(description) between 10 and 5000),
 severity text not null check(severity in ('critical','normal')), status text not null default 'open' check(status in ('open','in_progress','resolved')),
 assigned_to uuid references auth.users(id), response_note text, created_by uuid references auth.users(id) default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.commercial_acceptances(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), organization_id uuid not null references public.organizations(id),
 terms_version text not null, privacy_version text not null, accepted_at timestamptz not null default now(), unique(user_id,organization_id,terms_version,privacy_version)
);
create or replace function public.accept_commercial_terms(p_org uuid,p_version text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not commercial_private.can_manage(p_org) or p_version<>'2026-10-14' then raise exception 'Aceptación no válida'; end if;
 insert into public.commercial_acceptances(user_id,organization_id,terms_version,privacy_version) values(auth.uid(),p_org,p_version,p_version) on conflict do nothing;
end $$;
create or replace function public.admin_event_contract(p_org uuid,p_event uuid,p_starts timestamptz,p_ends timestamptz,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_starts is null or p_ends is null or p_amount is null or p_reason is null or not exists(select 1 from public.events where id=p_event and organization_id=p_org) or p_ends<=p_starts or p_amount<0 or length(trim(p_reason)) not between 10 and 5000 then raise exception 'Revisa evento, fechas, importe y condiciones'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,3));
 if exists(select 1 from public.commercial_contracts where organization_id=p_org and event_id=p_event and modality='event' and status='active' and starts_at<p_ends and (ends_at is null or ends_at>p_starts)) then raise exception 'Ya existe un contrato de este evento para esa ventana'; end if;
 insert into public.commercial_contracts(organization_id,event_id,modality,plan,starts_at,ends_at,capabilities,limits,price_usd,terms_version,reason,created_by)
 values(p_org,p_event,'event','asociacion',p_starts,p_ends,'{"core":true,"programs":true,"exposure":true,"leads":true,"sponsorship":true,"campaigns":true,"print_batches":true}',
 '{"events":1,"participants_event":1500,"participants_month":1500,"users":5,"stations":3,"access_points":3,"companies":75}',p_amount,'2026-10-14',trim(p_reason),auth.uid()) returning id into v_id;
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),'event_contract',jsonb_build_object('contract_id',v_id,'event_id',p_event,'reason',p_reason));
 update public.organizations set status='active' where id=p_org and status<>'suspended';
 return v_id;
end $$;
create or replace function public.admin_commercial_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 return jsonb_build_object(
 'mrr_usd',(select coalesce(sum(c.price_usd),0) from public.organizations o cross join lateral commercial_private.entitlement(o.id) c where c.modality='monthly' and o.status<>'suspended'),
 'collected_30d_usd',(select coalesce(sum(received_usd),0) from public.subscription_payments where status='approved' and reviewed_at>=now()-interval '30 days'),
 'event_contract_value_usd',(select coalesce(sum(price_usd),0) from public.commercial_contracts where modality='event' and status='active' and created_at>=now()-interval '30 days'),
 'pending_payments',(select count(*) from public.subscription_payments where status='pending'),
 'overdue_reviews',(select count(*) from public.subscription_payments where status='pending' and created_at<now()-interval '1 day'),
 'trials',(select count(*) from public.commercial_contracts where modality='trial' and status='active' and ends_at>now()),
 'renewals_due_7d',(select count(distinct organization_id) from public.commercial_contracts where modality='monthly' and status='active' and ends_at between now() and now()+interval '7 days'),
 'leads',(select count(*) from public.platform_commercial_leads),
 'open_tickets',(select count(*) from public.support_tickets where status<>'resolved'));
end $$;
do $$declare t text;begin foreach t in array array['platform_commercial_leads','support_tickets','commercial_acceptances'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;end $$;
grant select,update on public.platform_commercial_leads to authenticated;
drop policy if exists platform_leads_admin on public.platform_commercial_leads;
create policy platform_leads_admin on public.platform_commercial_leads for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
grant select,insert,update on public.support_tickets to authenticated;
drop policy if exists support_read on public.support_tickets;
create policy support_read on public.support_tickets for select to authenticated using(public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists support_create on public.support_tickets;
create policy support_create on public.support_tickets for insert to authenticated with check(public.is_org_member(organization_id) and created_by=auth.uid() and status='open' and assigned_to is null and response_note is null and (event_id is null or exists(select 1 from public.events where id=event_id and organization_id=support_tickets.organization_id)));
drop policy if exists support_admin on public.support_tickets;
create policy support_admin on public.support_tickets for update to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
grant select on public.commercial_acceptances to authenticated;
drop policy if exists acceptance_read on public.commercial_acceptances;
create policy acceptance_read on public.commercial_acceptances for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
revoke all on function public.accept_commercial_terms(uuid,text),public.admin_event_contract(uuid,uuid,timestamptz,timestamptz,numeric,text),public.admin_commercial_metrics() from public,anon,authenticated;
grant execute on function public.accept_commercial_terms(uuid,text),public.admin_event_contract(uuid,uuid,timestamptz,timestamptz,numeric,text),public.admin_commercial_metrics() to authenticated;
revoke all on all functions in schema commercial_private from public,anon,authenticated;
notify pgrst,'reload schema';

alter table public.participant_access add column if not exists consent_verified boolean not null default false;
create or replace function public.redeem_participant_recovery(p_token_hash text,p_session_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.participant_access;
begin
  select * into a from public.participant_access where token_hash=p_token_hash and kind='recovery' and used_at is null and revoked_at is null and expires_at>now() for update;
  if a.token_hash is null then return false; end if;
  update public.participant_access set used_at=now() where token_hash=a.token_hash;
  insert into public.participant_access(token_hash,registration_ids,participation_ids,kind,expires_at,consent_verified) values(p_session_hash,a.registration_ids,a.participation_ids,'session',now()+interval '24 hours',true);
  return true;
end $$;


create or replace function public.participant_consent(p_session_hash text,p_token text,p_share boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.participant_access;
begin
 select * into a from public.participant_access where token_hash=p_session_hash and kind='session' and revoked_at is null and expires_at>now() and consent_verified;
 if a.token_hash is null or not (exists(select 1 from public.registrations where id=any(a.registration_ids) and credential_token=p_token) or exists(select 1 from public.event_participations where id=any(a.participation_ids) and credential_token=p_token)) then raise exception 'Verifica tu correo mediante Recuperar registro para gestionar este permiso' using errcode='42501'; end if;
 if p_share is not null then perform public.set_exhibitor_profile_consent_by_token(p_token,p_share,'credential_page'); end if;
 return public.get_exhibitor_profile_consent_by_token(p_token);
end $$;
revoke all on function public.set_exhibitor_profile_consent_by_token(text,boolean,text),public.get_exhibitor_profile_consent_by_token(text),public.participant_consent(text,text,boolean) from public,anon,authenticated;
grant execute on function public.participant_consent(text,text,boolean),public.redeem_participant_recovery(text,text) to service_role;
notify pgrst,'reload schema';

alter table public.commercial_notifications add column if not exists dedupe_key text;
create unique index if not exists commercial_notification_dedupe on public.commercial_notifications(dedupe_key) where dedupe_key is not null;
create table if not exists commercial_private.mail_outbox(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null references public.commercial_notifications(id),
 user_id uuid not null references auth.users(id), attempts int not null default 0, claimed_at timestamptz, delivered_at timestamptz,last_error text,
 unique(notification_id,user_id)
);
alter table commercial_private.mail_outbox enable row level security;
create or replace function public.claim_commercial_mail() returns table(id uuid,email text,message text) language plpgsql security definer set search_path='' as $$
begin
 insert into public.commercial_notifications(organization_id,message,dedupe_key)
 select c.organization_id,case when c.ends_at<=now() then 'Tu contrato venció. Conservas consulta y exportación; revisa renovación para continuar operando.' else 'Tu contrato vence en los próximos siete días. Revisa la renovación y la ventana contratada de tus eventos.' end,
 c.id::text||case when c.ends_at<=now() then ':expired' else ':due' end
 from public.commercial_contracts c where c.status='active' and c.ends_at between now()-interval '1 day' and now()+interval '7 days'
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
 insert into commercial_private.mail_outbox(notification_id,user_id)
 select n.id,m.user_id from public.commercial_notifications n join public.memberships m on m.organization_id=n.organization_id and m.role in('owner','admin')
 where n.created_at>=now()-interval '7 days' on conflict do nothing;
 return query with claims as (
 select x.id from commercial_private.mail_outbox x where x.delivered_at is null and x.attempts<5 and (x.claimed_at is null or x.claimed_at<now()-interval '1 hour') order by x.id for update skip locked limit 30
 ), updated as (update commercial_private.mail_outbox x set attempts=x.attempts+1,claimed_at=now() from claims where x.id=claims.id returning x.*)
 select u.id,a.email::text,n.message from updated u join auth.users a on a.id=u.user_id join public.commercial_notifications n on n.id=u.notification_id;
end $$;
create or replace function public.finish_commercial_mail(p_id uuid,p_error text default null) returns void language sql security definer set search_path='' as $$
 update commercial_private.mail_outbox set delivered_at=case when p_error is null then now() end,last_error=left(p_error,500) where id=p_id;
$$;
revoke all on function public.claim_commercial_mail(),public.finish_commercial_mail(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_commercial_mail(),public.finish_commercial_mail(uuid,text) to service_role;
-- Initial member creation happens after the trial contract is established.
drop trigger if exists commercial_member_quota on public.memberships;
create trigger commercial_member_quota before insert on public.memberships for each row execute function commercial_private.check_write('core');
notify pgrst,'reload schema';

create or replace function public.admin_publish_offer(p_plan public.org_plan,p_name text,p_price numeric,p_capabilities jsonb,p_limits jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; key text;
begin
 if not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_price is null or p_price='NaN'::numeric or p_price<=0 or length(trim(p_name))<3 or jsonb_typeof(p_capabilities)<>'object' or jsonb_typeof(p_limits)<>'object' then raise exception 'Oferta no válida'; end if;
 foreach key in array array['core','programs','exposure','leads','sponsorship','campaigns','print_batches'] loop
 if jsonb_typeof(p_capabilities->key) is distinct from 'boolean' then raise exception 'Módulo no válido: %',key; end if;
 end loop;
 foreach key in array array['events','participants_event','participants_month','users','stations','access_points','companies'] loop
 if p_limits->>key is null or (p_limits->>key)::int>100000 or (p_limits->>key)::int<0 or (key<>'companies' and (p_limits->>key)::int=0) then raise exception 'Cuota no válida: %',key; end if;
 end loop;
 if coalesce((p_capabilities->>'leads')::boolean,false) and not coalesce((p_capabilities->>'exposure')::boolean,false) then raise exception 'Captación requiere exposición'; end if;
 if not coalesce((p_capabilities->>'core')::boolean,false) then raise exception 'La oferta debe incluir registro y acreditación'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_plan::text,15));
 update public.offer_versions set active=false where modality='monthly' and plan=p_plan and active;
 insert into public.offer_versions(code,plan,name,modality,price_usd,capabilities,limits) values('monthly-'||gen_random_uuid(),p_plan,trim(p_name),'monthly',p_price,p_capabilities,p_limits) returning id into v_id;
 insert into public.commercial_audit(actor_id,action,details) values(auth.uid(),'offer_published',jsonb_build_object('offer_id',v_id,'plan',p_plan));
 return v_id;
end $$;
revoke all on function public.admin_publish_offer(public.org_plan,text,numeric,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_publish_offer(public.org_plan,text,numeric,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';

create or replace function public.public_commercial_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('name',f.name,'plan',f.plan,'price_usd',f.price_usd,'limits',f.limits,'capabilities',f.capabilities) order by f.price_usd),'[]')
 from public.offer_versions f join public.plans p on p.plan=f.plan where f.active and f.modality='monthly' and p.is_active;
$$;
revoke all on function public.public_commercial_catalog() from public,anon,authenticated;
grant execute on function public.public_commercial_catalog() to anon,authenticated;
notify pgrst,'reload schema';

create or replace function commercial_private.protect_offer() returns trigger language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-'active') is distinct from (to_jsonb(old)-'active') then raise exception 'Publica una nueva versión; la oferta anterior es inmutable'; end if;
 return new;
end $$;
drop trigger if exists immutable_offer on public.offer_versions;
create trigger immutable_offer before update on public.offer_versions for each row execute function commercial_private.protect_offer();
revoke all on all functions in schema commercial_private from public,anon,authenticated;
notify pgrst,'reload schema';

-- Every entry path (including manually invited clients) gets a timed trial,
-- never an uncontracted unlimited account.
create or replace function commercial_private.initialize_trial() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.offer_versions;
begin
 if TG_WHEN='BEFORE' then
 new.trial_ends_at:=now()+interval '14 days';
 if new.status<>'suspended' then new.status:='trial'; end if;
 return new;
 end if;
 select * into strict f from public.offer_versions where code='trial-v1';
 insert into public.commercial_contracts(organization_id,offer_id,modality,plan,starts_at,ends_at,capabilities,limits,terms_version)
 values(new.id,f.id,'trial',f.plan,now(),new.trial_ends_at,f.capabilities,f.limits,f.terms_version);
 return new;
end $$;
drop trigger if exists initialize_trial_before on public.organizations;
drop trigger if exists initialize_trial_after on public.organizations;
create trigger initialize_trial_before before insert on public.organizations for each row execute function commercial_private.initialize_trial();
create trigger initialize_trial_after after insert on public.organizations for each row execute function commercial_private.initialize_trial();
drop policy if exists commercial_trial_public on public.organizations;
drop policy if exists commercial_trial_public on public.organizations;
create policy commercial_trial_public on public.organizations for select to anon,authenticated using(status='trial' and trial_ends_at>now());
revoke all on all functions in schema commercial_private from public,anon,authenticated;
notify pgrst,'reload schema';

create unique index if not exists commercial_one_active_offer on public.offer_versions(plan) where active and modality='monthly';
notify pgrst,'reload schema';

create or replace function public.worker_commercial_feature(p_org uuid,p_event uuid,p_feature text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare c public.commercial_contracts; f text:=p_feature;
begin
 if not exists(select 1 from public.events where id=p_event and organization_id=p_org) or exists(select 1 from public.organizations where id=p_org and status='suspended') then return false; end if;
 if f='floorplan' then select case when coalesce(to_jsonb(e)->>'event_type','exhibition')='exhibition' then 'exposure' else 'core' end into f from public.events e where id=p_event; end if;
 c:=commercial_private.entitlement(p_org,p_event);
 return coalesce((c.capabilities->>f)::boolean,false);
end $$;
revoke all on function public.worker_commercial_feature(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.worker_commercial_feature(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';

create or replace function commercial_private.audit_operations() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);
begin
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(nullif(r->>'organization_id','')::uuid,auth.uid(),TG_TABLE_NAME||'_'||lower(TG_OP),jsonb_build_object('record_id',r->>'id','stage',r->>'stage','status',r->>'status','assigned_to',r->>'assigned_to','note',coalesce(r->>'response_note',r->>'note')));
 return new;
end $$;
drop trigger if exists audit_support on public.support_tickets;
create trigger audit_support after insert or update on public.support_tickets for each row execute function commercial_private.audit_operations();
drop trigger if exists audit_platform_leads on public.platform_commercial_leads;
create trigger audit_platform_leads after insert or update on public.platform_commercial_leads for each row execute function commercial_private.audit_operations();
revoke all on all functions in schema commercial_private from public,anon,authenticated;
notify pgrst,'reload schema';

-- Resolve scheduled plan changes at read time in the existing client console.
create or replace function public.admin_organizations()
returns table (
  id uuid, name text, slug text, custom_hostname text,
  plan public.org_plan, status public.org_status, created_at timestamptz,
  event_count bigint, member_count bigint, registration_count bigint,
  period_end timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    o.id, o.name, o.slug, o.custom_hostname, coalesce((commercial_private.entitlement(o.id)).plan,o.plan), o.status, o.created_at,
    (select count(*) from public.events e where e.organization_id = o.id and e.status <> 'archived'),
    (select count(*) from public.memberships m where m.organization_id = o.id),
    (select count(*) from public.registrations r where r.organization_id = o.id),
    coalesce((commercial_private.entitlement(o.id)).ends_at,(select max(c.ends_at) from public.commercial_contracts c where c.organization_id=o.id and c.status='active'))
  from public.organizations o
  where public.is_platform_admin()
  order by o.created_at desc;
$$;


revoke all on function public.admin_organizations() from public,anon;
grant execute on function public.admin_organizations() to authenticated;
notify pgrst,'reload schema';
