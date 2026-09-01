-- Observaciones concretas cuando el organizador devuelve un perfil público.
alter table public.companies
  add column if not exists public_profile_review_notes text,
  add column if not exists public_profile_reviewed_at timestamptz;

alter table public.companies
  add constraint public_profile_review_notes_length
  check (public_profile_review_notes is null or length(public_profile_review_notes) <= 2000);

drop function if exists public.review_exhibitor_public_profile(uuid, boolean);

create function public.review_exhibitor_public_profile(
  p_company_id uuid,
  p_approved boolean,
  p_feedback text default null
) returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.companies;
  clean_feedback text := nullif(btrim(p_feedback), '');
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.companies c
    join public.events e
      on e.id = c.event_id
     and e.organization_id = c.organization_id
    where c.id = p_company_id
      and c.kind = 'exhibitor'
      and (public.is_org_member(e.organization_id) or public.is_platform_admin())
  ) then
    raise exception 'No tienes permisos para revisar este perfil' using errcode = '42501';
  end if;

  if not p_approved and (clean_feedback is null or length(clean_feedback) < 10) then
    raise exception 'Indica los cambios solicitados con al menos 10 caracteres' using errcode = '22023';
  end if;

  update public.companies
  set public_profile_status = case when p_approved then 'approved' else 'rejected' end,
      public_profile_review_notes = case when p_approved then null else clean_feedback end,
      public_profile_reviewed_at = now(),
      public_profile_approved_at = case when p_approved then now() else null end,
      public_profile_approved_by = case when p_approved then (select auth.uid()) else null end,
      public_profile_updated_at = now()
  where id = p_company_id
  returning * into result_row;

  if result_row.id is null then
    raise exception 'Expositor no encontrado' using errcode = 'P0002';
  end if;
  return result_row;
end;
$$;

revoke all on function public.review_exhibitor_public_profile(uuid,boolean,text) from public, anon;
grant execute on function public.review_exhibitor_public_profile(uuid,boolean,text) to authenticated;

-- Al volver a enviar el perfil, las observaciones anteriores dejan de ser
-- accionables; el historial permanece en la auditoría del portal.
create or replace function public.clear_exhibitor_review_notes_on_resubmit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.public_profile_status in ('pending', 'approved')
     and new.public_profile_status is distinct from old.public_profile_status then
    new.public_profile_review_notes := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_exhibitor_review_notes on public.companies;
create trigger trg_clear_exhibitor_review_notes
before update of public_profile_status on public.companies
for each row execute function public.clear_exhibitor_review_notes_on_resubmit();

notify pgrst, 'reload schema';
