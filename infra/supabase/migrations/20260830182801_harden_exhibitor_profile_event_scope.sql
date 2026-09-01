-- Los RPC de perfil deben validar el evento concreto, no sólo el tenant.
create or replace function public.save_exhibitor_public_profile(
  p_event_id uuid, p_company_id uuid, p_logo_url text, p_description text,
  p_category text, p_social_links jsonb, p_contact_email text, p_contact_phone text
) returns public.companies
language plpgsql security definer set search_path = public
as $$
declare result_row public.companies;
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.events e
    join public.companies c
      on c.id = p_company_id
     and c.event_id = e.id
     and c.organization_id = e.organization_id
     and c.kind = 'exhibitor'
    where e.id = p_event_id
      and (
        public.is_platform_admin()
        or public.is_org_member(e.organization_id)
        or exists (
          select 1 from public.exhibitor_portal_members m
          where m.event_id = e.id and m.company_id = c.id
            and m.user_id = (select auth.uid()) and m.status = 'active'
        )
      )
  ) then
    raise exception 'El expositor no pertenece a este evento o no tienes acceso' using errcode = '42501';
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
  where id = p_company_id and event_id = p_event_id
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.admin_submit_exhibitor_public_profile(
  p_event_id uuid, p_company_id uuid, p_logo_url text, p_description text,
  p_category text, p_social_links jsonb, p_contact_email text, p_contact_phone text
) returns public.companies
language plpgsql security definer set search_path = public
as $$
declare result_row public.companies;
begin
  if not exists (
    select 1
    from public.events e
    join public.companies c
      on c.id = p_company_id
     and c.event_id = e.id
     and c.organization_id = e.organization_id
     and c.kind = 'exhibitor'
    where e.id = p_event_id
      and (public.is_platform_admin() or public.is_org_member(e.organization_id))
  ) then
    raise exception 'El expositor no pertenece a este evento o no tienes permisos' using errcode = '42501';
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
  where id = p_company_id and event_id = p_event_id
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.submit_exhibitor_public_profile(
  p_event_id uuid, p_company_id uuid, p_logo_url text, p_description text,
  p_category text, p_social_links jsonb, p_contact_email text, p_contact_phone text
) returns public.companies
language plpgsql security definer set search_path = public
as $$
declare result_row public.companies;
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.exhibitor_portal_members m
    join public.companies c on c.id = m.company_id and c.event_id = m.event_id
    where m.event_id = p_event_id and m.company_id = p_company_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
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
      public_profile_status = 'pending',
      public_profile_submitted_at = now(),
      public_profile_updated_at = now()
  where id = p_company_id and event_id = p_event_id
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.save_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) from public, anon;
revoke all on function public.admin_submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) from public, anon;
revoke all on function public.submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.save_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) to authenticated;
grant execute on function public.admin_submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) to authenticated;
grant execute on function public.submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) to authenticated;

notify pgrst, 'reload schema';
