-- Una sesion opcional paga no debe ocultar el formulario de un taller base gratuito.
-- El participante primero elige la sesion; el checkout decide si genera pago pendiente.
create or replace function public.get_public_event_registration_state(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; v_paid boolean; v_base_paid boolean; v_categories boolean; v_price_known boolean; v_payment_methods boolean; v_session_offer boolean; v_session_paid boolean; v_reason text;
begin
  select * into e from public.events where id=p_event_id and status='published';
  if e.id is null then return jsonb_build_object('available',false,'reason','El evento no esta disponible.'); end if;
  v_base_paid:=coalesce(e.config->>'registration_mode','paid')='paid'; v_paid:=v_base_paid; v_categories:=coalesce((e.config->>'ticket_categories_enabled')::boolean,false);
  select exists(select 1 from public.event_ticket_categories c where c.event_id=e.id and c.published and (c.sales_start is null or c.sales_start<=now()) and (c.sales_end is null or c.sales_end>now())) into v_price_known;
  if not v_categories then v_price_known:=nullif(e.config->>'price','') is not null or exists(select 1 from public.seats s where s.event_id=e.id and s.status='available' and s.price is not null); end if;
  select exists(select 1 from public.event_sessions s where s.event_id=e.id and s.status='scheduled' and s.registration_policy in ('included','optional_free','optional_paid')),exists(select 1 from public.event_sessions s where s.event_id=e.id and s.status='scheduled' and s.registration_policy='optional_paid' and s.price>0) into v_session_offer,v_session_paid;
  if e.event_type='workshop' and v_session_offer and not v_price_known then v_paid:=v_session_paid; v_price_known:=true; end if;
  select exists(select 1 from public.payment_methods p where p.organization_id=e.organization_id and p.is_active and (p.event_id is null or p.event_id=e.id)) into v_payment_methods;
  v_reason:=case
    when e.end_date is not null and e.end_date<=now() then 'Este evento ya finalizo.'
    when e.registration_deadline is not null and e.registration_deadline<=now() then 'El plazo de registro termino.'
    when coalesce(e.config->>'registration_mode','paid')='invitation' then 'El acceso a este evento es por invitacion.'
    when v_base_paid and not v_price_known then 'El organizador todavia debe definir el precio.'
    when v_base_paid and not v_payment_methods then 'El organizador todavia debe activar un metodo de pago.'
    else null end;
  return jsonb_build_object('available',v_reason is null,'reason',v_reason,'payment_required',v_paid,'price_known',not v_paid or v_price_known,'payment_methods_ready',not v_paid or v_payment_methods);
end $$;
notify pgrst,'reload schema';
