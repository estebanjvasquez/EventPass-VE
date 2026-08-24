-- Canvas de exposición a escala. Las columnas x/y existentes se mantienen para
-- mapas legacy y foros; el editor nuevo persiste geometría libre en JSONB.
alter table public.venue_maps
  alter column metadata set default '{}'::jsonb;

alter table public.venue_map_elements
  add column if not exists geometry jsonb,
  add column if not exists style jsonb not null default '{}'::jsonb,
  add column if not exists layer text not null default 'layout',
  add column if not exists z_index integer not null default 1,
  add column if not exists locked boolean not null default false,
  add column if not exists visible boolean not null default true;

create index if not exists idx_venue_map_elements_layer_order
  on public.venue_map_elements(map_id, layer, z_index);

-- Normaliza elementos existentes para que el canvas pueda abrir mapas creados
-- por el editor legacy sin perder asignaciones ni posiciones.
update public.venue_map_elements
set geometry = jsonb_build_object(
  'x', x,
  'y', y,
  'width', width,
  'height', height,
  'rotation', coalesce((metadata->>'rotation')::numeric, 0)
)
where geometry is null;

update public.venue_map_elements
set layer = case
  when element_type = 'stand' then 'layout'
  when element_type in ('aisle', 'access_point') then 'circulation'
  when element_type in ('stage', 'zone') then 'architecture'
  else 'layout'
end
where layer is null or layer = '';

grant select, insert, update, delete on public.venue_map_elements to authenticated;
