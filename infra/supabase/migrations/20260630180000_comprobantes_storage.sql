-- EventPass VE — Carga de comprobantes de pago
-- ----------------------------------------------------------------------
-- El asistente llega por un enlace con su `credential_token` (sin sesión).
-- Como NO hay lectura/escritura pública sobre `registrations` (privacidad),
-- la resolución del registro y el guardado del comprobante se hacen vía
-- funciones `security definer` que validan el token. El archivo vive en un
-- bucket privado de Storage; solo los miembros de la organización lo leen.

-- =====================================================================
-- 1. BUCKET PRIVADO DE STORAGE
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  5242880,  -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =====================================================================
-- 2. POLÍTICAS DE STORAGE (storage.objects ya tiene RLS habilitado)
-- Convención de ruta: <organization_id>/<registration_id>/<archivo>
-- =====================================================================

-- Subida pública (anon) al bucket. El archivo queda "huérfano" hasta que
-- `submit_comprobante` lo asocia a un registro válido por token.
drop policy if exists comprobantes_public_insert on storage.objects;
create policy comprobantes_public_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'comprobantes');

-- Lectura: solo miembros de la organización dueña (primer segmento de la ruta).
drop policy if exists comprobantes_member_read on storage.objects;
create policy comprobantes_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and public.is_org_member( (storage.foldername(name))[1]::uuid )
  );

-- Mantenimiento (reemplazo/borrado) por miembros de la organización.
drop policy if exists comprobantes_member_write on storage.objects;
create policy comprobantes_member_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'comprobantes'
    and public.is_org_member( (storage.foldername(name))[1]::uuid )
  )
  with check (
    bucket_id = 'comprobantes'
    and public.is_org_member( (storage.foldername(name))[1]::uuid )
  );

-- =====================================================================
-- 3. RPC: resolver registro por token (datos mínimos y seguros)
-- =====================================================================
create or replace function public.get_registration_by_token(p_token text)
returns table (
  registration_id  uuid,
  organization_id  uuid,
  event_id         uuid,
  first_name       text,
  status           public.registration_status,
  has_comprobante  boolean,
  payment_deadline timestamptz,
  event_name       text
)
language sql stable security definer set search_path = public as $$
  select
    r.id,
    r.organization_id,
    r.event_id,
    r.first_name,
    r.status,
    (r.comprobante_path is not null),
    r.payment_deadline,
    e.name
  from public.registrations r
  join public.events e on e.id = r.event_id
  where r.credential_token = p_token;
$$;

revoke all on function public.get_registration_by_token(text) from public;
grant execute on function public.get_registration_by_token(text) to anon, authenticated;

-- =====================================================================
-- 4. RPC: guardar comprobante por token
-- =====================================================================
create or replace function public.submit_comprobante(
  p_token    text,
  p_path     text,
  p_method   text    default null,
  p_amount   numeric default null,
  p_currency text    default 'USD'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reg public.registrations%rowtype;
begin
  select * into v_reg
  from public.registrations
  where credential_token = p_token;

  if not found then
    raise exception 'Registro no encontrado' using errcode = 'no_data_found';
  end if;

  if v_reg.status = 'confirmed' then
    raise exception 'Este registro ya está confirmado' using errcode = 'check_violation';
  end if;

  -- La ruta debe pertenecer a la organización del registro (evita asociar
  -- un archivo de otra organización).
  if (storage.foldername(p_path))[1] <> v_reg.organization_id::text then
    raise exception 'Ruta de comprobante inválida' using errcode = 'check_violation';
  end if;

  update public.registrations
  set comprobante_path     = p_path,
      payment_method       = coalesce(p_method, payment_method),
      payment_amount       = coalesce(p_amount, payment_amount),
      payment_currency     = coalesce(p_currency, payment_currency),
      status               = 'payment_submitted',
      payment_submitted_at = now()
  where id = v_reg.id;
end;
$$;

revoke all on function public.submit_comprobante(text, text, text, numeric, text) from public;
grant execute on function public.submit_comprobante(text, text, text, numeric, text) to anon, authenticated;
