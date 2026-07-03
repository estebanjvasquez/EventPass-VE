-- =====================================================================
-- Suscripciones y cobro manual (Zelle/Binance/Pago Móvil) con aprobación
-- por superadmin de la plataforma y enforcement de límites por plan.
-- =====================================================================

-- 1. CATÁLOGO DE PLANES (fuente única de límites) --------------------
create table if not exists public.plans (
  plan               public.org_plan primary key,
  name               text not null,
  price_usd          numeric(10, 2) not null,
  max_events         int,   -- null = ilimitado
  max_regs_per_event int,   -- null = ilimitado
  features           jsonb not null default '{}'::jsonb,
  sort_order         int not null default 0
);

insert into public.plans (plan, name, price_usd, max_events, max_regs_per_event, sort_order) values
  ('arranque',    'Arranque',    49,  1,    200,  1),
  ('profesional', 'Profesional', 99,  null, 1000, 2),
  ('asociacion',  'Asociación',  179, null, null, 3)
on conflict (plan) do update
  set name = excluded.name, price_usd = excluded.price_usd,
      max_events = excluded.max_events, max_regs_per_event = excluded.max_regs_per_event,
      sort_order = excluded.sort_order;

-- 2. SUPERADMINS DE LA PLATAFORMA ------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Siembra el superadmin inicial por correo (no-op si el usuario aún no existe).
insert into public.platform_admins (user_id)
select id from auth.users where email = 'estebanjvasquez@gmail.com'
on conflict (user_id) do nothing;

-- 3. MÉTODOS DE PAGO DE LA PLATAFORMA (donde pagan las organizaciones) --
create table if not exists public.platform_payment_methods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  details    jsonb not null default '{}'::jsonb,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4. PAGOS DE SUSCRIPCIÓN (comprobantes) -----------------------------
create table if not exists public.subscription_payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan            public.org_plan not null,
  amount_usd      numeric(10, 2) not null,
  method          text,
  reference       text,
  receipt_path    text,
  period_months   int not null default 1,
  status          text not null default 'pending',  -- pending | approved | rejected
  note            text,
  requested_by    uuid references auth.users(id),
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_subpay_org    on public.subscription_payments (organization_id);
create index if not exists idx_subpay_status on public.subscription_payments (status);

-- 5. ENFORCEMENT DE LÍMITES POR PLAN ---------------------------------
-- Se aplican como triggers BEFORE INSERT para cubrir TODAS las vías
-- (panel admin, RPCs públicas de registro, etc.).
create or replace function public.enforce_event_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  select p.max_events into v_max
  from public.organizations o join public.plans p on p.plan = o.plan
  where o.id = new.organization_id;

  if v_max is null then return new; end if; -- plan ilimitado

  select count(*) into v_count from public.events
  where organization_id = new.organization_id and status <> 'archived';

  if v_count >= v_max then
    raise exception 'Alcanzaste el límite de % evento(s) de tu plan. Mejora tu plan para crear más.', v_max
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_event_limit on public.events;
create trigger trg_event_limit before insert on public.events
  for each row execute function public.enforce_event_limit();

create or replace function public.enforce_registration_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  select p.max_regs_per_event into v_max
  from public.organizations o join public.plans p on p.plan = o.plan
  where o.id = new.organization_id;

  if v_max is null then return new; end if; -- plan ilimitado

  select count(*) into v_count from public.registrations where event_id = new.event_id;

  if v_count >= v_max then
    raise exception 'Este evento alcanzó el límite de % registros de su plan.', v_max
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_registration_limit on public.registrations;
create trigger trg_registration_limit before insert on public.registrations
  for each row execute function public.enforce_registration_limit();

-- 6. RPCs DEL FLUJO DE SUSCRIPCIÓN -----------------------------------
-- El owner/admin de una organización solicita un plan y adjunta comprobante.
create or replace function public.request_subscription(
  p_plan         public.org_plan,
  p_amount       numeric,
  p_method       text,
  p_reference    text,
  p_receipt_path text,
  p_months       int default 1
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select organization_id into v_org from public.memberships
  where user_id = auth.uid() and role in ('owner', 'admin') limit 1;
  if v_org is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  insert into public.subscription_payments
    (organization_id, plan, amount_usd, method, reference, receipt_path, period_months, requested_by)
  values
    (v_org, p_plan, p_amount, nullif(p_method, ''), nullif(p_reference, ''),
     nullif(p_receipt_path, ''), greatest(coalesce(p_months, 1), 1), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- El superadmin aprueba: activa el plan y extiende el período.
create or replace function public.approve_subscription_payment(p_payment_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_pay public.subscription_payments; v_end timestamptz; v_base timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_pay from public.subscription_payments where id = p_payment_id for update;
  if v_pay is null then raise exception 'Pago no encontrado' using errcode = 'no_data_found'; end if;
  if v_pay.status = 'approved' then raise exception 'Ya aprobado'; end if;

  -- Extiende desde el vencimiento vigente si aún no expiró.
  select greatest(coalesce(current_period_end, now()), now()) into v_base
  from public.subscriptions where organization_id = v_pay.organization_id
  order by current_period_end desc nulls last limit 1;
  v_end := coalesce(v_base, now()) + make_interval(months => v_pay.period_months);

  update public.subscription_payments
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id;

  -- Actualiza (o crea) la suscripción de la organización.
  if exists (select 1 from public.subscriptions where organization_id = v_pay.organization_id) then
    update public.subscriptions
      set plan = v_pay.plan, status = 'active', current_period_end = v_end
      where organization_id = v_pay.organization_id;
  else
    insert into public.subscriptions (organization_id, plan, status, current_period_end)
    values (v_pay.organization_id, v_pay.plan, 'active', v_end);
  end if;

  update public.organizations set plan = v_pay.plan, status = 'active'
    where id = v_pay.organization_id;

  return v_end;
end $$;

create or replace function public.reject_subscription_payment(p_payment_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.subscription_payments
    set status = 'rejected', note = nullif(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id and status = 'pending';
end $$;

-- 7. RLS --------------------------------------------------------------
alter table public.plans                    enable row level security;
alter table public.platform_admins          enable row level security;
alter table public.platform_payment_methods enable row level security;
alter table public.subscription_payments    enable row level security;

-- Planes: lectura pública (los muestra la landing y el panel).
create policy plans_public_read on public.plans
  for select to anon, authenticated using (true);

-- Métodos de pago de la plataforma: lectura para autenticados; gestión superadmin.
create policy ppm_read on public.platform_payment_methods
  for select to authenticated using (is_active or public.is_platform_admin());
create policy ppm_admin_all on public.platform_payment_methods
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Superadmins: solo un superadmin ve la tabla.
create policy platadmin_read on public.platform_admins
  for select to authenticated using (public.is_platform_admin());

-- Pagos de suscripción: la org ve los suyos; el superadmin ve todos y los gestiona.
create policy subpay_org_read on public.subscription_payments
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy subpay_admin_all on public.subscription_payments
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 8. GRANTS DE EJECUCIÓN ---------------------------------------------
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.request_subscription(public.org_plan, numeric, text, text, text, int) to authenticated;
grant execute on function public.approve_subscription_payment(uuid) to authenticated;
grant execute on function public.reject_subscription_payment(uuid, text) to authenticated;

-- 9. STORAGE: bucket privado de comprobantes de suscripción ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subs', 'subs', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Ruta: <organization_id>/<archivo>. Inserta un miembro de la org; leen
-- los miembros de esa org y cualquier superadmin.
create policy subs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'subs'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );
create policy subs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'subs'
    and (public.is_platform_admin() or public.is_org_member(((storage.foldername(name))[1])::uuid))
  );
