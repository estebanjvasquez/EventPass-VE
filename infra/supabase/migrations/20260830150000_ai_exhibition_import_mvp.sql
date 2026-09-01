-- MVP: importación asistida por IA de planos de exposición.
-- El archivo fuente es privado y la propuesta nunca reemplaza un plano existente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'floorplan-sources',
  'floorplan-sources',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists floorplan_sources_admin_select on storage.objects;
create policy floorplan_sources_admin_select on storage.objects
for select to authenticated using (
  bucket_id = 'floorplan-sources' and (
    public.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.organization_id = ((storage.foldername(name))[1])::uuid
        and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
  )
);

drop policy if exists floorplan_sources_admin_insert on storage.objects;
create policy floorplan_sources_admin_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'floorplan-sources' and (
    public.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.organization_id = ((storage.foldername(name))[1])::uuid
        and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
  )
);

drop policy if exists floorplan_sources_admin_delete on storage.objects;
create policy floorplan_sources_admin_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'floorplan-sources' and (
    public.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.organization_id = ((storage.foldername(name))[1])::uuid
        and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
  )
);

create table if not exists public.venue_map_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  map_id uuid not null references public.venue_maps(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'application/pdf')),
  page_number integer not null default 1 check (page_number = 1),
  status text not null default 'uploaded' check (status in ('uploaded', 'analyzing', 'review', 'applied', 'failed', 'discarded')),
  proposal jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  applied_at timestamptz
);

create index if not exists idx_venue_map_imports_map_created
  on public.venue_map_imports(map_id, created_at desc);

alter table public.venue_map_imports enable row level security;
grant select, insert, update on public.venue_map_imports to authenticated;

drop policy if exists venue_map_imports_admin_all on public.venue_map_imports;
create policy venue_map_imports_admin_all on public.venue_map_imports
for all to authenticated
using (
  public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.organization_id = venue_map_imports.organization_id
      and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
)
with check (
  public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.organization_id = venue_map_imports.organization_id
      and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
);

create or replace function public.apply_ai_exhibition_import(
  p_import_id uuid,
  p_selected_source_ids text[],
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import public.venue_map_imports;
  v_map public.venue_maps;
  v_item jsonb;
  v_kind text;
  v_type text;
  v_count integer := 0;
  v_next_version integer;
  v_width numeric;
  v_height numeric;
begin
  select * into v_import from public.venue_map_imports where id = p_import_id for update;
  if not found then raise exception 'Importación no encontrada'; end if;
  if not (public.is_platform_admin() or exists (
    select 1 from public.memberships m where m.organization_id = v_import.organization_id
      and m.user_id = auth.uid() and m.role in ('owner','admin')
  )) then raise exception 'No autorizado' using errcode = '42501'; end if;

  select * into v_map from public.venue_maps where id = v_import.map_id for update;
  if v_map.event_id <> v_import.event_id or v_map.organization_id <> v_import.organization_id then
    raise exception 'La importación no corresponde al plano';
  end if;
  if v_import.status <> 'review' or v_import.proposal is null then raise exception 'La propuesta no está lista para aplicar'; end if;
  if jsonb_typeof(v_import.proposal->'elements') <> 'array'
     or jsonb_array_length(v_import.proposal->'elements') > 250 then
    raise exception 'La propuesta contiene una lista de elementos inválida';
  end if;
  if v_map.published then raise exception 'Despublica el plano antes de aplicar una propuesta'; end if;
  if v_map.current_version <> p_expected_version then raise exception 'El plano cambió; recarga antes de aplicar'; end if;
  if exists (select 1 from public.venue_map_elements e where e.map_id = v_map.id) then
    raise exception 'La importación con IA sólo puede aplicarse sobre un plano vacío';
  end if;
  if coalesce(array_length(p_selected_source_ids, 1), 0) = 0 then raise exception 'Selecciona al menos un elemento'; end if;

  v_width := coalesce((v_map.metadata->>'width_units')::numeric, 40);
  v_height := coalesce((v_map.metadata->>'height_units')::numeric, 24);
  v_next_version := v_map.current_version + 1;

  insert into public.venue_map_versions(map_id, version_number, label, snapshot, created_by)
  values (v_map.id, v_next_version, 'Importación de plano con IA',
    jsonb_build_object('elements', '[]'::jsonb, 'metadata', v_map.metadata), auth.uid());

  for v_item in select value from jsonb_array_elements(v_import.proposal->'elements')
  loop
    continue when not ((v_item->>'source_id') = any(p_selected_source_ids));
    v_kind := v_item->>'kind';
    if v_kind not in ('stand','aisle','access','emergency_exit','stage','restroom','service','wall','column','information') then
      raise exception 'Tipo de elemento no permitido: %', v_kind;
    end if;
    if (v_item->>'x')::numeric < 0 or (v_item->>'y')::numeric < 0
       or (v_item->>'width')::numeric <= 0 or (v_item->>'height')::numeric <= 0
       or (v_item->>'x')::numeric + (v_item->>'width')::numeric > v_width
       or (v_item->>'y')::numeric + (v_item->>'height')::numeric > v_height then
      raise exception 'Elemento fuera de los límites del plano';
    end if;
    v_type := case
      when v_kind = 'stand' then 'stand'
      when v_kind = 'aisle' then 'aisle'
      when v_kind in ('access','emergency_exit') then 'access_point'
      when v_kind = 'stage' then 'stage'
      else 'zone'
    end;
    if v_kind = 'stand' and exists (
      select 1 from public.venue_map_elements e
      where e.map_id = v_map.id and e.element_type = 'stand'
        and (v_item->>'x')::numeric < e.x + e.width
        and (v_item->>'x')::numeric + (v_item->>'width')::numeric > e.x
        and (v_item->>'y')::numeric < e.y + e.height
        and (v_item->>'y')::numeric + (v_item->>'height')::numeric > e.y
    ) then raise exception 'Hay stands superpuestos en la selección'; end if;
    insert into public.venue_map_elements(
      map_id, element_type, label, x, y, width, height, status, metadata,
      geometry, layer, z_index, locked, visible, style
    ) values (
      v_map.id, v_type, left(coalesce(nullif(v_item->>'label',''), initcap(v_kind)) || ' ' || (v_count + 1), 120),
      (v_item->>'x')::numeric, (v_item->>'y')::numeric,
      (v_item->>'width')::numeric, (v_item->>'height')::numeric, 'blocked',
      jsonb_build_object('kind', v_kind, 'ai_import_id', v_import.id, 'source_id', v_item->>'source_id', 'confidence', (v_item->>'confidence')::numeric),
      jsonb_build_object('x',(v_item->>'x')::numeric,'y',(v_item->>'y')::numeric,'width',(v_item->>'width')::numeric,'height',(v_item->>'height')::numeric,'rotation',0),
      case when v_kind = 'stand' then 'layout' when v_kind in ('aisle','access','emergency_exit') then 'circulation' else 'architecture' end,
      v_count + 1, false, true, '{}'::jsonb
    );
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Ningún elemento seleccionado coincide con la propuesta'; end if;

  update public.venue_maps set current_version = v_next_version,
    metadata = metadata || jsonb_build_object('last_ai_import_id', v_import.id)
  where id = v_map.id;
  update public.venue_map_imports set status = 'applied', applied_at = now() where id = v_import.id;
  return jsonb_build_object('map_id', v_map.id, 'created', v_count, 'version', v_next_version);
end;
$$;

revoke all on function public.apply_ai_exhibition_import(uuid, text[], integer) from public, anon;
grant execute on function public.apply_ai_exhibition_import(uuid, text[], integer) to authenticated;
