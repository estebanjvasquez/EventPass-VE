-- =====================================================================
-- Superadmin: gestión total (no solo lectura) de lo relacionado a cada
-- cliente, para poder administrar sus eventos como si fuera el cliente:
-- asientos, registros/participantes, métodos de pago, y bitácora.
--
-- Sustituye las políticas de solo-lectura de plataforma por políticas FOR ALL.
-- =====================================================================

drop policy if exists seat_platform_read on public.seats;
drop policy if exists seat_platform_all on public.seats;
create policy seat_platform_all on public.seats
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists reg_platform_read on public.registrations;
drop policy if exists reg_platform_all on public.registrations;
create policy reg_platform_all on public.registrations
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists pm_platform_read on public.payment_methods;
drop policy if exists pm_platform_all on public.payment_methods;
create policy pm_platform_all on public.payment_methods
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Bitácora y correos: gestión total para el superadmin (por si el flujo de
-- confirmación registra acciones al operar como cliente).
drop policy if exists aa_platform_all on public.admin_actions;
create policy aa_platform_all on public.admin_actions
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists elog_platform_all on public.email_log;
create policy elog_platform_all on public.email_log
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
