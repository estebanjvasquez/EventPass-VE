import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const container = 'eventpass-operations-qa-' + randomUUID().slice(0, 8)
function command(args, input, timeout = 120000) { return new Promise((resolve, reject) => { const p = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = ''; const timer = setTimeout(() => { p.kill(); reject(new Error('Docker timeout')) }, timeout); p.stdout.on('data', x => out += x); p.stderr.on('data', x => err += x); p.on('error', reject); p.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err.slice(-2500) || out.slice(-2500))) }); p.stdin.end(input ?? '') }) }
const sql = async text => { const out = await command(['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'qa', '-d', 'qa'], text); return out ? JSON.parse(out.split('\n').at(-1)) : null }
const ids = Object.fromEntries(['org', 'foreignOrg', 'owner', 'other', 'inviter', 'staff', 'event', 'social', 'point', 'vipPoint'].map(k => [k, randomUUID()]))
const auth = (who = ids.owner) => `select to_jsonb(set_config('request.jwt.claim.sub','${who}',false));`
const cmd = (action, data, event = ids.event, user = ids.owner) => sql(`${auth(user)}select event_operations_command('${event}','${action}','${JSON.stringify(data).replaceAll("'", "''")}'::jsonb);`)
const results = []
async function test(name, fn) { await fn(); results.push(name); console.log('PASS', name) }
try {
 await command(['run', '--rm', '--detach', '--name', container, '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=qa', '-e', 'POSTGRES_DB=qa', 'postgres:17'], null, 240000)
 for (let n = 0; n < 40; n++) { try { if (!(await command(['logs', container])).includes('PostgreSQL init process complete')) throw Error('init'); await command(['exec', container, 'pg_isready', '-U', 'qa'], null, 3000); break } catch { if (n === 39) throw Error('PostgreSQL unavailable'); await new Promise(r => setTimeout(r, 500)) } }
 await sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;create schema commercial_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create type member_role as enum('owner','admin','staff');create table auth.users(id uuid primary key,email text);create table organizations(id uuid primary key,status text default 'active');create table memberships(organization_id uuid,user_id uuid,role member_role);
 create function is_platform_admin() returns boolean language sql as $$select false$$;
 create function has_org_role(uuid,member_role[]) returns boolean language sql security definer as $$select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role=any($2))$$;
 create function is_org_member(uuid) returns boolean language sql security definer as $$select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid())$$;
 create table events(id uuid primary key,organization_id uuid,name text,event_type text,status text default 'published',end_date timestamptz,registration_deadline timestamptz,total_slots int default 100,config jsonb default '{"registration_mode":"invitation"}');
 create table registrations(id uuid primary key default gen_random_uuid(),organization_id uuid,event_id uuid,first_name text,last_name text,email text not null,phone text,status text default 'confirmed',payment_confirmed_at timestamptz,participation_type text,registration_source text,purchase_snapshot jsonb default '{}',credential_token text default encode(extensions.gen_random_bytes(16),'hex'),badge_cancelled_at timestamptz,badge_cancelled_reason text,updated_at timestamptz,attendance_status text default 'no_attendance',unique(event_id,email));
 create table commercial_contracts(id uuid primary key default gen_random_uuid(),organization_id uuid,capabilities jsonb default '{"core":true}',limits jsonb default '{"participants_event":100,"participants_month":100}',active boolean default true);
 create function commercial_private.entitlement(uuid,uuid default null) returns commercial_contracts language sql set search_path=public as $$select c from commercial_contracts c where organization_id=$1 and active limit 1$$;
 create table commercial_private.participant_usage(organization_id uuid,event_id uuid,scope_key text,identity_hash text,period_month date,primary key(organization_id,scope_key,identity_hash,period_month));
 create table venue_maps(id uuid primary key,organization_id uuid,event_id uuid references events(id) on delete cascade);create table venue_map_elements(id uuid primary key,map_id uuid references venue_maps(id) on delete cascade,status text,x numeric);create table access_points(id uuid primary key,organization_id uuid,event_id uuid,zone_id uuid);create table event_zones(id uuid primary key,event_id uuid,kind text);
 create table checkin_records(id uuid default gen_random_uuid(),organization_id uuid,event_id uuid,registration_id uuid,access_point_id uuid,result text,scanned_by uuid);
 create function has_event_staff_scope(uuid,uuid,text) returns boolean language sql as $$select exists(select 1 from public.events e join public.memberships m on m.organization_id=e.organization_id where e.id=$1 and m.user_id=auth.uid())$$;
 create table platform_user_controls(user_id uuid,suspended_at timestamptz);
 create table people(id uuid primary key default gen_random_uuid(),organization_id uuid,email text,first_name text,unique(organization_id,email));create table event_participations(id uuid primary key,event_id uuid,person_id uuid,program_id uuid);create table program_registration_orders(id uuid primary key,program_id uuid,person_id uuid);create table program_events(program_id uuid,event_id uuid);
 create table event_programs(id uuid primary key,organization_id uuid,name text);
 create table program_registration_items(id uuid primary key,program_id uuid,source_event_id uuid,parent_item_id uuid,name text,active boolean default true,is_public boolean default true);
 create table program_registration_order_items(item_id uuid);create table participation_passes(pass_id uuid);create table program_registration_entitlements(item_id uuid,event_id uuid,session_id uuid,zone_id uuid);create table pass_entitlements(pass_id uuid,event_id uuid,session_id uuid,zone_id uuid);
 create table event_sessions(id uuid primary key,event_id uuid,organization_id uuid,name text,status text default 'scheduled',capacity int);create table event_ticket_categories(id uuid,event_id uuid,organization_id uuid,published boolean,sales_start timestamptz,sales_end timestamptz,capacity int,price numeric,currency text,name text,benefits text[]);
 create table session_reservations(id uuid primary key default gen_random_uuid(),organization_id uuid,event_id uuid,session_id uuid,registration_id uuid,participation_id uuid,status text,checked_in_at timestamptz);
 create function event_session_reserved_count(uuid) returns int language sql stable security definer set search_path=public as $$select count(*)::int from session_reservations where session_id=$1 and status in('confirmed','checked_in')$$;
 create table seats(id uuid,event_id uuid,status text,reservation_category_id uuid,price numeric,seat_number text);create table seat_reservation_categories(event_id uuid,reserved_capacity int,is_active boolean);
 alter table events add column start_date timestamptz,add column description text,add column payment_timeout_days int,add column created_by uuid;
 alter table registrations add column ticket_category_id uuid,add column seat_id uuid,add column payment_deadline timestamptz;
 create function get_public_forum_agenda(p_event_id uuid) returns jsonb language sql stable security definer as $$select jsonb_build_object('event_id',p_event_id)$$;
 create function get_public_event_session_catalog(p_event_id uuid) returns table(id uuid) language sql stable security definer as $$select p_event_id$$;
 create function get_public_program_registration_catalog(p_program_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name)),'[]') from public.program_events pe join public.events e on e.id=pe.event_id where pe.program_id=p_program_id and e.status='published'),'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name)),'[]') from public.program_registration_items i where i.program_id=p_program_id and i.active and i.is_public))$$;
 create function get_public_program_agenda(p_program_id uuid default null,p_event_id uuid default null,p_event_only boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$declare p public.event_programs;begin select * into p from public.event_programs where id=p_program_id;return jsonb_build_object('events',(select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'name',ev.name)),'[]') from public.program_events pe join public.events ev on ev.id=pe.event_id where pe.program_id=p.id and ev.organization_id=p.organization_id and ev.status='published'));end$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 insert into organizations(id) values('${ids.org}'),('${ids.foreignOrg}');insert into auth.users values('${ids.owner}','owner@example.invalid'),('${ids.other}','other@example.invalid'),('${ids.inviter}','inviter@example.invalid');
 insert into memberships values('${ids.org}','${ids.staff}','staff'),('${ids.org}','${ids.owner}','owner'),('${ids.foreignOrg}','${ids.other}','owner');insert into commercial_contracts(organization_id) values('${ids.org}');
 insert into events(id,organization_id,name,event_type) values('${ids.event}','${ids.org}','QA Expo','exhibition'),('${ids.social}','${ids.org}','QA Boda','social');
 insert into event_zones values('${ids.vipPoint}','${ids.event}','vip');insert into access_points values('${ids.point}','${ids.org}','${ids.event}',null),('${ids.vipPoint}','${ids.org}','${ids.event}','${ids.vipPoint}');`)
 const commercial = await readFile(new URL('../infra/supabase/migrations/20261014144953_commercial_readiness.sql', import.meta.url), 'utf8')
 await sql(commercial.slice(commercial.indexOf('create or replace function commercial_private.check_write()'), commercial.indexOf('create or replace function public.enforce_event_limit()')))
 await sql(commercial.slice(commercial.indexOf('create or replace function public.enforce_registration_limit()'), commercial.indexOf('drop trigger if exists trg_participation_commercial_limit')))
 await sql('create trigger quota before insert on registrations for each row execute function enforce_registration_limit();')
 const checkout = await readFile(new URL('../infra/supabase/migrations/20261005193000_standalone_workshop_sessions.sql', import.meta.url), 'utf8')
 await sql(checkout.slice(checkout.indexOf('create or replace function public.capture_registration_purchase()'), checkout.indexOf('create or replace function public.sync_registration_session_reservations()')))
 await sql('create trigger capture_registration_purchase before insert or update on registrations for each row execute function capture_registration_purchase();')
 await sql(checkout.slice(checkout.indexOf('create or replace function public.sync_registration_session_reservations()'), checkout.indexOf('create or replace function public.register_event_session_purchase(')))
 const migration = await readFile(new URL('../infra/supabase/migrations/20261016100223_private_invitations_social_operations.sql', import.meta.url), 'utf8')
 await sql(migration);await sql(migration)
 const mixed=await readFile(new URL('../infra/supabase/migrations/20261016104831_invitation_mixed_program_visibility.sql',import.meta.url),'utf8');await sql(mixed);await sql(mixed)
 const historicalPerson=randomUUID(),historicA=randomUUID(),historicB=randomUUID();await sql(`insert into event_programs values('${historicA}','${ids.org}','Histórico A'),('${historicB}','${ids.org}','Histórico B');insert into people(id,organization_id,email,first_name) values('${historicalPerson}','${ids.org}','shared@example.invalid','Perfil histórico');insert into event_participations(id,person_id,program_id) values(gen_random_uuid(),'${historicalPerson}','${historicA}'),(gen_random_uuid(),'${historicalPerson}','${historicB}');`)
 const profiles=await readFile(new URL('../infra/supabase/migrations/20261016112244_event_profiles_configuration_isolation.sql',import.meta.url),'utf8');await sql(profiles);await sql(profiles)
 await test('legacy shared identities split by program without rewriting another profile',async()=>{
  const rows=await sql(`select jsonb_agg(jsonb_build_object('person_id',ep.person_id,'program_id',ep.program_id)) from event_participations ep where ep.program_id in('${historicA}','${historicB}');`);assert.notEqual(rows[0].person_id,rows[1].person_id)
  await sql(`update people set first_name='Actualizado A' where registration_program_id='${historicA}';`)
  assert.equal(await sql(`select to_jsonb(first_name) from people where registration_program_id='${historicB}';`),'Perfil histórico')
  assert.equal(await sql(`select to_jsonb(count(*)) from people where registration_program_id in('${historicA}','${historicB}');`),2)
  await assert.rejects(sql(`update people set registration_program_id='${historicB}' where registration_program_id='${historicA}';`),/ámbito del perfil/)
  await assert.rejects(sql(`insert into event_participations(id,person_id,program_id) values(gen_random_uuid(),'${rows[0].person_id}','${rows[1].program_id}');`),/otro programa/)
 })
 await test('configuration rejects staff even through definer RPCs; owner retains access',async()=>{
  await assert.rejects(sql(`${auth(ids.staff)}update events set name='Intrusión' where id='${ids.event}';`),/Solo propietarios/)
  await sql(`create function qa_config_bypass(e uuid) returns void language sql security definer as $$update events set name='RPC intrusión' where id=e$$;`)
  await assert.rejects(sql(`${auth(ids.staff)}select qa_config_bypass('${ids.event}');`),/Solo propietarios/)
  await sql(`${auth()}update events set name='QA Expo' where id='${ids.event}';`)
  const seat=randomUUID();await sql(`${auth()}insert into seats(id,event_id,price,status) values('${seat}','${ids.event}',10,'available');`)
  await assert.rejects(sql(`${auth(ids.staff)}update seats set price=0 where id='${seat}';`),/Solo propietarios/)
  await sql(`${auth(ids.staff)}update seats set status='reserved' where id='${seat}';`)
  const map=randomUUID();await sql(`${auth()}insert into venue_maps values('${map}','${ids.org}','${ids.event}');insert into venue_map_elements values(gen_random_uuid(),'${map}','available',1);`)
  await assert.rejects(sql(`${auth(ids.staff)}delete from venue_maps where id='${map}';`),/Solo propietarios/)
  await sql(`${auth()}delete from venue_maps where id='${map}';`)
 })
 await test('professional modules and event selectors remain isolated by default',async()=>{
  const w=await sql(`${auth()}select get_event_operations('${ids.event}');`);assert.equal(w.event.config.guest_management,false);assert.equal(w.components.length,0)
  await assert.rejects(cmd('table',{name:'Fuera de contexto',capacity:5}),/Habilita grupos/)
  await assert.rejects(sql(`${auth()}update events set config=config||'{"event_subtype":"wedding"}'::jsonb where id='${ids.event}';`),/subtipo/)
  await sql(`${auth()}update events set config=config||'{"event_subtype":"wedding","event_purpose":"private"}'::jsonb where id='${ids.social}';`)
 })
 await cmd('settings', { capacity_policy: 'redeem', inviter_identity: false })
 let allocation, code, second, household, member, table
 await test('professional groups require explicit per-event activation and retain professional access',async()=>{
  const event=randomUUID();await sql(`${auth()}insert into events(id,organization_id,name,event_type,config) values('${event}','${ids.org}','Cena corporativa','forum','{"registration_mode":"invitation","event_subtype":"networking","event_purpose":"fundraising","guest_management":true}');`)
  await cmd('settings',{capacity_policy:'redeem'},event);await cmd('household',{name:'Delegación',contact_name:'Coordinación',quantity:2},event)
  const w=await sql(`${auth()}select get_event_operations('${event}');`);assert.equal(w.event.config.guest_management,true);assert.deepEqual(w.allocations[0].rights,['forum']);assert.equal(w.components.length,0)
 })
 await test('explicit rules, allocations and controlled issue', async () => {
  allocation = await cmd('allocation', { name: 'Expositor QA', kind: 'exhibitor', quantity: 4, rights: ['exhibition'], distributor_email: 'inviter@example.invalid', origin: 'Stand 9 m2, beneficio aprobado' })
  const batch = await cmd('issue', { allocation_id: allocation.id, quantity: 2 }, ids.event, ids.inviter);code = batch.codes[0];second = batch.codes[1]
  await assert.rejects(cmd('issue', { allocation_id: allocation.id, quantity: 9 }), /supera/)
  await assert.rejects(cmd('settings', { capacity_policy: 'issue' }), /fijada/)
 })
 const request = 'a'.repeat(64)
 const redeem = (c, req = request, email = 'guest@example.invalid') => sql(`select redeem_event_invitation('${ids.event}','${c}','${req}','Invitado','QA','${email}','');`)
 await test('concurrent one-use redemption and private idempotent retry', async () => {
  const race = await Promise.allSettled([redeem(code.code), redeem(code.code, 'b'.repeat(64), 'otherguest@example.invalid')]);assert.equal(race.filter(x => x.status === 'fulfilled').length, 1)
  const winner = race[0].status === 'fulfilled' ? request : 'b'.repeat(64); const first = race.find(x => x.status === 'fulfilled').value
  assert.equal((await redeem(code.code, winner)).registration_id, first.registration_id)
  await assert.rejects(redeem(code.code, 'c'.repeat(64)), /no disponible/)
  assert.equal(await sql(`select to_jsonb(count(*)) from registrations where event_id='${ids.event}';`), 1)
 })
 await test('cross tenant denial and inviter minimization', async () => {
  await assert.rejects(cmd('allocation', { name: 'Ajeno', kind: 'organizer', quantity: 1, rights: ['vip'] }, ids.event, ids.other), /No autorizado/)
  const own = await sql(`${auth(ids.inviter)}select get_event_operations('${ids.event}');`);assert.equal(own.manager, false);assert.equal(own.budget, undefined);assert.equal(own.invitations.find(i => i.state === 'redeemed').participant_name, null)
  assert.equal(await sql(`${auth(ids.other)}set role authenticated;select to_jsonb(count(*)) from event_private_invitations;`), 0)
  await assert.rejects(sql(`${auth()}set role authenticated;insert into event_invitation_allocations(organization_id,event_id,name,kind,quantity,rights) values('${ids.org}','${ids.event}','Bypass','organizer',1,array['vip']);`), /permission denied/)
  await assert.rejects(cmd('transfer', { id: second.id, target_allocation_id: allocation.id, reason: 'No autorizado' }, ids.event, ids.inviter), /No autorizado/)
  await sql(`insert into platform_user_controls values('${ids.inviter}',now());`);await assert.rejects(sql(`${auth(ids.inviter)}select get_event_operations('${ids.event}');`), /No autorizado/);await sql('delete from platform_user_controls;')
 })
 await test('transfer revokes original and preserves audit trail', async () => {
  const moved = await cmd('transfer', { id: second.id, target_allocation_id: allocation.id, reason: 'Cambio de responsable' });await assert.rejects(redeem(second.code), /no disponible/);assert.ok(moved.codes[0].code)
 })
 await test('contract failure rolls back code and participant quota', async () => {
  const c = (await cmd('issue', { allocation_id: allocation.id, quantity: 1 })).codes[0];await sql(`update commercial_contracts set active=false;`)
  await assert.rejects(redeem(c.code, request, 'rollback@example.invalid'), /Contrato vencido/)
  assert.equal(await sql(`select to_jsonb(state) from event_private_invitations where id='${c.id}';`), 'available');await sql('update commercial_contracts set active=true;')
 })
 await test('differentiated access, cancellation and duplicate check-in', async () => {
  const token = await sql(`select to_jsonb(credential_token) from registrations where event_id='${ids.event}' limit 1;`)
  const check = point => sql(`${auth()}select validate_invitation_checkin('${token}','${point}');`)
  assert.equal((await check(ids.vipPoint)).result, 'denied');assert.equal((await check(ids.point)).result, 'allowed');assert.equal((await check(ids.point)).result, 'duplicate')
 })
 await cmd('settings', { capacity_policy: 'issue', inviter_identity: false }, ids.social)
 await test('household capped slots, people without email and RSVP', async () => {
  household = await cmd('household', { name: 'Familia QA', contact_name: 'Representante', quantity: 2 }, ids.social)
  member = await cmd('member', { household_id: household.id, first_name: 'Ana' }, ids.social)
  const companion = await cmd('member', { household_id: household.id, first_name: 'Acompañante' }, ids.social)
  await assert.rejects(cmd('member', { household_id: household.id, first_name: 'Tercero' }, ids.social), /sin plazas/)
  const respond = id => sql(`select social_household_access('${ids.social}','${household.code}','${id}','accepted');`)
  await respond(member.id);await respond(companion.id);assert.equal(await sql(`select to_jsonb(count(*)) from registrations where event_id='${ids.social}' and email is null;`), 2)
 })
 await test('table capacity with concurrent planners', async () => {
  table = await cmd('table', { name: 'Mesa 1', capacity: 1 }, ids.social)
  const members = await sql(`select jsonb_agg(id) from event_social_members where event_id='${ids.social}';`)
  const race = await Promise.allSettled(members.map(id => cmd('assign_table', { member_id: id, table_id: table.id }, ids.social)));assert.equal(race.filter(x => x.status === 'fulfilled').length, 1)
 })
 await test('decline cancels credential and cannot silently reuse code', async () => {
  await sql(`select social_household_access('${ids.social}','${household.code}','${member.id}','declined');`)
  await assert.rejects(sql(`select social_household_access('${ids.social}','${household.code}','${member.id}','accepted');`), /planner/)
  await cmd('resume_member', { member_id: member.id }, ids.social)
  const state = await sql(`select social_household_access('${ids.social}','${household.code}');`);assert.equal(state.members.find(x => x.id === member.id).rsvp, 'accepted')
 })
 await test('private events hidden through RLS and SECURITY DEFINER public APIs', async () => {
  assert.equal(await sql(`select set_config('request.jwt.claim.sub','',false);select get_public_forum_agenda('${ids.social}');`), null)
  assert.equal(await sql(`select set_config('request.jwt.claim.sub','',false);select to_jsonb(count(*)) from get_public_event_session_catalog('${ids.social}');`), 0)
  assert.equal((await sql(`${auth()}select get_public_forum_agenda('${ids.social}');`)).event_id, ids.social)
 })
 await test('mixed programs retain public events and omit private components',async()=>{
  const p=randomUUID(),pub=randomUUID(),priv=randomUUID();await sql(`insert into event_programs values('${p}','${ids.org}','Programa mixto');insert into program_events values('${p}','${ids.event}'),('${p}','${ids.social}');insert into program_registration_items(id,program_id,source_event_id,name) values('${pub}','${p}','${ids.event}','Componente público'),('${priv}','${p}','${ids.social}','Componente privado');`)
  const catalog=await sql(`${auth('')}select get_public_program_registration_catalog('${p}');`);assert.equal(catalog.events.length,1);assert.equal(catalog.events[0].id,ids.event);assert.equal(catalog.items.length,1);assert.equal(catalog.items[0].id,pub)
  const agenda=await sql(`${auth('')}select get_public_program_agenda('${p}');`);assert.equal(agenda.events.length,1);assert.equal(agenda.events[0].id,ids.event)
 })
 await test('benefit revisions do not rewrite approved allocations', async () => {
  const rule = await cmd('benefit', { name: 'Patrocinio Oro', kind: 'sponsor', quantity: 5, rights: ['vip'] })
  const assigned = await cmd('allocation', { name: 'Sponsor Oro QA', kind: 'sponsor', benefit_id: rule.id, quantity: 1, rights: ['forum'] })
  await cmd('benefit', { name: 'Patrocinio Oro', kind: 'sponsor', quantity: 10, rights: ['forum'] })
  const old = await sql(`select to_jsonb(a) from event_invitation_allocations a where id='${assigned.id}';`);assert.equal(old.quantity, 5);assert.deepEqual(old.rights, ['vip']);assert.equal(old.benefit_revision, 1)
 })
 await test('production dependencies, revisions and organizer FX ledger', async () => {
  const task = await cmd('task', { title: 'Montaje', responsible: 'Equipo', status: 'open' })
  await assert.rejects(cmd('task', { title: 'Abrir', status: 'done', dependency_id: task.id }), /dependencia/)
  await cmd('task', { id: task.id, title: 'Montaje', status: 'done', revision: 1 });await assert.rejects(cmd('task', { id: task.id, title: 'Perdido', status: 'open', revision: 1 }), /cambió/)
  const key = randomUUID(), item = { title: 'Catering v1', kind: 'expense', stage: 'committed', amount: 10000, currency: 'VES', ves_per_usd: 100, rate_source: 'Tasa acordada QA', rate_date: '2026-10-16', request_key: key }
  const b = await cmd('budget', item);assert.equal((await cmd('budget', item)).id, b.id)
  await assert.rejects(cmd('budget', { ...item, amount: 999 }), /partida distinta/)
  const workspace = await sql(`${auth()}select get_event_operations('${ids.event}');`);assert.equal(Number(workspace.budget[0].usd), 100)
  await cmd('review', { segment: 'social', title: 'Revisar RSVP', category: 'rule', status: 'pending' })
 })
 await test('linked event and session capacities include issued invitations', async () => {
  const parent=randomUUID(),child=randomUUID(),session=randomUUID(),point=randomUUID();await sql(`insert into events(id,organization_id,name,event_type,total_slots) values('${parent}','${ids.org}','Sesiones QA','exhibition',5),('${child}','${ids.org}','Foro vinculado QA','forum',1);insert into event_sessions(id,event_id,organization_id,name,capacity) values('${session}','${child}','${ids.org}','Conferencia QA',1);insert into access_points values('${point}','${ids.org}','${child}',null);`)
  await cmd('settings',{capacity_policy:'issue'},parent)
  await assert.rejects(cmd('allocation',{name:'Sin programa',kind:'organizer',quantity:1,rights:['forum'],access_event_ids:[child]},parent),/mismo programa/)
  const program=randomUUID();await sql(`${auth()}insert into event_programs values('${program}','${ids.org}','Programa combinado');insert into program_events values('${program}','${parent}'),('${program}','${child}');`)
  await assert.rejects(sql(`${auth(ids.staff)}delete from program_events where program_id='${program}';`),/Solo propietarios/)
  const a=await cmd('allocation',{name:'Pase combinado',kind:'organizer',quantity:2,rights:['exhibition','forum'],access_event_ids:[child],session_ids:[session]},parent)
  await assert.rejects(cmd('issue',{allocation_id:a.id,quantity:2},parent),/Aforo agotado|sesión/)
  const issued=(await cmd('issue',{allocation_id:a.id,quantity:1},parent)).codes[0]
  assert.equal(await sql(`select to_jsonb(event_session_reserved_count('${session}'));`),1)
  await assert.rejects(sql(`insert into session_reservations(session_id,status) values('${session}','confirmed');`),/sesión/)
  const r=await sql(`select redeem_event_invitation('${parent}','${issued.code}','${'e'.repeat(64)}','Combinado','QA','combined@example.invalid','');`)
  assert.equal(await sql(`select to_jsonb(event_session_reserved_count('${session}'));`),1)
  assert.equal((await sql(`${auth()}select validate_invitation_checkin('${r.credential_token}','${point}','${session}');`)).result,'allowed')
  await assert.rejects(sql(`${auth()}insert into registrations(organization_id,event_id,first_name,email) values('${ids.org}','${child}','Sin aforo','no-space@example.invalid');`),/aforo/)
 })
 await test('unlinked program immediately denies combined credentials and new redemptions',async()=>{
  const p=randomUUID(),child=randomUUID(),point=randomUUID();await sql(`insert into events(id,organization_id,name,event_type) values('${child}','${ids.org}','Componente aislado','forum');insert into event_programs values('${p}','${ids.org}','Vínculo explícito');insert into program_events values('${p}','${ids.event}'),('${p}','${child}');insert into access_points values('${point}','${ids.org}','${child}',null);`)
  const a=await cmd('allocation',{name:'Vínculo temporal',kind:'organizer',quantity:2,rights:['exhibition','forum'],access_event_ids:[child]});const batch=await cmd('issue',{allocation_id:a.id,quantity:2});const r=await redeem(batch.codes[0].code,'d'.repeat(64),'linked@example.invalid');
  await sql(`${auth()}delete from program_events where program_id='${p}' and event_id='${child}';`)
  assert.equal((await sql(`${auth()}select validate_invitation_checkin('${r.credential_token}','${point}');`)).result,'denied')
  await assert.rejects(redeem(batch.codes[1].code,'f'.repeat(64),'unlinked@example.invalid'),/ya no pertenece/)
 })
 await test('synthetic demo seeding and guarded reset',async()=>{
  const demo=randomUUID();await sql(`insert into events(id,organization_id,name,event_type) values('${demo}','${ids.org}','DEMO QA','social');`);await cmd('settings',{capacity_policy:'redeem'},demo);const seeded=await cmd('seed_demo',{},demo);assert.equal(seeded.codes[0].mode,'hogar');await cmd('reset_demo',{confirmation:'DEMO QA'},demo);assert.equal(await sql(`select to_jsonb(count(*)) from event_social_members where event_id='${demo}';`),0);await assert.rejects(cmd('reset_demo',{confirmation:'Otro nombre'},demo),/nombre exacto/)
 })
 await test('public and program registration bypasses stay closed',async()=>{
  await assert.rejects(sql(`${auth('')}insert into registrations(organization_id,event_id,first_name,email) values('${ids.org}','${ids.event}','Bypass','bypass@example.invalid');`),/invitación/)
  await assert.rejects(sql(`${auth('')}insert into event_participations(id,event_id) values(gen_random_uuid(),'${ids.event}');`),/invitación/)
  const item=randomUUID();await sql(`insert into program_registration_entitlements(item_id,event_id) values('${item}','${ids.event}');`);await assert.rejects(sql(`${auth('')}insert into program_registration_order_items(item_id) values('${item}');`),/invitación/)
 })
 if (process.argv.includes('--ui')) {
  const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');const { chromium } = await import('../frontend/node_modules/@playwright/test/index.mjs')
  const root = fileURLToPath(new URL('../frontend/', import.meta.url)), fixture = root + '.operations-qa.tsx';let server, browser
  const html = '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/.operations-qa.tsx"></script></body></html>'
  try {
   await writeFile(fixture, `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';import EventOperations from './src/pages/admin/EventOperations';import PrivateInvitation from './src/pages/PrivateInvitation';import {EventForm} from './src/pages/admin/EventosAdmin';import './src/index.css';createRoot(document.getElementById('root')!).render(<BrowserRouter><Routes><Route path="/admin/qa/crear" element={<EventForm orgId="${ids.org}" userId="${ids.owner}" event={null} onClose={()=>{}} onSaved={()=>{document.title='Evento guardado'}}/>}/><Route path="/admin/eventos/:eventId/operaciones" element={<EventOperations/>}/><Route path="/portal/invitaciones/:eventId" element={<EventOperations/>}/><Route path="/invitacion/:eventId/:mode" element={<PrivateInvitation/>}/></Routes></BrowserRouter>);`)
   server = await createServer({ root, define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://eventops-qa.supabase.co'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('qa-public'), 'import.meta.env.VITE_API_URL': JSON.stringify('https://eventops-worker.invalid') }, server: { host: '127.0.0.1', port: 4186, strictPort: true, hmr: false } });await server.listen();browser = await chromium.launch({ channel: 'chrome', headless: true });const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });let actor = ids.owner
   const literal = value => value == null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'"
   await context.route('https://eventops-qa.supabase.co/**', async route => {
    try {
     const name = new URL(route.request().url()).pathname.split('/').at(-1), b = route.request().postDataJSON();let value
     if (name === 'events' && route.request().method() === 'POST') { const payload=Array.isArray(b)?b[0]:b;value=await sql(`${auth(actor)}with inserted as(insert into events select * from jsonb_populate_record(null::events,${literal(JSON.stringify({...payload,id:randomUUID()}))}::jsonb) returning *) select to_jsonb(inserted) from inserted;`) }
     else if (name === 'get_event_operations') value = await sql(`${auth(actor)}set role authenticated;select get_event_operations(${literal(b.p_event)});`)
     else if (name === 'event_operations_command') value = await cmd(b.p_action, b.p_data, b.p_event, actor)
     else throw Error('Unexpected RPC ' + name)
     await route.fulfill({ json: value })
    } catch (e) { await route.fulfill({ status: 400, json: { message: e.message } }) }
   })
   await context.route('https://eventops-worker.invalid/**', async route => {
    const b = route.request().postDataJSON(), name = new URL(route.request().url()).pathname.split('/').at(-1)
    try {
     const call = name === 'redeem' ? `redeem_event_invitation(${[b.event_id,b.code,b.request,b.first_name,b.last_name,b.email,b.phone].map(literal).join(',')})` : `social_household_access(${[b.event_id,b.code,b.member_id,b.response,b.first_name,b.last_name].map(literal).join(',')})`
     const value = await sql(`${auth('')}select ${call};`);await route.fulfill({ json: value })
    } catch (e) { await route.fulfill({ status: 400, json: { error: e.message } }) }
   })
   await context.route('http://127.0.0.1:4186/**', async route => { const path = new URL(route.request().url()).pathname;if (/^\/(admin|portal|invitacion)\//.test(path)) return route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml(path, html) });return route.continue() })
   const page = await context.newPage(), errors = [];page.on('pageerror', e => errors.push(e.message))
   const form = title => page.locator('form').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
   await test('browser creates a wedding and keeps professional subtypes separate',async()=>{
    await page.goto('http://127.0.0.1:4186/admin/qa/crear');await page.getByRole('combobox',{name:/^Tipo/}).selectOption('social');await page.getByLabel('Subtipo del evento').selectOption('wedding');await page.getByLabel('Nombre del evento').fill('Boda creada en navegador');await page.getByRole('button',{name:'Guardar evento',exact:true}).click();await page.waitForFunction(()=>document.title==='Evento guardado');
    const saved=await sql(`select config from events where name='Boda creada en navegador';`);assert.equal(saved.event_subtype,'wedding');assert.equal(saved.registration_mode,'invitation');assert.equal(saved.guest_management,true)
    await page.reload();await page.getByRole('combobox',{name:/^Tipo/}).selectOption('forum');assert.equal(await page.getByLabel('Subtipo del evento').locator('option[value="wedding"]').count(),0);await page.getByLabel('Subtipo del evento').selectOption('product_launch');await page.getByLabel('Finalidad').selectOption('fundraising');assert.equal(await page.getByLabel('Habilitar grupos').isChecked(),false)
   })
   await test('browser B2B issue, private registration and differentiated assignment', async () => {
    await page.goto(`http://127.0.0.1:4186/admin/eventos/${ids.event}/operaciones`);await page.getByRole('heading', { name: 'QA Expo', exact: true }).waitFor();assert.equal(await page.getByRole('button',{name:'Grupos y mesas',exact:true}).count(),0)
    const a = form('Nueva asignación');await a.getByLabel('Responsable / empresa').fill('Patrocinante UI');await a.getByLabel('Tipo', { exact: true }).selectOption('sponsor');await a.getByLabel('Cantidad aprobada').fill('2');await a.getByLabel('Origen: stand, paquete o acuerdo').fill('Patrocinio UI');await a.getByLabel('Exposición', { exact: true }).check();await a.getByLabel('Zona VIP', { exact: true }).check();await a.getByRole('button', { name: 'Guardar' }).click()
    const issue = form('Emitir códigos');await issue.getByLabel('Asignación', { exact: true }).selectOption({ label: 'Patrocinante UI' });await issue.getByLabel('Códigos del lote').fill('1');await issue.getByRole('button', { name: 'Guardar' }).click();const link = page.getByRole('link').filter({ hasText: `/invitacion/${ids.event}/registro#` }).last();await link.waitFor();const url = await link.getAttribute('href')
    const guest = await context.newPage();await guest.goto(url);await guest.getByLabel('Nombre', { exact: true }).fill('Invitado UI');await guest.getByLabel('Apellido', { exact: true }).fill('Prueba');await guest.getByLabel('Correo', { exact: true }).fill('browser@example.invalid');await guest.getByRole('button', { name: 'Confirmar registro' }).click();await guest.getByRole('heading', { name: 'Registro confirmado' }).waitFor();await guest.getByRole('link', { name: 'Abrir mi credencial' }).waitFor();await guest.close()
   })
   await test('browser household, RSVP without email and table assignment', async () => {
    await page.goto(`http://127.0.0.1:4186/admin/eventos/${ids.social}/operaciones`);await page.getByRole('button', { name: 'Grupos y mesas', exact: true }).click()
    const h = form('Crear hogar / grupo');await h.getByLabel('Nombre del hogar').fill('Hogar UI');await h.getByLabel('Representante', { exact: true }).fill('Contacto de prueba');await h.getByLabel('Plazas máximas').fill('2');await h.getByRole('button', { name: 'Guardar' }).click();const link = page.getByRole('link').filter({ hasText: `/invitacion/${ids.social}/hogar#` }).last();await link.waitFor();const url = await link.getAttribute('href')
    const m = form('Agregar integrante o plaza de acompañante');await m.getByLabel('Hogar', { exact: true }).selectOption({ label: 'Hogar UI' });await m.getByLabel('Nombre (puede').fill('María UI');await m.getByRole('button', { name: 'Guardar' }).click()
    const guest = await context.newPage();await guest.goto(url);await guest.getByRole('button', { name: 'Ver mi grupo' }).click();await guest.getByRole('button', { name: 'Guardar respuesta' }).click();await guest.getByRole('link', { name: 'Ver credencial' }).waitFor();await guest.close()
    await page.reload();await page.getByRole('button', { name: 'Grupos y mesas', exact: true }).click();const t = form('Crear mesa');await t.getByLabel('Nombre o número').fill('Mesa UI');await t.getByLabel('Capacidad', { exact: true }).fill('1');await t.getByRole('button', { name: 'Guardar' }).click()
    const assign = form('Asignar mesa a invitado confirmado');await assign.getByLabel('Integrante', { exact: true }).selectOption({ label: 'María UI' });await assign.getByLabel('Mesa (vacío').selectOption({ label: 'Mesa UI' });await assign.getByRole('button', { name: 'Guardar' }).click();await page.getByText('Mesa UI: 1/1', { exact: false }).first().waitFor()
   })
   await test('browser organizer budget and production provider isolation', async () => {
    await page.getByRole('button', { name: 'Presupuesto', exact: true }).click();const b = form('Agregar partida');for (const [label, value] of [['Concepto / versión', 'Catering UI'], ['Importe original', '5000'], ['Bs por USD', '100'], ['Fuente / referencia', 'Acuerdo UI'], ['Fecha de la tasa', '2026-10-16']]) await b.getByLabel(label, { exact: false }).fill(value)
    await b.getByLabel('Tipo', { exact: true }).selectOption('expense');await b.getByLabel('Etapa', { exact: true }).selectOption('paid');await b.getByLabel('Moneda', { exact: true }).selectOption('VES');await b.getByRole('button', { name: 'Guardar' }).click();await page.getByText('Flujo de caja pagado: $-50.00 USD', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Producción', exact: true }).click();const t = form('Nueva tarea de producción');await t.getByLabel('Tarea', { exact: true }).fill('Montaje UI');await t.getByLabel('Responsable', { exact: true }).fill('Proveedor UI');await t.getByLabel('Correo de cuenta').fill('inviter@example.invalid');await t.getByRole('button', { name: 'Guardar' }).click();await page.getByRole('heading', { name: 'Montaje UI', exact: true }).waitFor()
    actor = ids.inviter;await page.goto(`http://127.0.0.1:4186/portal/invitaciones/${ids.social}`);await page.getByRole('button', { name: 'Mis tareas', exact: true }).click();assert.equal(await page.getByRole('button', { name: 'Presupuesto', exact: true }).count(), 0);await page.getByLabel('Estado de Montaje UI', { exact: true }).selectOption('doing');await page.getByRole('status').filter({ hasText: 'Cambios guardados' }).waitFor();actor = ids.owner
   })
   await page.goto(`http://127.0.0.1:4186/admin/eventos/${ids.social}/operaciones`);await page.getByRole('button', { name: 'Grupos y mesas', exact: true }).click();await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });await page.screenshot({ path: fileURLToPath(new URL('../artifacts/event-operations-desktop.png', import.meta.url)), fullPage: true });await page.setViewportSize({ width: 390, height: 844 });await page.screenshot({ path: fileURLToPath(new URL('../artifacts/event-operations-mobile.png', import.meta.url)), fullPage: true });assert.deepEqual(errors, [])
  } finally { await browser?.close();await server?.close();await unlink(fixture).catch(() => {}) }
 }
 const version = await sql('select to_jsonb(version());');await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });await writeFile(new URL('../artifacts/event-operations-results.json', import.meta.url), JSON.stringify({ version, production: false, tests: results }, null, 2));console.log(version)
} finally { await command(['stop', '--time', '5', container], null, 15000).catch(() => {}) }
