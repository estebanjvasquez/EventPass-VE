-- Aislamiento estricto de expositores por evento y consistencia evento/tenant.
-- Cada expositor es una entidad del evento, aunque dos eventos usen el mismo nombre.

alter table public.events
  add constraint events_id_organization_unique unique (id, organization_id);

alter table public.companies
  add column if not exists event_id uuid;

-- Enlaces existentes tienen prioridad: un stand o miembro del portal identifica
-- de forma inequívoca el evento al que pertenece el expositor.
update public.companies c
set event_id = source.event_id
from (
  select company_id, min(event_id::text)::uuid as event_id
  from (
    select ba.company_id, vm.event_id
    from public.booth_assignments ba
    join public.venue_map_elements element on element.id = ba.element_id
    join public.venue_maps vm on vm.id = element.map_id
    where ba.status <> 'cancelled'
    union
    select company_id, event_id
    from public.exhibitor_portal_members
    where status = 'active'
  ) linked
  group by company_id
  having count(distinct event_id) = 1
) source
where c.id = source.company_id
  and c.kind = 'exhibitor';

-- La carga del 27/08 fue creada específicamente para Expo Energia 2026.
update public.companies
set event_id = '276e4d25-b107-4393-9530-542db8ed03a3'::uuid
where kind = 'exhibitor'
  and event_id is null
  and created_at >= '2026-08-27 00:00:00+00'::timestamptz
  and organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Los expositores de demostración anteriores pertenecen al primer evento Expo.
update public.companies
set event_id = '8f8489bc-3a3a-454c-94a1-06c7dc0877fb'::uuid
where kind = 'exhibitor'
  and event_id is null
  and organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Corrige hijos creados desde una pantalla contaminada por el catálogo global.
update public.exhibitor_staff child set event_id = c.event_id
from public.companies c where c.id = child.company_id and c.event_id is distinct from child.event_id;
update public.exhibitor_portal_tasks child set event_id = c.event_id
from public.companies c where c.id = child.company_id and c.event_id is distinct from child.event_id;
update public.exhibitor_portal_payments child set event_id = c.event_id
from public.companies c where c.id = child.company_id and c.event_id is distinct from child.event_id;
update public.exhibitor_portal_members child set event_id = c.event_id
from public.companies c where c.id = child.company_id and c.event_id is distinct from child.event_id;
update public.exhibitor_portal_activities child set event_id = c.event_id
from public.companies c where c.id = child.company_id and c.event_id is distinct from child.event_id;
update public.exhibitor_portal_documents child set event_id = c.event_id
from public.companies c where c.id = child.company_id and c.event_id is distinct from child.event_id;
update public.exhibitor_portal_audit child set event_id = c.event_id
from public.companies c where c.id = child.company_id and c.event_id is distinct from child.event_id;

-- Sustituye la unicidad global por organización: el mismo nombre puede existir
-- en dos eventos sin compartir perfil, contactos, personal ni documentos.
do $$
declare constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  where con.conrelid = 'public.companies'::regclass
    and con.contype = 'u'
    and (
      select array_agg(att.attname::text order by key.ordinality)
      from unnest(con.conkey) with ordinality key(attnum, ordinality)
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
    ) = array['organization_id','name'];
  if constraint_name is not null then
    execute format('alter table public.companies drop constraint %I', constraint_name);
  end if;
end $$;

create unique index if not exists companies_event_name_unique
  on public.companies(event_id, lower(btrim(name)))
  where event_id is not null and kind = 'exhibitor';
create unique index if not exists companies_event_id_id_unique
  on public.companies(event_id, id);

alter table public.companies
  add constraint companies_event_tenant_fk
  foreign key (event_id, organization_id)
  references public.events(id, organization_id)
  on delete cascade;

alter table public.companies
  add constraint exhibitor_requires_event
  check (kind <> 'exhibitor' or event_id is not null);

-- Ninguna tabla del portal puede mezclar el evento de la fila con el evento
-- real de la empresa expositora.
alter table public.exhibitor_staff add constraint exhibitor_staff_event_company_fk
  foreign key (event_id, company_id) references public.companies(event_id, id) on delete cascade;
alter table public.exhibitor_portal_tasks add constraint exhibitor_tasks_event_company_fk
  foreign key (event_id, company_id) references public.companies(event_id, id) on delete cascade;
alter table public.exhibitor_portal_payments add constraint exhibitor_payments_event_company_fk
  foreign key (event_id, company_id) references public.companies(event_id, id) on delete cascade;
alter table public.exhibitor_portal_members add constraint exhibitor_members_event_company_fk
  foreign key (event_id, company_id) references public.companies(event_id, id) on delete cascade;
alter table public.exhibitor_portal_activities add constraint exhibitor_activities_event_company_fk
  foreign key (event_id, company_id) references public.companies(event_id, id) on delete cascade;
alter table public.exhibitor_portal_documents add constraint exhibitor_documents_event_company_fk
  foreign key (event_id, company_id) references public.companies(event_id, id) on delete cascade;
alter table public.exhibitor_portal_audit add constraint exhibitor_audit_event_company_fk
  foreign key (event_id, company_id) references public.companies(event_id, id) on delete cascade;

-- Un stand sólo admite una empresa del mismo evento y tenant que el plano.
create or replace function public.enforce_booth_assignment_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  map_event_id uuid;
  map_organization_id uuid;
  company_event_id uuid;
  company_organization_id uuid;
begin
  select vm.event_id, vm.organization_id
    into map_event_id, map_organization_id
  from public.venue_map_elements element
  join public.venue_maps vm on vm.id = element.map_id
  where element.id = new.element_id;

  select c.event_id, c.organization_id
    into company_event_id, company_organization_id
  from public.companies c
  where c.id = new.company_id and c.kind = 'exhibitor';

  if map_event_id is null or company_event_id is null
     or map_event_id <> company_event_id
     or map_organization_id <> company_organization_id then
    raise exception 'El expositor y el stand deben pertenecer al mismo evento y organización'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_booth_assignment_scope on public.booth_assignments;
create trigger trg_booth_assignment_scope
before insert or update of element_id, company_id on public.booth_assignments
for each row execute function public.enforce_booth_assignment_scope();

-- Defensa global: toda tabla que almacene organization_id + event_id queda
-- enlazada al par real del evento, evitando cruces de tenant por construcción.
do $$
declare item record;
begin
  for item in
    select cols.table_name
    from (
      select table_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name in ('organization_id', 'event_id')
      group by table_name
      having count(distinct column_name) = 2
    ) cols
    where cols.table_name <> 'companies'
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', item.table_name)::regclass
        and conname = item.table_name || '_event_tenant_fk'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (event_id, organization_id) references public.events(id, organization_id)',
        item.table_name,
        item.table_name || '_event_tenant_fk'
      );
    end if;
  end loop;
end $$;

create index if not exists companies_event_exhibitor_idx
  on public.companies(event_id, name)
  where kind = 'exhibitor';

notify pgrst, 'reload schema';
