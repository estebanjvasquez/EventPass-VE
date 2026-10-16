-- Keep public components available when another component is private.
create or replace function event_ops_private.public_item(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.program_registration_items i where i.id=p_item
 and (i.source_event_id is null or public.event_public_visible(i.source_event_id))
 and not exists(select 1 from public.program_registration_entitlements en left join public.event_sessions s on s.id=en.session_id left join public.event_zones z on z.id=en.zone_id
  where en.item_id=i.id and coalesce(en.event_id,s.event_id,z.event_id) is not null and not public.event_public_visible(coalesce(en.event_id,s.event_id,z.event_id)))
 and not exists(select 1 from public.program_registration_items parent where parent.id=i.parent_item_id and parent.source_event_id is not null and not public.event_public_visible(parent.source_event_id)));
$$;
revoke all on function event_ops_private.public_item(uuid) from public,anon,authenticated;

do $migration$declare definition text;begin
 if to_regprocedure('event_ops_private.original_get_public_program_registration_catalog(uuid)') is not null then
  select pg_get_functiondef('event_ops_private.original_get_public_program_registration_catalog(uuid)'::regprocedure) into definition;
  if position('event_public_visible(e.id)' in definition)=0 then definition:=replace(definition,'and e.status=''published''','and e.status=''published'' and public.event_public_visible(e.id)');end if;
  if position('event_ops_private.public_item(i.id)' in definition)=0 then definition:=replace(definition,'i.active and i.is_public','i.active and i.is_public and event_ops_private.public_item(i.id)');end if;
  if position('event_public_visible(e.id)' in definition)=0 or position('event_ops_private.public_item(i.id)' in definition)=0 then raise exception 'No se pudieron verificar los filtros del catálogo mixto';end if;
  execute definition;
  execute $wrapper$create or replace function public.get_public_program_registration_catalog(p_program_id uuid) returns jsonb language sql stable security definer set search_path='' as $body$
   select case when exists(select 1 from public.program_events pe where pe.program_id=p_program_id and public.event_public_visible(pe.event_id)) then event_ops_private.original_get_public_program_registration_catalog(p_program_id) else null end;
  $body$$wrapper$;
 end if;
 if to_regprocedure('event_ops_private.original_get_public_program_agenda(uuid,uuid,boolean)') is not null then
  select pg_get_functiondef('event_ops_private.original_get_public_program_agenda(uuid,uuid,boolean)'::regprocedure) into definition;
  if position('event_public_visible(ev.id)' in definition)=0 then definition:=replace(definition,'where pe.program_id=p.id and ev.organization_id=p.organization_id and','where pe.program_id=p.id and ev.organization_id=p.organization_id and public.event_public_visible(ev.id) and');end if;
  if position('event_public_visible(ev.id)' in definition)=0 then raise exception 'No se pudo verificar el filtro de agenda mixta';end if;
  execute definition;
  execute $wrapper$create or replace function public.get_public_program_agenda(p_program_id uuid default null,p_event_id uuid default null,p_event_only boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $body$
  begin
   if p_event_id is not null and not public.event_public_visible(p_event_id) then return null;end if;
   if p_program_id is not null and not exists(select 1 from public.program_events pe where pe.program_id=p_program_id and public.event_public_visible(pe.event_id)) then return null;end if;
   return event_ops_private.original_get_public_program_agenda(p_program_id,p_event_id,p_event_only);
  end $body$$wrapper$;
 end if;
end $migration$;
notify pgrst,'reload schema';
