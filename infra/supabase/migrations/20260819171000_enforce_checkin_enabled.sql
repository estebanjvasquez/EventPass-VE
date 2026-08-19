-- El interruptor de check-in se aplica a cualquier ruta de escritura.
create or replace function public.enforce_event_checkin_enabled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select (config->>'checkin_enabled')::boolean from public.events where id = new.event_id), true) is false then
    raise exception 'El check-in está desactivado para este evento.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_checkin_enabled on public.checkin_records;
create trigger trg_checkin_enabled before insert on public.checkin_records
for each row execute function public.enforce_event_checkin_enabled();
