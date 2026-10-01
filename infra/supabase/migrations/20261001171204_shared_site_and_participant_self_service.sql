-- Additive; existing registration and QR contracts remain available.
drop policy if exists public_sites_member_all on public.public_sites;
create policy public_sites_member_all on public.public_sites for all to authenticated
using(public.has_org_role(organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin())
with check(public.has_org_role(organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin());
create or replace function public.validate_public_site_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.scope='event' then
    if not exists(select 1 from public.events where id=new.event_id and organization_id=new.organization_id) then raise exception 'Sitio ajeno al evento' using errcode='42501'; end if;
  elsif new.scope='program' then
    if not exists(select 1 from public.event_programs where id=new.program_id and organization_id=new.organization_id) then raise exception 'Sitio ajeno al programa' using errcode='42501'; end if;
  else raise exception 'Alcance inválido'; end if;
  return new;
end $$;
drop trigger if exists validate_public_site_scope on public.public_sites;
create trigger validate_public_site_scope before insert or update on public.public_sites for each row execute function public.validate_public_site_scope();
revoke all on function public.validate_public_site_scope() from public,anon,authenticated;
create or replace function public.save_public_landing(p_event_id uuid, p_program_id uuid, p_config jsonb, p_publish boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; pr public.event_programs; site public.public_sites; published jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión' using errcode='42501'; end if;
  if jsonb_typeof(p_config) <> 'object' or p_config is null then raise exception 'Configuración inválida'; end if;
  if p_program_id is not null then
    select * into pr from public.event_programs where id=p_program_id for update;
    if not found or not (public.has_org_role(pr.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin()) then raise exception 'Sin permiso' using errcode='42501'; end if;
    if pr.registration_config->>'web_event_id' is distinct from p_event_id::text or not exists(select 1 from public.program_events where program_id=pr.id and event_id=p_event_id) then raise exception 'El evento principal cambió. Recarga la configuración.'; end if;
  end if;
  select * into e from public.events where id=p_event_id for update;
  if not found or not (public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin()) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if p_program_id is not null and e.organization_id<>pr.organization_id then raise exception 'Evento ajeno al programa' using errcode='42501'; end if;
  if p_program_id is null and exists(select 1 from public.program_events where event_id=e.id) then raise exception 'Abre la web desde el programa correspondiente'; end if;
  select * into site from public.public_sites where (p_program_id is not null and program_id=p_program_id) or (p_program_id is null and event_id=e.id) for update;
  if site.id is null and p_program_id is not null then
    select * into site from public.public_sites where event_id=e.id for update;
    -- Preserve legacy slug, domain, status and published content when attaching it.
    if site.id is not null then update public.public_sites set event_id=null,program_id=p_program_id,scope='program' where id=site.id returning * into site; end if;
  end if;
  if site.id is null then
    insert into public.public_sites(organization_id,scope,event_id,program_id,landing_config)
    values(e.organization_id,case when p_program_id is null then 'event' else 'program' end,case when p_program_id is null then e.id end,p_program_id,coalesce(e.config->'public_landing','{}'::jsonb)) returning * into site;
  end if;
  if site.organization_id<>e.organization_id then raise exception 'Sitio ajeno al evento' using errcode='42501'; end if;
  published := p_config || jsonb_build_object('primary_event_id',e.id);
  update public.public_sites set landing_config=case when p_publish then published || jsonb_build_object('draft',p_config) else landing_config || jsonb_build_object('draft',p_config,'primary_event_id',e.id) end where id=site.id returning * into site;
  update public.events set config=config || jsonb_build_object('public_landing_draft',p_config) || case when p_publish then jsonb_build_object('public_landing',p_config) else '{}'::jsonb end where id=e.id returning * into e;
  return jsonb_build_object('site',to_jsonb(site),'event_config',e.config);
end $$;
revoke all on function public.save_public_landing(uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_public_landing(uuid,uuid,jsonb,boolean) to authenticated;

create table if not exists public.event_ticket_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check(length(trim(name)) between 2 and 100),
  description text not null default '', benefits text[] not null default '{}',
  price numeric(12,2) not null check(price>=0), currency text not null default 'USD' check(currency in ('USD','VES','COP')),
  capacity integer check(capacity>=0), sales_start timestamptz, sales_end timestamptz,
  published boolean not null default false,
  check(sales_end is null or sales_start is null or sales_end>sales_start),
  unique(id,event_id,organization_id)
);
alter table public.event_ticket_categories enable row level security;
revoke all on public.event_ticket_categories from anon,authenticated;
grant select on public.event_ticket_categories to authenticated;
grant all on public.event_ticket_categories to service_role;
drop policy if exists tickets_admin_read on public.event_ticket_categories;
create policy tickets_admin_read on public.event_ticket_categories for select to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin());

alter table public.registrations add column if not exists ticket_category_id uuid;
alter table public.registrations add column if not exists purchase_snapshot jsonb not null default '{}';
alter table public.event_participations add column if not exists purchase_snapshot jsonb not null default '{}';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='registration_ticket_scope') then
    alter table public.registrations add constraint registration_ticket_scope foreign key(ticket_category_id,event_id,organization_id) references public.event_ticket_categories(id,event_id,organization_id);
  end if;
end $$;
create index if not exists registrations_ticket_inventory on public.registrations(event_id,ticket_category_id,status);

create or replace function public.save_ticket_category(p_event_id uuid,p_category_id uuid,p_values jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events; result uuid;
begin
  select * into e from public.events where id=p_event_id for update;
  if auth.uid() is null or e.id is null or not(public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin()) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if p_category_id is not null and not exists(select 1 from public.event_ticket_categories where id=p_category_id and event_id=e.id and organization_id=e.organization_id) then raise exception 'Categoría ajena al evento' using errcode='42501'; end if;
  if (p_values->>'capacity') is not null and (p_values->>'capacity')::int < (select count(*) from public.registrations where ticket_category_id=p_category_id and status<>'rejected') then raise exception 'El cupo no puede ser menor que las reservas activas'; end if;
  insert into public.event_ticket_categories(id,organization_id,event_id,name,description,benefits,price,currency,capacity,sales_start,sales_end,published)
  values(coalesce(p_category_id,gen_random_uuid()),e.organization_id,e.id,trim(p_values->>'name'),coalesce(p_values->>'description',''),array(select jsonb_array_elements_text(coalesce(p_values->'benefits','[]'))),(p_values->>'price')::numeric,coalesce(p_values->>'currency','USD'),(p_values->>'capacity')::int,(p_values->>'sales_start')::timestamptz,(p_values->>'sales_end')::timestamptz,coalesce((p_values->>'published')::boolean,false))
  on conflict(id) do update set name=excluded.name,description=excluded.description,benefits=excluded.benefits,price=excluded.price,currency=excluded.currency,capacity=excluded.capacity,sales_start=excluded.sales_start,sales_end=excluded.sales_end,published=excluded.published returning id into result;
  return result;
end $$;
create or replace function public.set_ticket_categories_enabled(p_event_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
  select * into e from public.events where id=p_event_id for update;
  if auth.uid() is null or e.id is null or not(public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]) or public.is_platform_admin()) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if p_enabled and coalesce(e.config->>'registration_mode','paid')='invitation' then raise exception 'Las invitaciones conservan su flujo propio'; end if;
  if p_enabled and not exists(select 1 from public.event_ticket_categories where event_id=e.id and published) then raise exception 'Publica al menos una categoría'; end if;
  update public.events set config=config||jsonb_build_object('ticket_categories_enabled',p_enabled) where id=e.id;
  return p_enabled;
end $$;
revoke all on function public.save_ticket_category(uuid,uuid,jsonb),public.set_ticket_categories_enabled(uuid,boolean) from public,anon;
grant execute on function public.save_ticket_category(uuid,uuid,jsonb),public.set_ticket_categories_enabled(uuid,boolean) to authenticated;

create or replace function public.get_public_ticket_categories(p_event_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('remaining',case when c.capacity is null then null else greatest(c.capacity-(select count(*) from public.registrations r where r.ticket_category_id=c.id and r.status<>'rejected'),0) end) order by c.price,c.name),'[]')
 from public.event_ticket_categories c join public.events e on e.id=c.event_id and e.organization_id=c.organization_id
 where e.id=p_event_id and e.status='published' and coalesce((e.config->>'ticket_categories_enabled')::boolean,false) and c.published
 and (c.sales_start is null or c.sales_start<=now()) and (c.sales_end is null or c.sales_end>now());
$$;
revoke all on function public.get_public_ticket_categories(uuid) from public;
grant execute on function public.get_public_ticket_categories(uuid) to anon,authenticated;

-- All insert paths serialize on the event; counts derive from active rows,
-- so a rejection releases inventory once, without decrement counters.
create or replace function public.capture_registration_purchase()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.events; cat public.event_ticket_categories; s public.seats; amount numeric; curr text; taken int; reserved int;
begin
  if tg_op='UPDATE' then
    if new.purchase_snapshot is distinct from old.purchase_snapshot or new.ticket_category_id is distinct from old.ticket_category_id or new.event_id is distinct from old.event_id or new.organization_id is distinct from old.organization_id then raise exception 'Las condiciones adquiridas no se pueden modificar'; end if;
    if old.status='rejected' and new.status<>'rejected' then
      select * into e from public.events where id=new.event_id for update;
      select count(*) into taken from public.registrations where event_id=e.id and status<>'rejected';
      select coalesce(sum(reserved_capacity),0)::int into reserved from public.seat_reservation_categories where event_id=e.id and is_active;
      if e.total_slots>0 and taken>=greatest(e.total_slots-reserved,0) then raise exception 'Aforo público agotado'; end if;
      select * into cat from public.event_ticket_categories where id=new.ticket_category_id;
      if cat.capacity is not null and (select count(*) from public.registrations where ticket_category_id=cat.id and status<>'rejected')>=cat.capacity then raise exception 'Categoría agotada'; end if;
    end if;
    return new;
  end if;
  select * into e from public.events where id=new.event_id for update;
  if new.organization_id<>e.organization_id then raise exception 'Organización inválida' using errcode='42501'; end if;
  if coalesce((e.config->>'ticket_categories_enabled')::boolean,false) and new.ticket_category_id is null then raise exception 'Selecciona una categoría de entrada'; end if;
  if new.ticket_category_id is not null then
    select * into cat from public.event_ticket_categories where id=new.ticket_category_id and event_id=e.id and organization_id=e.organization_id;
    if cat.id is null or not cat.published or (cat.sales_start>now()) or (cat.sales_end<=now()) then raise exception 'Categoría no disponible'; end if;
    select count(*) into taken from public.registrations where ticket_category_id=cat.id and status<>'rejected';
    if cat.capacity is not null and taken>=cat.capacity then raise exception 'Categoría agotada'; end if;
  end if;
  select count(*) into taken from public.registrations where event_id=e.id and status<>'rejected';
  select coalesce(sum(reserved_capacity),0)::int into reserved from public.seat_reservation_categories where event_id=e.id and is_active;
  if e.total_slots>0 and taken>=greatest(e.total_slots-reserved,0) then raise exception 'Aforo público agotado'; end if;
  if new.seat_id is not null then
    select * into s from public.seats where id=new.seat_id and event_id=e.id for update;
    if s.id is null or s.reservation_category_id is not null or s.status<>'available' then raise exception 'Asiento no disponible'; end if;
  end if;
  -- Category price takes precedence over seat price; never add both.
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
drop trigger if exists capture_registration_purchase on public.registrations;
create trigger capture_registration_purchase before insert or update on public.registrations for each row execute function public.capture_registration_purchase();
revoke all on function public.capture_registration_purchase() from public,anon,authenticated;

create or replace function public.capture_program_purchase()
returns trigger language plpgsql security definer set search_path='' as $$
declare pr public.event_programs; e public.events;
begin
  if tg_op='UPDATE' then
    if new.purchase_snapshot is distinct from old.purchase_snapshot then raise exception 'Las condiciones adquiridas no se pueden modificar'; end if;
    return new;
  end if;
  select * into pr from public.event_programs where id=new.program_id;
  if new.event_id is not null then select * into e from public.events where id=new.event_id; end if;
  new.purchase_snapshot:=jsonb_build_object('event_name',coalesce(e.name,pr.name),'starts_at',coalesce(e.start_date,pr.starts_at),'venue',pr.venue_name,'timezone',coalesce(pr.registration_config->>'timezone','America/Caracas'),'amount',null,'currency',null);
  return new;
end $$;
drop trigger if exists capture_program_purchase on public.event_participations;
create trigger capture_program_purchase before insert or update on public.event_participations for each row execute function public.capture_program_purchase();
revoke all on function public.capture_program_purchase() from public,anon,authenticated;

create or replace function public.expire_registration_purchase(p_registration_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.registrations; event_id uuid;
begin
  select registrations.event_id into event_id from public.registrations where id=p_registration_id;
  perform 1 from public.events where id=event_id for update;
  select * into r from public.registrations where id=p_registration_id for update;
  if r.id is null or r.status<>'pending_payment' or r.payment_deadline is null or r.payment_deadline>=now() then return false; end if;
  update public.registrations set status='rejected',rejection_reason='Plazo de pago vencido',seat_id=null where id=r.id;
  if r.seat_id is not null then update public.seats set status='available' where id=r.seat_id; end if;
  return true;
end $$;
revoke all on function public.expire_registration_purchase(uuid) from public,anon,authenticated;
grant execute on function public.expire_registration_purchase(uuid) to service_role;

create or replace function public.register_event_purchase(p_event_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text,p_cedula text default null,p_seat_id uuid default null,p_campaign text default null,p_source text default null,p_medium text default null,p_category_id uuid default null)
returns table(registration_id uuid,registration_status public.registration_status,credential_token text,payment_required boolean)
language plpgsql security definer set search_path='' as $$
declare e public.events; r public.registrations;
begin
  select * into e from public.events where id=p_event_id for update;
  if e.id is null or e.status<>'published' or e.registration_deadline<now() then raise exception 'Registro no disponible'; end if;
  if length(trim(coalesce(p_first_name,'')))<2 or position('@' in trim(coalesce(p_email,'')))<2 then raise exception 'Datos inválidos'; end if;
  if coalesce(e.config->>'registration_mode','paid') not in ('paid','free') then raise exception 'Registro por invitación' using errcode='42501'; end if;
  if p_category_id is not null and not coalesce((e.config->>'ticket_categories_enabled')::boolean,false) then raise exception 'Categorías deshabilitadas'; end if;
  if p_seat_id is not null and not(coalesce((e.config->>'public_seat_selection_enabled')::boolean,false) and e.config->>'seat_assignment_mode'='attendee') then raise exception 'Selección de asiento deshabilitada'; end if;
  -- Duplicate retries never disclose somebody else's access token.
  if exists(select 1 from public.registrations where event_id=e.id and lower(email)=lower(trim(p_email))) then raise exception 'Ya existe un registro. Consulta o recupera tu registro.' using errcode='23505'; end if;
  insert into public.registrations(organization_id,event_id,first_name,last_name,email,phone,cedula,seat_id,ticket_category_id,status,payment_deadline,payment_confirmed_at)
  values(e.organization_id,e.id,trim(p_first_name),nullif(trim(p_last_name),''),lower(trim(p_email)),nullif(trim(p_phone),''),nullif(trim(p_cedula),''),p_seat_id,p_category_id,case when e.config->>'registration_mode'='free' then 'confirmed'::public.registration_status else 'pending_payment'::public.registration_status end,case when coalesce(e.config->>'registration_mode','paid')='paid' then now()+make_interval(days=>e.payment_timeout_days) end,case when e.config->>'registration_mode'='free' then now() end) returning * into r;
  if p_seat_id is not null then update public.seats set status=case when r.status='confirmed' then 'confirmed'::public.seat_status else 'reserved'::public.seat_status end where id=p_seat_id; end if;
  insert into public.event_conversion_events(organization_id,event_id,event_kind,campaign,source,medium) values(e.organization_id,e.id,'registration_completed',left(p_campaign,100),left(p_source,100),left(p_medium,100));
  return query select r.id,r.status,r.credential_token,r.status='pending_payment';
end $$;
revoke all on function public.register_event_purchase(uuid,text,text,text,text,text,uuid,text,text,text,uuid) from public;
grant execute on function public.register_event_purchase(uuid,text,text,text,text,text,uuid,text,text,text,uuid) to anon,authenticated;

create table if not exists public.participant_access (
  token_hash text primary key check(length(token_hash)=64),
  registration_ids uuid[] not null default '{}', participation_ids uuid[] not null default '{}',
  kind text not null check(kind in ('recovery','session')), expires_at timestamptz not null,
  used_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.participant_rate_limits (
  key text primary key, window_start timestamptz not null, attempts int not null
);
alter table public.participant_access enable row level security;
alter table public.participant_rate_limits enable row level security;
revoke all on public.participant_access,public.participant_rate_limits from anon,authenticated;
grant all on public.participant_access,public.participant_rate_limits to service_role;

create or replace function public.participant_rate_limit(p_key text,p_limit int)
returns boolean language plpgsql security definer set search_path='' as $$
declare n int;
begin
  insert into public.participant_rate_limits(key,window_start,attempts) values(p_key,now(),1)
  on conflict(key) do update set attempts=case when participant_rate_limits.window_start<now()-interval '15 minutes' then 1 else participant_rate_limits.attempts+1 end,window_start=case when participant_rate_limits.window_start<now()-interval '15 minutes' then now() else participant_rate_limits.window_start end returning attempts into n;
  return n<=p_limit;
end $$;
revoke all on function public.participant_rate_limit(text,int) from public,anon,authenticated;
grant execute on function public.participant_rate_limit(text,int) to service_role;

create or replace function public.create_registration_access(p_credential_token text)
returns text language plpgsql security definer set search_path='' as $$
declare regs uuid[]; parts uuid[]; token text;
begin
  select array_agg(id) into regs from public.registrations where credential_token=p_credential_token;
  select array_agg(id) into parts from public.event_participations where credential_token=p_credential_token;
  if regs is null and parts is null then raise exception 'Enlace inválido'; end if;
  if not public.participant_rate_limit('initial:'||encode(sha256(convert_to(p_credential_token,'UTF8')),'hex'),10) then raise exception 'Espera antes de volver a solicitar acceso'; end if;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.participant_access(token_hash,registration_ids,participation_ids,kind,expires_at) values(encode(sha256(convert_to(token,'UTF8')),'hex'),coalesce(regs,'{}'),coalesce(parts,'{}'),'session',now()+interval '24 hours');
  return token;
end $$;
revoke all on function public.create_registration_access(text) from public;
grant execute on function public.create_registration_access(text) to anon,authenticated;

create or replace function public.prepare_participant_recovery(p_email text,p_event_id uuid,p_program_id uuid,p_ip_hash text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare regs uuid[]; parts uuid[]; org uuid;
begin
  if not public.participant_rate_limit('ip:'||p_ip_hash,20) then return null; end if;
  if not public.participant_rate_limit('email:'||encode(sha256(convert_to(lower(trim(p_email))||coalesce(p_event_id,p_program_id)::text,'UTF8')),'hex'),3) then return null; end if;
  if (p_event_id is null)=(p_program_id is null) then return null; end if;
  if p_event_id is not null then
    select organization_id into org from public.events where id=p_event_id;
    select array_agg(id) into regs from public.registrations where event_id=p_event_id and organization_id=org and lower(trim(email))=lower(trim(p_email));
  else
    select organization_id into org from public.event_programs where id=p_program_id;
    select array_agg(ep.id) into parts from public.event_participations ep join public.people pe on pe.id=ep.person_id where ep.program_id=p_program_id and pe.organization_id=org and lower(trim(pe.email))=lower(trim(p_email));
  end if;
  if org is null or (regs is null and parts is null) then return null; end if;
  insert into public.participant_access(token_hash,registration_ids,participation_ids,kind,expires_at) values(p_token_hash,coalesce(regs,'{}'),coalesce(parts,'{}'),'recovery',now()+interval '30 minutes');
  return jsonb_build_object('organization_id',org,'registration_id',regs[1]);
end $$;
create or replace function public.redeem_participant_recovery(p_token_hash text,p_session_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.participant_access;
begin
  select * into a from public.participant_access where token_hash=p_token_hash and kind='recovery' and used_at is null and revoked_at is null and expires_at>now() for update;
  if a.token_hash is null then return false; end if;
  update public.participant_access set used_at=now() where token_hash=a.token_hash;
  insert into public.participant_access(token_hash,registration_ids,participation_ids,kind,expires_at) values(p_session_hash,a.registration_ids,a.participation_ids,'session',now()+interval '24 hours');
  return true;
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
    select jsonb_build_object('id',ep.id,'reference',left(ep.id::text,8),'program_id',pr.id,'event_id',ep.event_id,'name',pe.first_name||' '||coalesce(pe.last_name,''),'status',case ep.status when 'approved' then 'confirmed' when 'pending' then 'pending_approval' else ep.status end,'snapshot',case when ep.purchase_snapshot='{}'::jsonb then jsonb_build_object('event_name',pr.name,'starts_at',pr.starts_at,'venue',pr.venue_name,'timezone','America/Caracas','amount',null,'legacy',true) else ep.purchase_snapshot end,'passes',(select coalesce(jsonb_agg(p.name),'[]') from public.participation_passes pp join public.passes p on p.id=pp.pass_id where pp.participation_id=ep.id),'credential_token',case when ep.status='approved' then ep.credential_token end) row
    from public.event_participations ep join public.people pe on pe.id=ep.person_id join public.event_programs pr on pr.id=ep.program_id where ep.id=any(a.participation_ids)
  ) records;
  return result;
end $$;
revoke all on function public.prepare_participant_recovery(text,uuid,uuid,text,text),public.redeem_participant_recovery(text,text),public.get_participant_records(text) from public,anon,authenticated;
grant execute on function public.prepare_participant_recovery(text,uuid,uuid,text,text),public.redeem_participant_recovery(text,text),public.get_participant_records(text) to service_role;

create or replace function public.close_participant_access(p_session_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.participant_access set revoked_at=now() where token_hash=p_session_hash and kind='session' and revoked_at is null;
  return found;
end $$;
create or replace function public.purge_participant_access()
returns void language plpgsql security definer set search_path='' as $$
begin
  delete from public.participant_access where expires_at<now()-interval '1 day';
  delete from public.participant_rate_limits where window_start<now()-interval '1 day';
end $$;
revoke all on function public.close_participant_access(text),public.purge_participant_access() from public,anon,authenticated;
grant execute on function public.close_participant_access(text),public.purge_participant_access() to service_role;
notify pgrst,'reload schema';
