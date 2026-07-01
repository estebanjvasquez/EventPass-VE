-- EventPass VE — Credencial por token
-- ----------------------------------------------------------------------
-- Devuelve los datos para renderizar la credencial (con QR) del asistente.
-- Solo tiene sentido para registros confirmados; el frontend valida el estado.
-- security definer porque no hay lectura pública de registrations.

create or replace function public.get_credential_by_token(p_token text)
returns table (
  first_name       text,
  last_name        text,
  status           public.registration_status,
  event_name       text,
  event_start      timestamptz,
  org_name         text,
  seat_label       text,
  credential_token text
)
language sql stable security definer set search_path = public as $$
  select
    r.first_name,
    r.last_name,
    r.status,
    e.name,
    e.start_date,
    o.name,
    coalesce(s.seat_number, nullif(concat_ws('', s.row_label, s.column_number::text), '')),
    r.credential_token
  from public.registrations r
  join public.events e        on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  left join public.seats s    on s.id = r.seat_id
  where r.credential_token = p_token;
$$;

revoke all on function public.get_credential_by_token(text) from public;
grant execute on function public.get_credential_by_token(text) to anon, authenticated;
