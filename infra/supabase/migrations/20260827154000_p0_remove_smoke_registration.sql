-- Limpieza determinista del registro efímero usado para validar la RPC P0.
delete from public.registrations
where event_id = '276e4d25-b107-4393-9530-542db8ed03a3'
  and email = 'qa-p0-cleanup-20260827@example.invalid';
