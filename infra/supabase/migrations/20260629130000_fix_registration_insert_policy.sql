-- Fix: la política de INSERT público de registrations fallaba porque la
-- subconsulta anidada (con RLS de events para anon) y la referencia
-- 'registrations.organization_id' dentro del WITH CHECK no se resolvían como
-- se esperaba, rechazando registros válidos (SQLSTATE 42501).
--
-- Solución: encapsular la validación en una función security definer (omite RLS
-- de events de forma controlada) y llamarla con las columnas de la fila nueva.

create or replace function public.event_accepts_registration(ev uuid, org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = ev
      and e.organization_id = org
      and e.status = 'published'
  );
$$;

drop policy if exists reg_public_insert on public.registrations;

create policy reg_public_insert on public.registrations
  for insert to anon, authenticated
  with check (public.event_accepts_registration(event_id, organization_id));
