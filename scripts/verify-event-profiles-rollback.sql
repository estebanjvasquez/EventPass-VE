-- Append after the migration inside BEGIN ... ROLLBACK. No emails or auth users.
do $qa$
declare actor uuid;org uuid:=gen_random_uuid();p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();pass1 uuid:=gen_random_uuid();pass2 uuid:=gen_random_uuid();item1 uuid:=gen_random_uuid();item2 uuid:=gen_random_uuid();a uuid;b uuid;
begin
 select user_id into actor from public.platform_admins limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.organizations(id,slug,name,status) values(org,'qa-profiles-'||replace(org::text,'-',''),'QA perfiles aislados','active');
 update public.commercial_contracts set status='cancelled' where organization_id=org;
 insert into public.commercial_contracts(organization_id,modality,plan,starts_at,ends_at,capabilities,limits,terms_version,reason)
 values(org,'monthly','asociacion',now()-interval '1 minute',now()+interval '1 day','{"core":true,"programs":true,"exposure":true,"sponsorship":true}','{"events":5,"participants_event":10,"participants_month":10}','QA rollback','Synthetic profile isolation; rolled back');
 insert into public.event_programs(id,organization_id,name,status) values(p1,org,'Programa A','published'),(p2,org,'Programa B','published');
 insert into public.passes(id,program_id,name,access_mode,is_public) values(pass1,p1,'Pase A','program',true),(pass2,p2,'Pase B','program',true);
 update public.event_programs set registration_config='{"registration_mode":"combined"}' where id in(p1,p2);
 insert into public.program_registration_items(id,program_id,name) values(item1,p1,'Acceso A'),(item2,p2,'Acceso B');
 perform set_config('request.jwt.claim.sub','',true);
 perform public.register_program_participant(p1,null,pass1,'Nombre A','QA','same@example.invalid','');
 perform public.register_program_participant(p2,null,pass2,'Nombre B','QA','same@example.invalid','');
 select id into a from public.people where registration_program_id=p1 and email='same@example.invalid';
 select id into b from public.people where registration_program_id=p2 and email='same@example.invalid';
 if a is null or b is null or a=b then raise exception 'Program identities are not isolated';end if;
 if (select first_name from public.people where id=a)<>'Nombre A' then raise exception 'A different program overwrote the profile';end if;
 perform public.register_program_participant(p1,null,pass1,'Nombre A actualizado','QA','same@example.invalid','');
 if (select first_name from public.people where id=b)<>'Nombre B' then raise exception 'A retry overwrote an unrelated profile';end if;
 perform public.register_program_selection(p1,array[item1],'Selección A','QA','selection@example.invalid','');
 perform public.register_program_selection(p2,array[item2],'Selección B','QA','selection@example.invalid','');
 if (select count(*) from public.people where email='selection@example.invalid' and registration_program_id in(p1,p2))<>2 then raise exception 'Composable checkout shares identities across programs';end if;
end $qa$;
select jsonb_build_object('real_program_registration_isolated',true,'transaction_will_rollback',true);
