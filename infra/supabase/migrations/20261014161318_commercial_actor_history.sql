-- Preserve commercial history without blocking the existing authorized account
-- deletion workflow. User references are optional once the actor is removed.
alter table public.commercial_audit add column if not exists actor_identity jsonb not null default '{}';
alter table public.subscription_quotes add column if not exists requester_identity jsonb not null default '{}';
alter table public.commercial_acceptances add column if not exists acceptor_identity jsonb not null default '{}';
update public.subscription_quotes set requester_identity=jsonb_build_object('user_id',requested_by) where requested_by is not null and requester_identity='{}';
update public.commercial_acceptances set acceptor_identity=jsonb_build_object('user_id',user_id) where user_id is not null and acceptor_identity='{}';
update public.commercial_audit set actor_identity=jsonb_build_object('user_id',actor_id) where actor_id is not null and actor_identity='{}';
create or replace function commercial_private.stamp_actor_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.actor_identity='{}' then new.actor_identity:=case when new.actor_id is null then jsonb_build_object('origin','service') else jsonb_build_object('user_id',new.actor_id) end; end if;
 return new;
end $$;
drop trigger if exists commercial_actor_identity on public.commercial_audit;
create trigger commercial_actor_identity before insert on public.commercial_audit for each row execute function commercial_private.stamp_actor_identity();
create or replace function commercial_private.stamp_commercial_principal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='subscription_quotes' then
 if new.requester_identity='{}' then new.requester_identity:=jsonb_build_object('user_id',new.requested_by); end if;
 else
 if new.acceptor_identity='{}' then new.acceptor_identity:=jsonb_build_object('user_id',new.user_id); end if;
 end if;
 return new;
end $$;
drop trigger if exists commercial_requester_identity on public.subscription_quotes;
create trigger commercial_requester_identity before insert on public.subscription_quotes for each row execute function commercial_private.stamp_commercial_principal();
drop trigger if exists commercial_acceptor_identity on public.commercial_acceptances;
create trigger commercial_acceptor_identity before insert on public.commercial_acceptances for each row execute function commercial_private.stamp_commercial_principal();

do $$declare r record; begin
 for r in select con.conrelid::regclass relation,con.conname,a.attname column_name
 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=con.conrelid and a.attnum=con.conkey[1]
 where con.contype='f' and con.confrelid='auth.users'::regclass and array_length(con.conkey,1)=1
 and n.nspname='public' and c.relname in('commercial_contracts','subscription_quotes','commercial_audit','platform_commercial_leads','support_tickets','commercial_acceptances') loop
 execute format('alter table %s alter column %I drop not null',r.relation,r.column_name);
 execute format('alter table %s drop constraint %I',r.relation,r.conname);
 execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null',r.relation,r.conname,r.column_name);
 end loop;
 for r in select con.conrelid::regclass relation,con.conname,a.attname column_name
 from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attnum=con.conkey[1]
 where con.contype='f' and con.confrelid='auth.users'::regclass and con.conrelid='commercial_private.mail_outbox'::regclass loop
 execute format('alter table %s drop constraint %I',r.relation,r.conname);
 execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete cascade',r.relation,r.conname,r.column_name);
 end loop;
end $$;
revoke all on all functions in schema commercial_private from public,anon,authenticated;

create or replace function public.submit_subscription_quote(p_quote uuid,p_method_id uuid,p_reference text,p_receipt_path text) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.subscription_quotes; m public.platform_payment_methods; v_id uuid;
begin
 select * into q from public.subscription_quotes where id=p_quote for update;
 if q.id is null or not commercial_private.can_manage(q.organization_id) or q.requested_by is distinct from auth.uid() then raise exception 'No autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(q.organization_id::text,3));
 if not exists(select 1 from public.commercial_acceptances where user_id=auth.uid() and organization_id=q.organization_id and terms_version='2026-10-14' and privacy_version='2026-10-14') then raise exception 'Acepta las condiciones vigentes antes de enviar el pago'; end if;
 if q.expires_at<now() then raise exception 'La cotización expiró; cotiza de nuevo'; end if;
 if exists(select 1 from public.subscription_payments where organization_id=q.organization_id and status='pending') then raise exception 'Ya hay un pago en revisión'; end if;
 select * into m from public.platform_payment_methods where id=p_method_id and is_active;
 if m.id is null then raise exception 'Selecciona un medio de pago activo'; end if;
 if length(coalesce(trim(p_reference),'')) not between 3 and 200 then raise exception 'Indica la referencia de pago'; end if;
 if p_receipt_path is null or split_part(p_receipt_path,'/',1)<>q.organization_id::text or not exists(select 1 from storage.objects where bucket_id='subs' and name=p_receipt_path) then raise exception 'Comprobante inválido para esta organización'; end if;
 insert into public.subscription_payments(organization_id,plan,amount_usd,method,method_id,reference,receipt_path,period_months,requested_by,quote_id)
 values(q.organization_id,q.plan,q.amount_usd,m.name,m.id,trim(p_reference),p_receipt_path,q.period_months,auth.uid(),q.id) returning id into v_id;
 insert into public.commercial_notifications(organization_id,payment_id,message) values(q.organization_id,v_id,'Comprobante recibido. Consulta aquí la revisión y resolución; plazo objetivo: un día laboral.');
 return v_id;
end $$;


notify pgrst,'reload schema';
