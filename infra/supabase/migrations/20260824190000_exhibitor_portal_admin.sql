-- Control administrativo, reenvío de invitaciones y auditoría del portal.
alter table public.exhibitor_portal_members
  add column if not exists email text;

create table if not exists public.exhibitor_portal_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_exhibitor_portal_audit_event on public.exhibitor_portal_audit(event_id, created_at desc);
create index if not exists idx_exhibitor_portal_audit_company on public.exhibitor_portal_audit(company_id, created_at desc);
grant select on public.exhibitor_portal_audit to authenticated;
alter table public.exhibitor_portal_audit enable row level security;
drop policy if exists exhibitor_portal_audit_read on public.exhibitor_portal_audit;
create policy exhibitor_portal_audit_read on public.exhibitor_portal_audit for select to authenticated
  using (exists (select 1 from public.events e where e.id = exhibitor_portal_audit.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())) or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_portal_audit.event_id and m.company_id = exhibitor_portal_audit.company_id and m.user_id = auth.uid() and m.status = 'active'));

create or replace function public.audit_exhibitor_portal_change()
returns trigger language plpgsql set search_path = public as $$
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

drop trigger if exists exhibitor_portal_members_audit on public.exhibitor_portal_members;
create trigger exhibitor_portal_members_audit after insert or update or delete on public.exhibitor_portal_members for each row execute function public.audit_exhibitor_portal_change();
drop trigger if exists exhibitor_portal_tasks_audit on public.exhibitor_portal_tasks;
create trigger exhibitor_portal_tasks_audit after insert or update or delete on public.exhibitor_portal_tasks for each row execute function public.audit_exhibitor_portal_change();
drop trigger if exists exhibitor_portal_documents_audit on public.exhibitor_portal_documents;
create trigger exhibitor_portal_documents_audit after insert or update or delete on public.exhibitor_portal_documents for each row execute function public.audit_exhibitor_portal_change();
drop trigger if exists exhibitor_portal_payments_audit on public.exhibitor_portal_payments;
create trigger exhibitor_portal_payments_audit after insert or update or delete on public.exhibitor_portal_payments for each row execute function public.audit_exhibitor_portal_change();
