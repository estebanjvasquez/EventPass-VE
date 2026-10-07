-- Mantiene el catalogo de registro alineado con los eventos vinculados al programa.

create or replace function public.deactivate_removed_program_event_offers()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.program_registration_items i
  set active=false,is_public=false
  where i.program_id=old.program_id and (
    i.source_event_id=old.event_id
    or exists(
      select 1
      from public.program_registration_entitlements en
      left join public.event_sessions s on s.id=en.session_id
      left join public.event_zones z on z.id=en.zone_id
      where en.item_id=i.id
        and (en.event_id=old.event_id or s.event_id=old.event_id or z.event_id=old.event_id)
    )
    or exists(
      select 1 from public.program_registration_items parent
      where parent.id=i.parent_item_id and parent.source_event_id=old.event_id
    )
  );
  return old;
end $$;

drop trigger if exists deactivate_removed_program_event_offers on public.program_events;
create trigger deactivate_removed_program_event_offers
after delete on public.program_events
for each row execute function public.deactivate_removed_program_event_offers();

-- Corrige ofertas residuales creadas antes de instalar el trigger.
update public.program_registration_items i
set active=false,is_public=false
where i.active and (
  (i.source_event_id is not null and not exists(
    select 1 from public.program_events pe
    where pe.program_id=i.program_id and pe.event_id=i.source_event_id
  ))
  or exists(
    select 1
    from public.program_registration_entitlements en
    left join public.event_sessions s on s.id=en.session_id
    left join public.event_zones z on z.id=en.zone_id
    where en.item_id=i.id
      and coalesce(en.event_id,s.event_id,z.event_id) is not null
      and not exists(
        select 1 from public.program_events pe
        where pe.program_id=i.program_id
          and pe.event_id=coalesce(en.event_id,s.event_id,z.event_id)
      )
  )
  or exists(
    select 1 from public.program_registration_items parent
    where parent.id=i.parent_item_id
      and parent.source_event_id is not null
      and not exists(
        select 1 from public.program_events pe
        where pe.program_id=i.program_id and pe.event_id=parent.source_event_id
      )
  )
);

create or replace function public.save_program_registration_config(p_program_id uuid,p_mode text,p_components jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare pr public.event_programs; c jsonb; eid uuid; policy text; amount numeric; curr text; cap integer; item_id uuid; event_name text;
begin
  select * into pr from public.event_programs where id=p_program_id for update;
  if pr.id is null or not (public.is_org_member(pr.organization_id) or public.is_platform_admin()) then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_mode not in ('separate','unified','modular','hybrid') then raise exception 'Modo de registro no valido'; end if;
  if jsonb_typeof(coalesce(p_components,'[]'::jsonb))<>'array' then raise exception 'Componentes no validos'; end if;
  update public.event_programs set registration_config=jsonb_set(coalesce(registration_config,'{}'::jsonb),'{registration_mode}',to_jsonb(p_mode),true) where id=p_program_id;
  for c in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    eid:=(c->>'event_id')::uuid; policy:=coalesce(c->>'policy','independent'); amount:=coalesce((c->>'price')::numeric,0); curr:=upper(coalesce(nullif(c->>'currency',''),'USD')); cap:=nullif(c->>'capacity','')::integer;
    if policy not in ('included','optional_free','optional_paid','independent','invite_only') or amount<0 or cap<0 then raise exception 'Configuracion invalida'; end if;
    if not exists(select 1 from public.program_events where program_id=p_program_id and event_id=eid) then raise exception 'El evento no pertenece al programa'; end if;
    update public.program_events set registration_policy=policy,registration_price=case when policy='optional_paid' then amount else 0 end,registration_currency=curr,registration_capacity=cap where program_id=p_program_id and event_id=eid;
    select name into event_name from public.events where id=eid;
    select id into item_id from public.program_registration_items where program_id=p_program_id and source_event_id=eid and item_type='event';
    if policy in ('included','optional_free','optional_paid') then
      if item_id is null then
        insert into public.program_registration_items(program_id,source_event_id,name,item_type,selection_type,price,currency,capacity,is_public,active)
        values(p_program_id,eid,event_name,'event',case when policy='included' then 'required' else 'optional' end,case when policy='optional_paid' then amount else 0 end,curr,cap,true,true) returning id into item_id;
      else
        update public.program_registration_items set name=event_name,selection_type=case when policy='included' then 'required' else 'optional' end,price=case when policy='optional_paid' then amount else 0 end,currency=curr,capacity=cap,is_public=true,active=true where id=item_id;
      end if;
      insert into public.program_registration_entitlements(item_id,event_id) values(item_id,eid) on conflict do nothing;
      update public.program_registration_items child
      set parent_item_id=item_id,active=true,is_public=true
      where child.program_id=p_program_id and child.item_type='session' and exists(
        select 1 from public.program_registration_entitlements en
        join public.event_sessions s on s.id=en.session_id
        where en.item_id=child.id and s.event_id=eid and s.status='scheduled'
          and s.registration_policy<>'closed' and s.session_type<>'break'
      );
    elsif item_id is not null then
      update public.program_registration_items set active=false,is_public=false where id=item_id or parent_item_id=item_id;
    end if;
  end loop;
end $$;

revoke all on function public.deactivate_removed_program_event_offers() from public;
