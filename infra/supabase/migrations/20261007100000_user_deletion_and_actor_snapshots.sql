-- Eliminación segura de usuarios y trazabilidad durable de los operadores.
-- Las relaciones de acceso mantienen ON DELETE CASCADE. Las referencias
-- históricas conservan una copia legible y liberan solamente el UUID.

create table if not exists public.platform_user_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in (
    'user_created', 'membership_added', 'membership_updated',
    'membership_removed', 'user_delete_requested', 'user_deleted',
    'user_delete_failed'
  )),
  target_user_id uuid not null,
  target_name text,
  target_email text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_email text,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  role text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_user_audit_target_idx
  on public.platform_user_audit(target_user_id, created_at desc);
create index if not exists platform_user_audit_created_idx
  on public.platform_user_audit(created_at desc);

alter table public.platform_user_audit enable row level security;
drop policy if exists platform_user_audit_admin_read on public.platform_user_audit;
create policy platform_user_audit_admin_read on public.platform_user_audit
  for select to authenticated using (public.is_platform_admin());
revoke all on public.platform_user_audit from public, anon, authenticated;
grant select on public.platform_user_audit to authenticated;

-- Añade snapshots legibles a las bitácoras operativas y de auditoría.
alter table public.admin_actions
  add column if not exists actor_name text,
  add column if not exists actor_email text;
alter table public.checkin_records
  add column if not exists scanned_by_name text,
  add column if not exists scanned_by_email text;
alter table public.checkin_incidents
  add column if not exists created_by_name text,
  add column if not exists created_by_email text,
  add column if not exists resolved_by_name text,
  add column if not exists resolved_by_email text;
alter table public.badge_print_logs
  add column if not exists printed_by_name text,
  add column if not exists printed_by_email text;
alter table public.exhibitor_portal_audit
  add column if not exists actor_name text,
  add column if not exists actor_email text;
alter table public.venue_map_versions
  add column if not exists created_by_name text,
  add column if not exists created_by_email text;
alter table public.badge_identity_audit
  add column if not exists changed_by_name text,
  add column if not exists changed_by_email text;
alter table public.accreditation_service_sessions
  add column if not exists operator_name text,
  add column if not exists operator_email text;
alter table public.exhibitor_stand_visits
  add column if not exists scanned_by_name text,
  add column if not exists scanned_by_email text;
alter table public.seat_reservation_audit
  add column if not exists actor_name text,
  add column if not exists actor_email text;

-- Completa UUID y snapshot al escribir una bitácora. TG_ARGV contiene:
-- columna UUID, columna nombre, columna correo.
create or replace function public.snapshot_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_name text;
  v_email text;
  v_payload jsonb;
begin
  v_actor_id := nullif(to_jsonb(new)->>tg_argv[0], '')::uuid;
  if v_actor_id is null then
    v_actor_id := auth.uid();
  end if;
  if v_actor_id is null then
    return new;
  end if;

  select
    coalesce(
      nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
      u.email::text
    ),
    u.email::text
  into v_name, v_email
  from auth.users u
  where u.id = v_actor_id;

  v_payload := jsonb_build_object(tg_argv[0], v_actor_id);
  if nullif(to_jsonb(new)->>tg_argv[1], '') is null and v_name is not null then
    v_payload := v_payload || jsonb_build_object(tg_argv[1], v_name);
  end if;
  if nullif(to_jsonb(new)->>tg_argv[2], '') is null and v_email is not null then
    v_payload := v_payload || jsonb_build_object(tg_argv[2], v_email);
  end if;
  new := jsonb_populate_record(new, v_payload);
  return new;
end;
$$;

revoke all on function public.snapshot_audit_actor() from public, anon, authenticated;

drop trigger if exists admin_actions_actor_snapshot on public.admin_actions;
create trigger admin_actions_actor_snapshot before insert or update on public.admin_actions
  for each row execute function public.snapshot_audit_actor('user_id','actor_name','actor_email');
drop trigger if exists checkin_records_actor_snapshot on public.checkin_records;
create trigger checkin_records_actor_snapshot before insert or update on public.checkin_records
  for each row execute function public.snapshot_audit_actor('scanned_by','scanned_by_name','scanned_by_email');
drop trigger if exists badge_print_logs_actor_snapshot on public.badge_print_logs;
create trigger badge_print_logs_actor_snapshot before insert or update on public.badge_print_logs
  for each row execute function public.snapshot_audit_actor('printed_by','printed_by_name','printed_by_email');
drop trigger if exists exhibitor_portal_audit_actor_snapshot on public.exhibitor_portal_audit;
create trigger exhibitor_portal_audit_actor_snapshot before insert or update on public.exhibitor_portal_audit
  for each row execute function public.snapshot_audit_actor('actor_user_id','actor_name','actor_email');
drop trigger if exists venue_map_versions_actor_snapshot on public.venue_map_versions;
create trigger venue_map_versions_actor_snapshot before insert or update on public.venue_map_versions
  for each row execute function public.snapshot_audit_actor('created_by','created_by_name','created_by_email');
drop trigger if exists badge_identity_audit_actor_snapshot on public.badge_identity_audit;
create trigger badge_identity_audit_actor_snapshot before insert or update on public.badge_identity_audit
  for each row execute function public.snapshot_audit_actor('changed_by','changed_by_name','changed_by_email');
drop trigger if exists accreditation_sessions_actor_snapshot on public.accreditation_service_sessions;
create trigger accreditation_sessions_actor_snapshot before insert or update on public.accreditation_service_sessions
  for each row execute function public.snapshot_audit_actor('operator_id','operator_name','operator_email');
drop trigger if exists exhibitor_stand_visits_actor_snapshot on public.exhibitor_stand_visits;
create trigger exhibitor_stand_visits_actor_snapshot before insert or update on public.exhibitor_stand_visits
  for each row execute function public.snapshot_audit_actor('scanned_by','scanned_by_name','scanned_by_email');
drop trigger if exists seat_reservation_audit_actor_snapshot on public.seat_reservation_audit;
create trigger seat_reservation_audit_actor_snapshot before insert or update on public.seat_reservation_audit
  for each row execute function public.snapshot_audit_actor('actor_user_id','actor_name','actor_email');
drop trigger if exists platform_user_audit_actor_snapshot on public.platform_user_audit;
create trigger platform_user_audit_actor_snapshot before insert or update on public.platform_user_audit
  for each row execute function public.snapshot_audit_actor('actor_user_id','actor_name','actor_email');

create or replace function public.snapshot_checkin_incident_actors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_name text; v_email text;
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if new.created_by is not null and new.created_by_name is null then
    select coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),nullif(btrim(raw_user_meta_data->>'full_name'),''),email::text),email::text
    into v_name,v_email from auth.users where id=new.created_by;
    new.created_by_name:=v_name; new.created_by_email:=v_email;
  end if;
  if new.status='resolved' and (tg_op='INSERT' or old.status is distinct from new.status) and new.resolved_by is null then
    new.resolved_by:=auth.uid();
  end if;
  if new.resolved_by is not null and new.resolved_by_name is null then
    select coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),nullif(btrim(raw_user_meta_data->>'full_name'),''),email::text),email::text
    into v_name,v_email from auth.users where id=new.resolved_by;
    new.resolved_by_name:=v_name; new.resolved_by_email:=v_email;
  end if;
  return new;
end;
$$;
revoke all on function public.snapshot_checkin_incident_actors() from public, anon, authenticated;
drop trigger if exists checkin_incidents_actor_snapshot on public.checkin_incidents;
create trigger checkin_incidents_actor_snapshot before insert or update on public.checkin_incidents
  for each row execute function public.snapshot_checkin_incident_actors();

-- Recupera los nombres de los registros históricos existentes antes de que
-- cualquiera de las cuentas sea eliminada.
update public.admin_actions a set actor_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),actor_email=u.email::text from auth.users u where a.user_id=u.id and a.actor_name is null;
update public.checkin_records a set scanned_by_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),scanned_by_email=u.email::text from auth.users u where a.scanned_by=u.id and a.scanned_by_name is null;
update public.checkin_incidents a set created_by_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),created_by_email=u.email::text from auth.users u where a.created_by=u.id and a.created_by_name is null;
update public.checkin_incidents a set resolved_by_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),resolved_by_email=u.email::text from auth.users u where a.resolved_by=u.id and a.resolved_by_name is null;
update public.badge_print_logs a set printed_by_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),printed_by_email=u.email::text from auth.users u where a.printed_by=u.id and a.printed_by_name is null;
update public.exhibitor_portal_audit a set actor_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),actor_email=u.email::text from auth.users u where a.actor_user_id=u.id and a.actor_name is null;
update public.venue_map_versions a set created_by_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),created_by_email=u.email::text from auth.users u where a.created_by=u.id and a.created_by_name is null;
update public.badge_identity_audit a set changed_by_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),changed_by_email=u.email::text from auth.users u where a.changed_by=u.id and a.changed_by_name is null;
update public.accreditation_service_sessions a set operator_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),operator_email=u.email::text from auth.users u where a.operator_id=u.id and a.operator_name is null;
update public.exhibitor_stand_visits a set scanned_by_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),scanned_by_email=u.email::text from auth.users u where a.scanned_by=u.id and a.scanned_by_name is null;
update public.seat_reservation_audit a set actor_name=coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),u.email::text),actor_email=u.email::text from auth.users u where a.actor_user_id=u.id and a.actor_name is null;

-- Las referencias históricas no deben bloquear la baja de Auth ni borrar el
-- registro. Se convierten de NO ACTION/RESTRICT a SET NULL de forma segura.
do $$
declare r record;
begin
  for r in
    select con.oid, con.conname, con.conrelid::regclass as table_name, att.attname as column_name
    from pg_constraint con
    join pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1]
    where con.contype='f'
      and con.confrelid='auth.users'::regclass
      and cardinality(con.conkey)=1
      and con.confdeltype in ('a','r')
  loop
    execute format('alter table %s alter column %I drop not null',r.table_name,r.column_name);
    execute format('alter table %s drop constraint %I',r.table_name,r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null',r.table_name,r.conname,r.column_name);
  end loop;
end $$;
