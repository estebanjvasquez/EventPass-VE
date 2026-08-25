-- Perfil público del expositor con revisión del organizador.
alter table public.companies
  add column if not exists public_logo_url text,
  add column if not exists public_description text,
  add column if not exists public_category text,
  add column if not exists public_social_links jsonb not null default '{}'::jsonb,
  add column if not exists public_contact_email text,
  add column if not exists public_contact_phone text,
  add column if not exists public_profile_status text not null default 'draft',
  add column if not exists public_profile_submitted_at timestamptz,
  add column if not exists public_profile_approved_at timestamptz,
  add column if not exists public_profile_approved_by uuid references auth.users(id),
  add column if not exists public_profile_updated_at timestamptz not null default now();

alter table public.companies drop constraint if exists companies_public_profile_status_check;
alter table public.companies add constraint companies_public_profile_status_check
  check (public_profile_status in ('draft','pending','approved','rejected'));

create index if not exists idx_companies_public_profile_status
  on public.companies(organization_id, kind, public_profile_status);

drop policy if exists companies_portal_profile_select on public.companies;
create policy companies_portal_profile_select on public.companies
  for select to authenticated
  using (exists (
    select 1 from public.exhibitor_portal_members m
    where m.company_id = companies.id and m.user_id = auth.uid() and m.status = 'active'
  ));

create or replace function public.submit_exhibitor_public_profile(
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
declare result_row public.companies;
begin
  if not exists (
    select 1 from public.exhibitor_portal_members m
    where m.event_id = p_event_id and m.company_id = p_company_id
      and m.user_id = auth.uid() and m.status = 'active'
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
  where id = p_company_id
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.review_exhibitor_public_profile(p_company_id uuid, p_approved boolean)
returns public.companies
language plpgsql security definer set search_path = public
as $$
declare result_row public.companies;
begin
  if not exists (select 1 from public.companies c where c.id = p_company_id and (public.is_org_member(c.organization_id) or public.is_platform_admin())) then
    raise exception 'No tienes permisos para revisar este perfil' using errcode = '42501';
  end if;
  update public.companies
  set public_profile_status = case when p_approved then 'approved' else 'rejected' end,
      public_profile_approved_at = case when p_approved then now() else null end,
      public_profile_approved_by = case when p_approved then auth.uid() else null end,
      public_profile_updated_at = now()
  where id = p_company_id
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.submit_exhibitor_public_profile(uuid,uuid,text,text,text,jsonb,text,text) to authenticated;
revoke all on function public.review_exhibitor_public_profile(uuid,boolean) from public, anon;
grant execute on function public.review_exhibitor_public_profile(uuid,boolean) to authenticated;

create or replace view public.published_exhibition_directory
with (security_invoker = false)
as
select distinct
  e.id as element_id,
  c.id as company_id,
  c.name as company_name,
  c.public_logo_url as logo_url,
  c.public_description as description,
  c.public_category as category,
  c.public_social_links as social_links,
  c.public_contact_email as contact_email,
  c.public_contact_phone as contact_phone
from public.booth_assignments ba
join public.venue_map_elements e on e.id = ba.element_id
join public.venue_maps m on m.id = e.map_id and m.published = true
join public.companies c on c.id = ba.company_id
where ba.status <> 'cancelled'
  and e.public_visible = true
  and e.visible = true
  and (c.public_profile_status = 'approved' or c.public_profile_status is null);

revoke all on public.published_exhibition_directory from anon, authenticated;
grant select on public.published_exhibition_directory to anon, authenticated;
