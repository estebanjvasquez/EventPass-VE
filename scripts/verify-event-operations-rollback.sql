-- Run only inside an explicit transaction that ends in ROLLBACK.
-- Synthetic organization, no auth users created, no email/network functions invoked.
do $qa$
declare admin_id uuid;org_id uuid:=gen_random_uuid();event_id uuid:=gen_random_uuid();social_id uuid:=gen_random_uuid();a jsonb;b jsonb;r jsonb;h jsonb;m jsonb;secret text;
begin
 select p.user_id into admin_id from public.platform_admins p where not exists(select 1 from public.platform_user_controls c where c.user_id=p.user_id and c.suspended_at is not null) limit 1;
 if admin_id is null then raise exception 'QA needs an existing active platform administrator';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.organizations(id,slug,name,status) values(org_id,'qa-rollback-'||replace(org_id::text,'-',''),'QA rollback invitaciones','active');
 update public.commercial_contracts set status='cancelled' where organization_id=org_id;
 insert into public.commercial_contracts(organization_id,modality,plan,starts_at,ends_at,capabilities,limits,terms_version,reason)
 values(org_id,'monthly','asociacion',now()-interval '1 minute',now()+interval '1 day','{"core":true,"programs":true,"exposure":true,"sponsorship":true}','{"events":3,"participants_event":10,"participants_month":10}','QA rollback','Synthetic verification, rolled back');
 insert into public.events(id,organization_id,name,event_type,status,total_slots,config) values(event_id,org_id,'QA Expo rollback','exhibition','published',10,'{"registration_mode":"invitation"}'),(social_id,org_id,'QA Social rollback','social','published',10,'{"registration_mode":"invitation"}');
 perform public.event_operations_command(event_id,'settings','{"capacity_policy":"redeem","private_listing":true}');
 a:=public.event_operations_command(event_id,'allocation','{"name":"QA invitador","kind":"organizer","quantity":2,"rights":["exhibition"]}');
 b:=public.event_operations_command(event_id,'issue',jsonb_build_object('allocation_id',a->>'id','quantity',1));secret:=b->'codes'->0->>'code';
 perform set_config('request.jwt.claim.sub','',true);
 r:=public.redeem_event_invitation(event_id,secret,repeat('a',64),'QA','Rollback','qa-'||org_id::text||'@example.invalid','');
 if not exists(select 1 from public.registrations where id=(r->>'registration_id')::uuid and status='confirmed' and purchase_snapshot->>'invitation_id' is not null and purchase_snapshot->>'amount'='0') then raise exception 'QA invitation snapshot was not retained';end if;
 if public.get_invitation_credential_details(r->>'credential_token')->'rights' <> '["exhibition"]'::jsonb then raise exception 'QA credential rights mismatch';end if;
 if public.event_public_visible(event_id) then raise exception 'QA private event visible anonymously';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.event_operations_command(event_id,'cancel_registration',jsonb_build_object('id',b->'codes'->0->>'id','reason','QA cancelación'));
 perform public.event_operations_command(event_id,'resume_registration',jsonb_build_object('id',b->'codes'->0->>'id'));
 perform public.event_operations_command(social_id,'settings','{"capacity_policy":"issue","private_listing":true}');
 h:=public.event_operations_command(social_id,'household','{"name":"Hogar QA","contact_name":"Contacto QA","quantity":2}');
 m:=public.event_operations_command(social_id,'member',jsonb_build_object('household_id',h->>'id','first_name','Integrante QA'));
 perform set_config('request.jwt.claim.sub','',true);
 perform public.social_household_access(social_id,h->>'code',(m->>'id')::uuid,'accepted');
 if not exists(select 1 from public.registrations reg where reg.event_id=social_id and reg.email is null and reg.status='confirmed') then raise exception 'QA social identity without email failed';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.event_operations_command(social_id,'budget',jsonb_build_object('title','Partida QA','kind','expense','stage','paid','amount',5000,'currency','VES','ves_per_usd',100,'rate_source','Tasa de ensayo','rate_date',current_date,'request_key',gen_random_uuid()));
 if not exists(select 1 from public.event_organizer_budget budget where budget.event_id=social_id and budget.amount/budget.ves_per_usd=50) then raise exception 'QA historical FX mismatch';end if;
end $qa$;
select jsonb_build_object('real_schema_verification',true,'synthetic_only',true,'transaction_will_rollback',true);
