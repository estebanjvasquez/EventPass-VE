-- El blueprint de un plano publicado puede leerse en la vista pública.
drop policy if exists public_published_floorplan_backgrounds on storage.objects;
create policy public_published_floorplan_backgrounds on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'agenda-attachments'
  and exists (
    select 1 from public.venue_maps m
    where m.published = true
      and m.event_id::text = split_part(name, '/', 2)
      and ('map-' || m.id::text) = split_part(name, '/', 3)
  )
);

-- Sólo puede existir un plano publicado por evento.
with ranked as (
  select id, row_number() over (partition by event_id order by published_at desc nulls last, created_at desc) as position
  from public.venue_maps where published = true
)
update public.venue_maps set published = false, published_at = null
where id in (select id from ranked where position > 1);

create unique index if not exists venue_maps_one_published_per_event
on public.venue_maps(event_id) where published = true;

create or replace function public.publish_floor_plan(p_map_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_event_id uuid;
begin
  select m.event_id into v_event_id from public.venue_maps m
  where m.id = p_map_id and (public.is_org_member(m.organization_id) or public.is_platform_admin());
  if v_event_id is null then raise exception 'No tienes permisos para publicar este plano' using errcode = '42501'; end if;
  if p_published then
    update public.venue_maps set published = false, published_at = null where event_id = v_event_id and id <> p_map_id and published = true;
  end if;
  update public.venue_maps set published = p_published, published_at = case when p_published then now() else null end where id = p_map_id;
end $$;
revoke all on function public.publish_floor_plan(uuid, boolean) from public, anon;
grant execute on function public.publish_floor_plan(uuid, boolean) to authenticated;
