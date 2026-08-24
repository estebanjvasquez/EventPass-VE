-- Portal aislado de expositores y patrocinantes por evento.
create table if not exists public.exhibitor_portal_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('owner','manager','staff')),
  status text not null default 'invited' check (status in ('invited','active','revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (event_id, company_id, user_id)
);

create index if not exists idx_exhibitor_portal_members_user on public.exhibitor_portal_members(user_id, event_id);

create table if not exists public.exhibitor_portal_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','blocked')),
  created_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.exhibitor_portal_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  kind text not null default 'document' check (kind in ('manual','document','artwork','receipt')),
  storage_path text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.exhibitor_portal_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  payment_date date not null default current_date,
  reference text,
  receipt_path text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_exhibitor_portal_tasks_company on public.exhibitor_portal_tasks(event_id, company_id, due_at);
create index if not exists idx_exhibitor_portal_documents_event on public.exhibitor_portal_documents(event_id, company_id);
create index if not exists idx_exhibitor_portal_payments_company on public.exhibitor_portal_payments(event_id, company_id, payment_date desc);

grant select, insert, update, delete on public.exhibitor_portal_members to authenticated;
grant select, insert, update, delete on public.exhibitor_portal_tasks to authenticated;
grant select, insert, update, delete on public.exhibitor_portal_documents to authenticated;
grant select, insert, update, delete on public.exhibitor_portal_payments to authenticated;

alter table public.exhibitor_portal_members enable row level security;
alter table public.exhibitor_portal_tasks enable row level security;
alter table public.exhibitor_portal_documents enable row level security;
alter table public.exhibitor_portal_payments enable row level security;

drop policy if exists exhibitor_portal_members_access on public.exhibitor_portal_members;
create policy exhibitor_portal_members_access on public.exhibitor_portal_members for all to authenticated
  using ((user_id = auth.uid()) or exists (select 1 from public.events e where e.id = event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())))
  with check (exists (select 1 from public.events e where e.id = event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())));

drop policy if exists exhibitor_portal_tasks_access on public.exhibitor_portal_tasks;
create policy exhibitor_portal_tasks_access on public.exhibitor_portal_tasks for all to authenticated
  using (exists (select 1 from public.events e where e.id = exhibitor_portal_tasks.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())) or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_portal_tasks.event_id and m.company_id = exhibitor_portal_tasks.company_id and m.user_id = auth.uid() and m.status = 'active'))
  with check (exists (select 1 from public.events e where e.id = exhibitor_portal_tasks.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())) or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_portal_tasks.event_id and m.company_id = exhibitor_portal_tasks.company_id and m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists exhibitor_portal_documents_access on public.exhibitor_portal_documents;
create policy exhibitor_portal_documents_access on public.exhibitor_portal_documents for all to authenticated
  using (exists (select 1 from public.events e where e.id = exhibitor_portal_documents.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())) or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_portal_documents.event_id and (m.company_id = exhibitor_portal_documents.company_id or exhibitor_portal_documents.company_id is null) and m.user_id = auth.uid() and m.status = 'active'))
  with check (exists (select 1 from public.events e where e.id = exhibitor_portal_documents.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())) or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_portal_documents.event_id and (m.company_id = exhibitor_portal_documents.company_id or exhibitor_portal_documents.company_id is null) and m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists exhibitor_portal_payments_access on public.exhibitor_portal_payments;
create policy exhibitor_portal_payments_access on public.exhibitor_portal_payments for all to authenticated
  using (exists (select 1 from public.events e where e.id = exhibitor_portal_payments.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())) or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_portal_payments.event_id and m.company_id = exhibitor_portal_payments.company_id and m.user_id = auth.uid() and m.status = 'active'))
  with check (exists (select 1 from public.events e where e.id = exhibitor_portal_payments.event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())) or exists (select 1 from public.exhibitor_portal_members m where m.event_id = exhibitor_portal_payments.event_id and m.company_id = exhibitor_portal_payments.company_id and m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists exhibitor_portal_storage_select on storage.objects;
create policy exhibitor_portal_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'agenda-attachments' and exists (select 1 from public.exhibitor_portal_members m where m.user_id = auth.uid() and m.status = 'active' and m.event_id::text = split_part(name, '/', 2) and (m.company_id::text = split_part(name, '/', 4) or split_part(name, '/', 3) like 'exhibitor-manual-%')));

drop policy if exists exhibitor_portal_storage_insert on storage.objects;
create policy exhibitor_portal_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'agenda-attachments' and exists (select 1 from public.exhibitor_portal_members m where m.user_id = auth.uid() and m.status = 'active' and m.event_id::text = split_part(name, '/', 2) and m.company_id::text = split_part(name, '/', 4)));
