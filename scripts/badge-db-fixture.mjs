import {readFile} from 'node:fs/promises';
import {PGlite} from '../infra/node_modules/@electric-sql/pglite/dist/index.js';
export const org='00000000-0000-4000-8000-000000000001', otherOrg='00000000-0000-4000-8000-000000000002';
export const user='00000000-0000-4000-8000-000000000003', event='00000000-0000-4000-8000-000000000010', otherEvent='00000000-0000-4000-8000-000000000011';
export const registration='00000000-0000-4000-8000-000000000020', template='00000000-0000-4000-8000-000000000030';
export const station='00000000-0000-4000-8000-000000000040';
export const otherStation='00000000-0000-4000-8000-000000000041';
export async function badgeFixture(){
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create schema auth; create schema extensions;create schema storage;create type public.member_role as enum('owner','admin','staff');
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
create function public.is_org_member(uuid) returns boolean language sql as $$select $1='${org}'::uuid$$;
create function public.is_platform_admin() returns boolean language sql as $$select false$$;
create function public.has_event_staff_scope(uuid,uuid,text) returns boolean language sql as $$select $1='${event}'::uuid and coalesce(current_setting('qa.scope',true),'true')='true'$$;
-- Only the random-byte primitive is substituted; authorization and printing functions are deployed SQL.
create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(left(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),$1*2),'hex')$$;
create function public.has_org_role(uuid,member_role[]) returns boolean language sql as $$select $1='${org}'::uuid and coalesce(current_setting('qa.admin',true),'true')='true'$$;
create function extensions.digest(text,text) returns bytea language sql as $$select decode(md5($1)||md5($1),'hex')$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create table organizations(id uuid primary key);
create table events(id uuid primary key,organization_id uuid references organizations);
create table event_programs(id uuid primary key,organization_id uuid);
create table people(id uuid primary key,first_name text,last_name text,cedula text,company text,job_title text,updated_at timestamptz);
create table seats(id uuid primary key,seat_number text,row_label text,column_number integer);
create table registrations(id uuid primary key default gen_random_uuid(),organization_id uuid,event_id uuid,first_name text,last_name text,email text,phone text,cedula text,company text,job_title text,participation_type text default 'attendee',registration_source text,status text default 'confirmed',attendance_status text default 'no_attendance',credential_token text default replace(gen_random_uuid()::text,'-',''),badge_cancelled_at timestamptz,badge_cancelled_reason text,payment_confirmed_at timestamptz,updated_at timestamptz,seat_id uuid);
create table event_participations(id uuid primary key,program_id uuid,event_id uuid,person_id uuid,status text,credential_token text,participation_type text,badge_cancelled_at timestamptz,badge_cancelled_reason text);
create table program_registration_orders(id uuid,participation_id uuid,status text);
create table program_registration_order_items(order_id uuid,item_id uuid);
create table program_registration_entitlements(item_id uuid,event_id uuid,session_id uuid,zone_id uuid);
create table event_sessions(id uuid,event_id uuid); create table event_zones(id uuid,event_id uuid);
create table checkin_records(id uuid default gen_random_uuid(),organization_id uuid,participation_id uuid,registration_id uuid,event_id uuid,result text,scanned_by uuid,device_label text);
create table badge_templates(id uuid primary key,event_id uuid,organization_id uuid,participation_type text,active boolean default true,size_key text,primary_color text);
create table badge_identity_audit(id uuid default gen_random_uuid(),organization_id uuid,event_id uuid,registration_id uuid,participation_id uuid,previous_data jsonb,new_data jsonb,changed_by uuid);
create table badge_print_logs(id uuid default gen_random_uuid(),organization_id uuid,event_id uuid,registration_id uuid,participation_id uuid,print_kind text,reason text,printed_by uuid,device_label text,created_at timestamptz default now());
create table accreditation_service_sessions(id uuid primary key default gen_random_uuid(),organization_id uuid,event_id uuid,registration_id uuid,participation_id uuid,outcome text,duration_ms integer,failure_reason text,operator_id uuid,device_label text,created_at timestamptz default now());
insert into organizations values('${org}'),('${otherOrg}');
insert into events values('${event}','${org}'),('${otherEvent}','${otherOrg}');
insert into auth.users(id,email) values('${user}','qa@example.test');
insert into registrations(id,organization_id,event_id,first_name,credential_token) values('${registration}','${org}','${event}','QA','original-token');
insert into badge_templates(id,event_id,organization_id,participation_type) values('${template}','${event}','${org}','attendee');
`);
const migration=async name=>readFile(new URL(`../infra/supabase/migrations/${name}`,import.meta.url),'utf8');
await db.exec((await migration('20261007170000_badge_studio_print_queue.sql')).split('create or replace function public.create_badge_print_job')[0]);
await db.exec((await migration('20261008100000_badge_phase1_operations.sql')).split('create or replace function public.prepare_badge_print_job')[0]);
await db.exec((await migration('20261008180000_badge_phase3_batch_operations.sql')).split('create or replace function public.list_event_badges_for_batch')[0]);



await db.exec(await migration('20261008150000_badge_studio_phase2.sql'));
await db.exec(await migration('20261014110132_badge_workflow_integrity.sql'));
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const one=async(sql,args=[]) => (await q(sql,args))[0];
return {db,q,one};
}
