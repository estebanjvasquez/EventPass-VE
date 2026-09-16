-- Private drafts: no anonymous table access. Public RPC returns published JSON only.
create table if not exists public.program_agendas (
  program_id uuid primary key references public.event_programs(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  published jsonb,
  updated_at timestamptz not null default now()
);
alter table public.program_agendas enable row level security;
revoke all on public.program_agendas from anon, authenticated;
grant select on public.program_agendas to authenticated;
drop policy if exists program_agenda_member_read on public.program_agendas;
create policy program_agenda_member_read on public.program_agendas for select to authenticated
using (exists(select 1 from public.event_programs p where p.id=program_id and (public.is_org_member(p.organization_id) or public.is_platform_admin())));

create or replace function public.save_program_agenda(p_program_id uuid,p_config jsonb,p_action text)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid; b jsonb;
begin
  select organization_id into v_org from public.event_programs where id=p_program_id;
  if auth.uid() is null or v_org is null or not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'No tienes permiso para administrar este programa' using errcode='42501';
  end if;
  if coalesce(p_action,'') not in ('draft','publish','unpublish') then raise exception 'Acción inválida'; end if;
  if p_config is null or jsonb_typeof(p_config->'blocks') is distinct from 'array' then raise exception 'Configuración inválida'; end if;
  if jsonb_array_length(p_config->'blocks') > 500
    or length(coalesce(p_config->>'title','')) not between 1 and 200
    or coalesce(p_config->>'presentation','') not in ('summary','detailed')
    or not exists(select 1 from pg_timezone_names where name=p_config->>'timezone') then raise exception 'Configuración inválida'; end if;
  if p_action='publish' and jsonb_array_length(p_config->'blocks')=0 then raise exception 'Añade al menos una actividad antes de publicar'; end if;
  for b in select value from jsonb_array_elements(p_config->'blocks') loop
    if length(trim(coalesce(b->>'title',''))) = 0 or coalesce(b->>'mode','') not in ('summary','sessions','both') then raise exception 'Actividad inválida'; end if;
    if nullif(b->>'event_id','') is not null and not exists(
      select 1 from public.program_events pe join public.events e on e.id=pe.event_id
      where pe.program_id=p_program_id and e.id=(b->>'event_id')::uuid and e.organization_id=v_org
    ) then raise exception 'La actividad no pertenece a este programa'; end if;
    if nullif(b->>'ends_at','') is not null and (nullif(b->>'starts_at','') is null or (b->>'ends_at')::timestamptz <= (b->>'starts_at')::timestamptz) then raise exception 'El final debe ser posterior al inicio'; end if;
    perform nullif(b->>'starts_at','')::timestamptz;
  end loop;
  insert into public.program_agendas(program_id,draft,published) values(p_program_id,p_config,case when p_action='publish' then p_config else null end)
  on conflict(program_id) do update set draft=p_config,published=case when p_action='publish' then p_config when p_action='unpublish' then null else program_agendas.published end,updated_at=now();
end $$;
revoke all on function public.save_program_agenda(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_program_agenda(uuid,jsonb,text) to authenticated;

drop function if exists public.get_public_program_agenda(uuid,uuid);
create or replace function public.get_public_program_agenda(p_program_id uuid default null,p_event_id uuid default null,p_event_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p public.event_programs; a jsonb; result_events jsonb; e public.events;
begin
  if p_program_id is null and p_event_id is not null and not p_event_only then
    -- Never pick an arbitrary associated program: explicit site assignment only.
    select s.program_id into p_program_id from public.public_sites s join public.program_events pe on pe.program_id=s.program_id and pe.event_id=p_event_id where s.status='active' limit 1;
    if p_program_id is null then
      select nullif(s.landing_config->>'agenda_program_id','')::uuid into p_program_id from public.public_sites s where s.event_id=p_event_id and s.status='active';
      if p_program_id is not null and not exists(select 1 from public.program_events where program_id=p_program_id and event_id=p_event_id) then p_program_id:=null; end if;
    end if;
  end if;
  if p_program_id is not null then
    select * into p from public.event_programs where id=p_program_id;
    if p.id is null then return null; end if;
    select published into a from public.program_agendas where program_id=p.id;
    if a is null and p.status <> 'published' then return null; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'name',ev.name,'description',ev.description,'event_type',ev.event_type,'start_date',ev.start_date,'end_date',ev.end_date,
      'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from public.get_public_forum_agenda(ev.id) s where coalesce((ev.config->'public_agenda'->>'published')::boolean,true)),'[]'::jsonb)) order by ev.start_date nulls last),'[]'::jsonb)
    into result_events from public.program_events pe join public.events ev on ev.id=pe.event_id
    where pe.program_id=p.id and ev.organization_id=p.organization_id and (ev.status='published' or coalesce((ev.config->'public_agenda'->>'published')::boolean,false));
    -- Omit deleted/unlinked/private activities from a previously published snapshot.
    if a is not null then
      a:=jsonb_set(a,'{blocks}',coalesce((select jsonb_agg(b) from jsonb_array_elements(a->'blocks') b where nullif(b->>'event_id','') is null or exists(select 1 from jsonb_array_elements(result_events) ev where ev->>'id'=b->>'event_id')),'[]'::jsonb));
    end if;
    return jsonb_build_object('name',p.name,'config',a,'events',result_events);
  end if;
  select * into e from public.events where id=p_event_id and (status='published' or coalesce((config->'public_agenda'->>'published')::boolean,false));
  if e.id is null then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into result_events from public.get_public_forum_agenda(e.id) s where coalesce((e.config->'public_agenda'->>'published')::boolean,true);
  return jsonb_build_object('name',e.name,'config',jsonb_build_object('title','Agenda de actividades','timezone','America/Caracas','presentation','detailed','blocks','[]'::jsonb),'events',jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'description',e.description,'event_type',e.event_type,'start_date',e.start_date,'end_date',e.end_date,'sessions',result_events)));
end $$;
revoke all on function public.get_public_program_agenda(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.get_public_program_agenda(uuid,uuid,boolean) to anon,authenticated;
notify pgrst,'reload schema';
