-- Connect the reported public Expo site to its explicitly selected web-owner
-- program. Do not guess among associations and do not publish registration.
do $$
declare v_event uuid := '276e4d25-b107-4393-9530-542db8ed03a3'; v_program uuid; v_config jsonb;
begin
  if (select count(*) from public.event_programs p join public.program_events pe on pe.program_id=p.id and pe.event_id=v_event where p.registration_config->>'web_event_id'=v_event::text) <> 1 then
    raise notice 'No unique explicit web-owner program; no bootstrap performed'; return;
  end if;
  select p.id into v_program from public.event_programs p join public.program_events pe on pe.program_id=p.id and pe.event_id=v_event where p.registration_config->>'web_event_id'=v_event::text;
  select jsonb_build_object('title','Programa general','timezone','America/Caracas','presentation','detailed','blocks',coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id::text,'event_id',e.id,'title',e.name,'description',coalesce(e.description,''),'location',coalesce(p.venue_name,''),
    'starts_at',coalesce(e.start_date::text,''),'ends_at',coalesce(e.end_date::text,''),'mode',case when e.event_type='exhibition' then 'summary' else 'both' end
  ) order by e.start_date nulls last),'[]'::jsonb)) into v_config
  from public.program_events pe join public.events e on e.id=pe.event_id join public.event_programs p on p.id=pe.program_id
  where pe.program_id=v_program and e.organization_id=p.organization_id and (e.status='published' or coalesce((e.config->'public_agenda'->>'published')::boolean,false));
  if jsonb_array_length(v_config->'blocks')=0 then return; end if;
  insert into public.program_agendas(program_id,draft,published) values(v_program,v_config,v_config) on conflict(program_id) do nothing;
  update public.public_sites set landing_config=landing_config || jsonb_build_object('agenda_scope','program','agenda_program_id',v_program,'agenda_title','Programa general')
  where event_id=v_event and status='active' and not (landing_config ? 'agenda_scope');
end $$;
notify pgrst,'reload schema';
