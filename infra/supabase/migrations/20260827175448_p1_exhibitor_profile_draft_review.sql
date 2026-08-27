-- P1: separa el guardado en borrador del envio a revision del perfil publico.
create or replace function public.save_exhibitor_public_profile(
  p_event_id uuid,
  p_company_id uuid,
  p_logo_url text,
  p_description text,
  p_category text,
  p_social_links jsonb,
  p_contact_email text,
  p_contact_phone text
) returns public.companies
language plpgsql security definer set search_path = public
as $$
declare
  result_row public.companies;
begin
  if auth.uid() is null or not (
    exists (
      select 1
      from public.exhibitor_portal_members m
      where m.event_id = p_event_id
        and m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or public.is_platform_admin()
    or exists (
      select 1
      from public.events e
      join public.companies c on c.id = p_company_id and c.kind = 'exhibitor'
      where e.id = p_event_id
        and public.is_org_member(e.organization_id)
        and (
          c.organization_id = e.organization_id
          or exists (
            select 1
            from public.booth_assignments ba
            join public.venue_map_elements vme on vme.id = ba.element_id
            join public.venue_maps vm on vm.id = vme.map_id
            where ba.company_id = c.id
              and vm.event_id = e.id
              and ba.status <> 'cancelled'
          )
        )
    )
  ) then
    raise exception 'No tienes acceso al perfil de este expositor' using errcode = '42501';
  end if;

  update public.companies
  set public_logo_url = nullif(trim(p_logo_url), ''),
      public_description = nullif(trim(p_description), ''),
      public_category = nullif(trim(p_category), ''),
      public_social_links = coalesce(p_social_links, '{}'::jsonb),
      public_contact_email = nullif(lower(trim(p_contact_email)), ''),
      public_contact_phone = nullif(trim(p_contact_phone), ''),
      public_profile_status = 'draft',
      public_profile_submitted_at = null,
      public_profile_approved_at = null,
      public_profile_approved_by = null,
      public_profile_updated_at = now()
  where id = p_company_id
  returning * into result_row;

  if result_row.id is null then
    raise exception 'Expositor no encontrado' using errcode = 'P0002';
  end if;
  return result_row;
end;
$$;

revoke all on function public.save_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.save_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) to authenticated;

-- El modo administrador tambien debe entrar en la cola de revision. La
-- aprobacion queda exclusivamente en review_exhibitor_public_profile.
create or replace function public.admin_submit_exhibitor_public_profile(
  p_event_id uuid,
  p_company_id uuid,
  p_logo_url text,
  p_description text,
  p_category text,
  p_social_links jsonb,
  p_contact_email text,
  p_contact_phone text
) returns public.companies
language plpgsql security definer set search_path = public
as $$
declare
  result_row public.companies;
  event_org_id uuid;
begin
  select organization_id into event_org_id from public.events where id = p_event_id;
  if event_org_id is null or not (public.is_org_member(event_org_id) or public.is_platform_admin()) then
    raise exception 'No tienes permisos para mantener este perfil' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and c.kind = 'exhibitor'
      and (
        public.is_platform_admin()
        or c.organization_id = event_org_id
        or exists (
          select 1
          from public.booth_assignments ba
          join public.venue_map_elements vme on vme.id = ba.element_id
          join public.venue_maps vm on vm.id = vme.map_id
          where ba.company_id = c.id
            and vm.event_id = p_event_id
            and ba.status <> 'cancelled'
        )
      )
  ) then
    raise exception 'El expositor no pertenece a este evento' using errcode = '42501';
  end if;

  update public.companies
  set public_logo_url = nullif(trim(p_logo_url), ''),
      public_description = nullif(trim(p_description), ''),
      public_category = nullif(trim(p_category), ''),
      public_social_links = coalesce(p_social_links, '{}'::jsonb),
      public_contact_email = nullif(lower(trim(p_contact_email)), ''),
      public_contact_phone = nullif(trim(p_contact_phone), ''),
      public_profile_status = 'pending',
      public_profile_submitted_at = now(),
      public_profile_approved_at = null,
      public_profile_approved_by = null,
      public_profile_updated_at = now()
  where id = p_company_id
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.admin_submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.admin_submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) to authenticated;
