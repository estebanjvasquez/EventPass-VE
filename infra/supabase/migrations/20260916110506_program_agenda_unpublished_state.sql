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
    if a is null and p.status <> 'published' then return jsonb_build_object('name','Programa de actividades','config',null,'events','[]'::jsonb); end if;
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
