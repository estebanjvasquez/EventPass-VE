-- Permite al organizador y al superadministrador mantener el perfil público
-- cuando acceden al portal en modo administración.
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
  select organization_id into event_org_id
  from public.events
  where id = p_event_id;

  if event_org_id is null then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;

  if not (public.is_platform_admin() or public.is_org_member(event_org_id)) then
    raise exception 'No tienes permisos para administrar este perfil' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id and c.organization_id = event_org_id
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
      public_profile_status = 'approved',
      public_profile_submitted_at = coalesce(public_profile_submitted_at, now()),
      public_profile_approved_at = now(),
      public_profile_approved_by = auth.uid(),
      public_profile_updated_at = now()
  where id = p_company_id
  returning * into result_row;

  return result_row;
end;
$$;

revoke all on function public.admin_submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.admin_submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) to authenticated;
