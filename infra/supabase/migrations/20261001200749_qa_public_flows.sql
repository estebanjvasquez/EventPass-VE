-- A visit to a shared program landing can finish through its promoted event's
-- individual registration. The event and the 30-minute expiry remain enforced.
create or replace function public.register_event_attributed_purchase(p_event_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text,p_cedula text default null,p_seat_id uuid default null,p_category_id uuid default null,p_visit_id uuid default null)
returns table(registration_id uuid,registration_status public.registration_status,credential_token text,payment_required boolean)
language plpgsql security definer set search_path='' as $$
declare v public.event_funnel_visits; r record;
begin
 select * into v from public.event_funnel_visits where id=p_visit_id and event_id=p_event_id and created_at>=now()-interval '30 minutes' for update;
 select * into r from public.register_event_purchase(p_event_id,p_first_name,p_last_name,p_email,p_phone,p_cedula,p_seat_id,v.campaign,v.source,v.medium,p_category_id);
 if v.id is not null and v.completed_at is null then update public.event_funnel_visits set form_at=coalesce(form_at,now()),completed_at=now(),registration_id=r.registration_id where id=v.id; end if;
 return query select r.registration_id,r.registration_status,r.credential_token,r.payment_required;
end $$;
revoke all on function public.register_event_attributed_purchase(uuid,text,text,text,text,text,uuid,uuid,uuid) from public;
grant execute on function public.register_event_attributed_purchase(uuid,text,text,text,text,text,uuid,uuid,uuid) to anon,authenticated;
