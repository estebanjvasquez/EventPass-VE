-- El mismo cupo protege registros directos y compras del programa.
create or replace function public.enforce_session_reservation_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.event_sessions; reserved integer;
begin
  if new.status not in ('pending_payment','confirmed','checked_in') then return new; end if;
  if tg_op='UPDATE' and old.status in ('pending_payment','confirmed','checked_in') then return new; end if;
  select * into s from public.event_sessions where id=new.session_id for update;
  if s.capacity is null then return new; end if;
  reserved:=public.event_session_reserved_count(new.session_id);
  if reserved>=s.capacity then raise exception 'La sesion % alcanzo su cupo',s.name; end if;
  return new;
end $$;
drop trigger if exists enforce_session_reservation_capacity on public.session_reservations;
create trigger enforce_session_reservation_capacity before insert or update of status on public.session_reservations for each row execute function public.enforce_session_reservation_capacity();
revoke all on function public.enforce_session_reservation_capacity() from public,anon,authenticated;
notify pgrst,'reload schema';
