-- Resolve existing configuration tables through catalog rows rather than a
-- FOREACH constant array, which plpgsql_check incorrectly folds into one name.
create or replace function commercial_private.preparation_fingerprint(p_event uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare payload text; t text; part text;
begin
 select (to_jsonb(e)-'updated_at'-'created_at')::text into payload from public.events e where id=p_event;
 for t in select c.table_name::text from information_schema.columns c
  where c.table_schema='public' and c.column_name='event_id'
  and c.table_name=any(array['event_ticket_categories','badge_templates','badge_print_profiles','access_points','agenda_items','event_sessions','event_stages','venue_maps','companies'])
  order by c.table_name
 loop
  execute format('select coalesce(jsonb_agg(x order by x::text),''[]''::jsonb)::text from (select to_jsonb(r)-''updated_at''-''created_at'' as x from public.%I r where event_id=$1) q',t) into part using p_event;
  payload:=payload||t||part;
 end loop;
 return md5(payload);
end $$;
revoke all on function commercial_private.preparation_fingerprint(uuid) from public,anon,authenticated;
