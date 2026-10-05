-- Las funciones de trigger solo deben ejecutarse mediante sus triggers.
revoke all on function public.enforce_program_item_capacity_change(),public.validate_program_registration_entitlement() from public,anon,authenticated;
