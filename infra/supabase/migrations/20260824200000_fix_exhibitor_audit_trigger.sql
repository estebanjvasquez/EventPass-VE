-- El trigger escribe auditoría aunque la tabla sólo exponga lectura al cliente.
create or replace function public.audit_exhibitor_portal_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare row_data jsonb; event_value uuid; company_value uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  event_value := (row_data->>'event_id')::uuid;
  company_value := nullif(row_data->>'company_id', '')::uuid;
  insert into public.exhibitor_portal_audit(event_id, company_id, actor_user_id, action, entity_type, entity_id, details)
  values (event_value, company_value, auth.uid(), lower(tg_op), tg_table_name, coalesce((row_data->>'id')::uuid, null), jsonb_build_object('row', row_data));
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.audit_exhibitor_portal_change() from public, anon, authenticated;
