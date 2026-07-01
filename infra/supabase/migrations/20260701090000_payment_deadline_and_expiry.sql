-- EventPass VE — Plazo de pago (payment_deadline)
-- ----------------------------------------------------------------------
-- Fija el plazo de pago al crear un registro, a partir de payment_timeout_days
-- del evento. Se hace en un trigger BEFORE INSERT para que aplique también al
-- alta pública (anon), que no puede/debe fijar el plazo por sí misma.
-- La expiración de plazas y los recordatorios los ejecuta el cron del Worker.

create or replace function public.set_payment_deadline()
returns trigger language plpgsql as $$
declare
  v_days int;
begin
  if new.payment_deadline is null then
    select payment_timeout_days into v_days
    from public.events where id = new.event_id;
    new.payment_deadline := now() + make_interval(days => coalesce(v_days, 10));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reg_payment_deadline on public.registrations;
create trigger trg_reg_payment_deadline
  before insert on public.registrations
  for each row execute function public.set_payment_deadline();

-- Respaldo: registros pendientes ya existentes sin plazo definido.
update public.registrations r
set payment_deadline = r.created_at + make_interval(days => coalesce(e.payment_timeout_days, 10))
from public.events e
where r.event_id = e.id
  and r.payment_deadline is null
  and r.status = 'pending_payment';
