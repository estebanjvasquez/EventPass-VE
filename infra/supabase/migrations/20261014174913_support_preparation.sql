-- Support is a distinct platform permission. No membership or financial grants.
create table if not exists public.platform_support_agents (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 granted_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.platform_support_agents enable row level security;
revoke all on public.platform_support_agents from public,anon,authenticated;
grant select on public.platform_support_agents to authenticated;
grant all on public.platform_support_agents to service_role;
drop policy if exists support_agents_read on public.platform_support_agents;
create policy support_agents_read on public.platform_support_agents for select to authenticated
 using(user_id=auth.uid() or public.is_platform_admin());

create or replace function public.is_support_operator() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid())
 and not exists(select 1 from public.platform_user_controls where user_id=auth.uid() and suspended_at is not null)
 and (public.is_platform_admin() or exists(select 1 from public.platform_support_agents where user_id=auth.uid() and enabled));
$$;
create or replace function public.admin_set_support_agent(p_user uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_enabled is null or not exists(select 1 from auth.users where id=p_user) then raise exception 'Usuario no válido'; end if;
 insert into public.platform_support_agents(user_id,enabled,granted_by) values(p_user,p_enabled,auth.uid())
 on conflict(user_id) do update set enabled=excluded.enabled,granted_by=excluded.granted_by,updated_at=now();
 insert into public.commercial_audit(actor_id,action,details) values(auth.uid(),'support_permission',jsonb_build_object('user_id',p_user,'enabled',p_enabled));
end $$;
create or replace function public.support_team() returns table(user_id uuid,email text) language sql stable security definer set search_path='' as $$
 select u.id,u.email::text from auth.users u
 where public.is_support_operator() and not exists(select 1 from public.platform_user_controls c where c.user_id=u.id and c.suspended_at is not null)
 and (exists(select 1 from public.platform_support_agents s where s.user_id=u.id and s.enabled)
 or exists(select 1 from public.platform_admins a where a.user_id=u.id)) order by u.email;
$$;
drop policy if exists support_read on public.support_tickets;
create policy support_read on public.support_tickets for select to authenticated
 using(public.is_org_member(organization_id) or public.is_platform_admin() or public.is_support_operator());

create table if not exists public.support_ticket_messages (
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,actor_identity jsonb not null,
 from_support boolean not null,body text not null check(length(body) between 2 and 5000),created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_ticket_messages(ticket_id,created_at);
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_ticket_messages from public,anon,authenticated;
grant select on public.support_ticket_messages to authenticated;
grant all on public.support_ticket_messages to service_role;
drop policy if exists support_messages_read on public.support_ticket_messages;
create policy support_messages_read on public.support_ticket_messages for select to authenticated using(exists(
 select 1 from public.support_tickets t where t.id=ticket_id and (public.is_org_member(t.organization_id) or public.is_support_operator())));
create or replace function public.support_reply(p_ticket uuid,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.support_tickets; v_id uuid; operator boolean:=public.is_support_operator();
begin
 select * into t from public.support_tickets where id=p_ticket for update;
 if auth.uid() is null or t.id is null or not(operator or public.is_org_member(t.organization_id)) then raise exception 'No autorizado' using errcode='42501'; end if;
 if length(trim(coalesce(p_body,''))) not between 2 and 5000 then raise exception 'Respuesta de 2 a 5000 caracteres'; end if;
 insert into public.support_ticket_messages(ticket_id,actor_id,actor_identity,from_support,body)
 values(t.id,auth.uid(),jsonb_build_object('user_id',auth.uid()),operator,trim(p_body)) returning id into v_id;
 update public.support_tickets set updated_at=now(),status=case when not operator and status='resolved' then 'open' else status end where id=t.id;
 return v_id;
end $$;
create or replace function public.support_update_ticket(p_ticket uuid,p_status text,p_assigned uuid,p_response text) returns void language plpgsql security definer set search_path='' as $$
declare t public.support_tickets;
begin
 if not public.is_support_operator() then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into t from public.support_tickets where id=p_ticket for update;
 if t.id is null or p_status is null or p_status not in('open','in_progress','resolved') then raise exception 'Ticket o estado no válido'; end if;
 if p_assigned is not null and not exists(select 1 from public.support_team() where user_id=p_assigned) then raise exception 'Responsable no disponible'; end if;
 if length(coalesce(p_response,''))>5000 then raise exception 'Respuesta demasiado larga'; end if;
 if p_status='resolved' and length(trim(coalesce(p_response,t.response_note,'')))<2 then raise exception 'Registra la solución antes de resolver'; end if;
 if length(trim(coalesce(p_response,'')))>0 and p_response is distinct from t.response_note then perform public.support_reply(t.id,p_response); end if;
 update public.support_tickets set status=p_status,assigned_to=p_assigned,response_note=coalesce(nullif(trim(p_response),''),response_note),updated_at=now() where id=t.id;
end $$;

create table if not exists public.event_preparations (
 event_id uuid primary key references public.events(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 scenario text not null default 'simple' check(scenario in('simple','forum','exhibition','program')),
 needs_printing boolean not null default true,checks jsonb not null default '{}',
 revision integer not null default 1,updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now()
);
alter table public.event_preparations add column if not exists configuration_fingerprint text;
create table if not exists public.event_preparation_acceptances (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,revision integer not null,
 actor_id uuid references auth.users(id) on delete set null,actor_identity jsonb not null,
 configuration_fingerprint text not null,snapshot jsonb not null,statement text not null,accepted_at timestamptz not null default now(),
 unique(event_id,revision,configuration_fingerprint)
);
do $$declare t text;begin foreach t in array array['event_preparations','event_preparation_acceptances'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('drop policy if exists preparation_read on public.%I',t);
 execute format('create policy preparation_read on public.%I for select to authenticated using(public.is_org_member(organization_id) or public.is_support_operator())',t);
end loop;end $$;

create or replace function commercial_private.preparation_steps(p_scenario text,p_print boolean) returns text[] language sql immutable set search_path='' as $$
 select array['registration','privacy','responsibles','contingency']::text[]
 || case p_scenario when 'forum' then array['agenda','access'] when 'exhibition' then array['exhibitors','consent'] when 'program' then array['program','access'] else '{}'::text[] end
 || case when p_print then array['connector','printer','batch','recovery'] else '{}'::text[] end;
$$;
-- Fingerprint includes event and event-scoped configuration, never participant records.
create or replace function commercial_private.preparation_fingerprint(p_event uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare payload text; t text; part text;
begin
 select (to_jsonb(e)-'updated_at'-'created_at')::text into payload from public.events e where id=p_event;
 foreach t in array array['event_ticket_categories','badge_templates','badge_print_profiles','access_points','agenda_items','event_sessions','event_stages','venue_maps','companies'] loop
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='event_id') then
   execute format('select coalesce(jsonb_agg(x order by x::text),''[]''::jsonb)::text from (select to_jsonb(r)-''updated_at''-''created_at'' as x from public.%I r where event_id=$1) q',t) into part using p_event;
   payload:=payload||t||part;
  end if;
 end loop;
 return md5(payload);
end $$;
create or replace function public.get_event_preparation(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events;p public.event_preparations; a public.event_preparation_acceptances; fingerprint text; scenario text;
begin
 select * into e from public.events where id=p_event;
 if e.id is null or not(public.is_org_member(e.organization_id) or public.is_support_operator()) then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into p from public.event_preparations where event_id=e.id;
 scenario:=coalesce(p.scenario,case when nullif(to_jsonb(e)->>'program_id','') is not null then 'program' when to_jsonb(e)->>'event_type'='forum' then 'forum' when to_jsonb(e)->>'event_type'='exhibition' then 'exhibition' else 'simple' end);
 fingerprint:=commercial_private.preparation_fingerprint(e.id);
 select * into a from public.event_preparation_acceptances where event_id=e.id order by accepted_at desc limit 1;
 return jsonb_build_object('event_id',e.id,'event_name',e.name,'organization_id',e.organization_id,
 'scenario',scenario,'needs_printing',coalesce(p.needs_printing,true),
 'checks',case when p.configuration_fingerprint is distinct from fingerprint then '{}'::jsonb else coalesce(p.checks,'{}') end,
 'configuration_changed',p.event_id is not null and p.configuration_fingerprint is distinct from fingerprint,
 'revision',coalesce(p.revision,0),'configuration_fingerprint',fingerprint,
 'required_steps',commercial_private.preparation_steps(scenario,coalesce(p.needs_printing,true)),
 'can_edit',public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]) or public.is_support_operator(),
 'can_accept',public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]),
 'acceptance',case when a.id is null then null else to_jsonb(a)||jsonb_build_object('valid',a.revision=coalesce(p.revision,0) and a.configuration_fingerprint=fingerprint) end);
end $$;
create or replace function public.save_event_preparation(p_event uuid,p_revision integer,p_scenario text,p_print boolean,p_step text,p_done boolean,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; p public.event_preparations; steps text[]; next_checks jsonb; fingerprint text;
begin
 select * into e from public.events where id=p_event for update;
 if e.id is null or not(public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]) or public.is_support_operator()) then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_scenario is null or p_scenario not in('simple','forum','exhibition','program') or p_print is null or p_revision is null then raise exception 'Configuración no válida'; end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Notas de hasta 2000 caracteres'; end if;
 select * into p from public.event_preparations where event_id=e.id for update;
 if coalesce(p.revision,0)<>p_revision then raise exception 'La preparación cambió. Actualiza antes de guardar' using errcode='40001'; end if;
 steps:=commercial_private.preparation_steps(p_scenario,p_print);
 fingerprint:=commercial_private.preparation_fingerprint(e.id);
 next_checks:=case when p.scenario is distinct from p_scenario or p.needs_printing is distinct from p_print or p.configuration_fingerprint is distinct from fingerprint then '{}'::jsonb else coalesce(p.checks,'{}') end;
 if p_step is not null then
  if not(p_step=any(steps)) or p_done is null then raise exception 'Paso no válido'; end if;
  if p_done and length(trim(coalesce(p_note,'')))<5 then raise exception 'Describe la evidencia o resultado (mínimo 5 caracteres)'; end if;
  next_checks:=jsonb_set(next_checks,array[p_step],jsonb_build_object('done',p_done,'note',trim(coalesce(p_note,'')),'actor_id',auth.uid(),'at',now()),true);
 end if;
 insert into public.event_preparations(event_id,organization_id,scenario,needs_printing,checks,revision,updated_by,configuration_fingerprint)
 values(e.id,e.organization_id,p_scenario,p_print,next_checks,coalesce(p.revision,0)+1,auth.uid(),fingerprint)
 on conflict(event_id) do update set scenario=excluded.scenario,needs_printing=excluded.needs_printing,checks=excluded.checks,revision=excluded.revision,updated_by=excluded.updated_by,configuration_fingerprint=excluded.configuration_fingerprint,updated_at=now();
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(e.organization_id,auth.uid(),'preparation_saved',jsonb_build_object('event_id',e.id,'step',p_step,'revision',coalesce(p.revision,0)+1));
 return public.get_event_preparation(e.id);
end $$;
create or replace function public.accept_event_preparation(p_event uuid,p_revision integer,p_fingerprint text,p_statement text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;p public.event_preparations;step text; fingerprint text;
begin
 select * into e from public.events where id=p_event for update;
 if e.id is null or not public.has_org_role(e.organization_id,array['owner','admin']::public.member_role[]) then raise exception 'Solo el organizador propietario o administrador puede aceptar' using errcode='42501'; end if;
 select * into p from public.event_preparations where event_id=e.id for update;
 fingerprint:=commercial_private.preparation_fingerprint(e.id);
 if p.event_id is null or p.revision is distinct from p_revision or fingerprint is distinct from p_fingerprint or p.configuration_fingerprint is distinct from fingerprint then raise exception 'La preparación o configuración cambió. Actualiza antes de aceptar' using errcode='40001'; end if;
 if p_statement is distinct from 'Confirmo las pruebas y responsables registrados. Esta aceptación no reserva soporte presencial ni certifica cumplimiento legal.' then raise exception 'Aceptación explícita requerida'; end if;
 foreach step in array commercial_private.preparation_steps(p.scenario,p.needs_printing) loop
  if not coalesce((p.checks->step->>'done')::boolean,false) then raise exception 'Completa todas las pruebas requeridas'; end if;
 end loop;
 insert into public.event_preparation_acceptances(event_id,organization_id,revision,actor_id,actor_identity,configuration_fingerprint,snapshot,statement)
 values(e.id,e.organization_id,p.revision,auth.uid(),jsonb_build_object('user_id',auth.uid()),fingerprint,
 jsonb_build_object('event_name',e.name,'scenario',p.scenario,'needs_printing',p.needs_printing,'checks',p.checks),p_statement)
 on conflict(event_id,revision,configuration_fingerprint) do nothing;
 insert into public.commercial_audit(organization_id,actor_id,action,details) values(e.organization_id,auth.uid(),'preparation_accepted',jsonb_build_object('event_id',e.id,'revision',p.revision));
 return public.get_event_preparation(e.id);
end $$;
create or replace function public.support_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_support_operator() then raise exception 'No autorizado' using errcode='42501'; end if;
 return jsonb_build_object('tickets',(select coalesce(jsonb_agg(x),'[]') from (
  select t.*,o.name organization_name,e.name event_name from public.support_tickets t join public.organizations o on o.id=t.organization_id
  left join public.events e on e.id=t.event_id order by (t.status='resolved'),(t.severity='critical') desc,t.updated_at desc limit 100) x),
 'events',(select coalesce(jsonb_agg(x),'[]') from (
  select e.id,e.name,o.name organization_name from public.events e join public.organizations o on o.id=e.organization_id
  where exists(select 1 from public.event_preparations p where p.event_id=e.id) or exists(select 1 from public.support_tickets t where t.event_id=e.id) order by e.name) x));
end $$;

revoke all on function public.is_support_operator(),public.admin_set_support_agent(uuid,boolean),public.support_team(),public.support_reply(uuid,text),public.support_update_ticket(uuid,text,uuid,text),public.get_event_preparation(uuid),public.save_event_preparation(uuid,integer,text,boolean,text,boolean,text),public.accept_event_preparation(uuid,integer,text,text),public.support_workspace() from public,anon,authenticated;
grant execute on function public.is_support_operator(),public.admin_set_support_agent(uuid,boolean),public.support_team(),public.support_reply(uuid,text),public.support_update_ticket(uuid,text,uuid,text),public.get_event_preparation(uuid),public.save_event_preparation(uuid,integer,text,boolean,text,boolean,text),public.accept_event_preparation(uuid,integer,text,text),public.support_workspace() to authenticated;
revoke all on all functions in schema commercial_private from public,anon,authenticated;
notify pgrst,'reload schema';
