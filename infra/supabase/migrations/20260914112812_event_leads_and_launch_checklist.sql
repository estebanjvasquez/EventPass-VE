-- Fase 4: formularios públicos de captación, con consentimiento y aislamiento por evento.

create table if not exists public.event_lead_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  slug text not null,
  form_type text not null check (form_type in ('pre_registration','exhibitor','sponsorship','newsletter','contact')),
  title text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  consent_label text not null default 'Acepto que el organizador use mis datos para responder a esta solicitud.',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, slug),
  check (slug ~ '^[a-z0-9-]{2,80}$'),
  check (jsonb_typeof(fields) = 'array')
);

create index if not exists event_lead_forms_event_idx on public.event_lead_forms(event_id, published);

create table if not exists public.event_lead_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  form_id uuid not null references public.event_lead_forms(id) on delete cascade,
  answers jsonb not null,
  consented_at timestamptz not null,
  campaign text,
  source text,
  medium text,
  referrer_host text,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(answers) = 'object')
);

create index if not exists event_lead_submissions_event_time_idx on public.event_lead_submissions(event_id, created_at desc);
create index if not exists event_lead_submissions_form_time_idx on public.event_lead_submissions(form_id, created_at desc);

alter table public.event_lead_forms enable row level security;
alter table public.event_lead_submissions enable row level security;
revoke all on public.event_lead_forms, public.event_lead_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.event_lead_forms to authenticated;

drop policy if exists event_lead_forms_member_manage on public.event_lead_forms;
create policy event_lead_forms_member_manage on public.event_lead_forms for all to authenticated
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create or replace function public.get_public_event_lead_form(p_event_id uuid, p_slug text)
returns table(id uuid, title text, description text, form_type text, fields jsonb, consent_label text)
language sql security definer set search_path = '' as $$
  select f.id, f.title, f.description, f.form_type, f.fields, f.consent_label
  from public.event_lead_forms f
  join public.events e on e.id = f.event_id
  where f.event_id = p_event_id and f.slug = lower(trim(p_slug))
    and f.published and e.status = 'published';
$$;

create or replace function public.submit_public_event_lead(
  p_event_id uuid,
  p_slug text,
  p_answers jsonb,
  p_consented boolean,
  p_campaign text default null,
  p_source text default null,
  p_medium text default null,
  p_referrer_host text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_form public.event_lead_forms; v_field jsonb; v_key text; v_value text; v_submission uuid;
begin
  select f.* into v_form from public.event_lead_forms f join public.events e on e.id=f.event_id
  where f.event_id=p_event_id and f.slug=lower(trim(p_slug)) and f.published and e.status='published';
  if not found then raise exception 'Formulario no disponible' using errcode='check_violation'; end if;
  if not p_consented then raise exception 'Debes aceptar el consentimiento para enviar tus datos' using errcode='check_violation'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Respuestas no válidas' using errcode='check_violation'; end if;
  for v_field in select value from jsonb_array_elements(v_form.fields) loop
    v_key := v_field->>'key'; v_value := nullif(trim(coalesce(p_answers->>v_key,'')), '');
    if coalesce((v_field->>'required')::boolean, false) and v_value is null then
      raise exception 'Completa el campo requerido: %', coalesce(v_field->>'label',v_key) using errcode='check_violation';
    end if;
    if v_field->>'type'='email' and v_value is not null and position('@' in v_value)<2 then
      raise exception 'Correo no válido' using errcode='check_violation';
    end if;
  end loop;
  insert into public.event_lead_submissions(organization_id,event_id,form_id,answers,consented_at,campaign,source,medium,referrer_host)
  values(v_form.organization_id,p_event_id,v_form.id,p_answers,now(),nullif(left(trim(coalesce(p_campaign,'')),100),''),nullif(left(trim(coalesce(p_source,'')),100),''),nullif(left(trim(coalesce(p_medium,'')),100),''),nullif(left(trim(coalesce(p_referrer_host,'')),255),'')) returning id into v_submission;
  return v_submission;
end;
$$;

create or replace function public.get_event_lead_submissions(p_event_id uuid, p_form_id uuid default null)
returns table(id uuid, form_id uuid, form_title text, answers jsonb, consented_at timestamptz, campaign text, source text, medium text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.events e where e.id=p_event_id and (public.is_org_member(e.organization_id) or public.is_platform_admin())) then
    raise exception 'No autorizado para este evento' using errcode='42501';
  end if;
  return query select s.id,s.form_id,f.title,s.answers,s.consented_at,s.campaign,s.source,s.medium,s.created_at
  from public.event_lead_submissions s join public.event_lead_forms f on f.id=s.form_id
  where s.event_id=p_event_id and (p_form_id is null or s.form_id=p_form_id) order by s.created_at desc;
end;
$$;

revoke all on function public.get_public_event_lead_form(uuid,text) from public;
revoke all on function public.submit_public_event_lead(uuid,text,jsonb,boolean,text,text,text,text) from public;
revoke all on function public.get_event_lead_submissions(uuid,uuid) from public, anon;
grant execute on function public.get_public_event_lead_form(uuid,text) to anon, authenticated;
grant execute on function public.submit_public_event_lead(uuid,text,jsonb,boolean,text,text,text,text) to anon, authenticated;
grant execute on function public.get_event_lead_submissions(uuid,uuid) to authenticated;
