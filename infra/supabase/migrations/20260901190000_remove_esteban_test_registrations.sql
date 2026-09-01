-- Limpieza solicitada de participantes de prueba. Se limita deliberadamente a
-- coincidencias insensibles a mayúsculas en nombre, apellido o correo.
do $$
declare
  v_registration_ids uuid[];
  v_seat_ids uuid[];
begin
  select coalesce(array_agg(r.id), '{}'::uuid[]),
         coalesce(array_agg(r.seat_id) filter (where r.seat_id is not null), '{}'::uuid[])
    into v_registration_ids, v_seat_ids
  from public.registrations r
  where coalesce(r.first_name, '') ilike '%esteban%'
     or coalesce(r.last_name, '') ilike '%esteban%'
     or coalesce(r.email, '') ilike '%esteban%';

  if cardinality(v_registration_ids) = 0 then
    return;
  end if;

  -- Conservamos la coherencia de las estadísticas y del historial de prueba.
  delete from public.exhibitor_stand_visits where registration_id = any(v_registration_ids);
  delete from public.participant_profile_consents where registration_id = any(v_registration_ids);
  delete from public.session_reservations where registration_id = any(v_registration_ids);
  delete from public.checkin_records where registration_id = any(v_registration_ids);
  delete from public.accreditation_service_sessions where registration_id = any(v_registration_ids);
  delete from public.badge_identity_audit where registration_id = any(v_registration_ids);
  delete from public.badge_print_logs where registration_id = any(v_registration_ids);
  delete from public.email_log where registration_id = any(v_registration_ids);
  delete from public.admin_actions where registration_id = any(v_registration_ids);

  -- Sólo asientos sin reserva institucional: nunca alteramos cupos reservados.
  update public.seats
     set status = 'available'::public.seat_status
   where id = any(v_seat_ids)
     and reservation_category_id is null;

  delete from public.registrations where id = any(v_registration_ids);
end
$$;
