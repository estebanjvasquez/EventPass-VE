-- Read-only audit: one result set, no participant data.
select jsonb_build_object(
'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations where version >= '20261007000000'),
'functions',(select jsonb_agg(to_jsonb(f)) from (select p.proname, pg_get_functiondef(p.oid) as definition,
  has_function_privilege('anon',p.oid,'execute') as anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
('prepare_badge_print_job','update_badge_print_job','manage_badge_print_job','create_badge_print_batch',
'confirm_event_badge','create_walk_in_badge','get_event_badge_by_token','record_accreditation_service')) f),
'policies',(select jsonb_agg(to_jsonb(p)) from (select tablename,policyname,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename like 'badge_%') p),
'jobs',(select jsonb_agg(to_jsonb(j)) from (select status,fulfillment_mode,count(*) as jobs,
  count(*) filter(where queued_at < now()-interval '1 hour') as older_than_hour
from public.badge_print_jobs group by status,fulfillment_mode) j),
'batches',(select jsonb_agg(to_jsonb(b)) from (select status,count(*) as batches,sum(total_jobs) as total_jobs,sum(queued_jobs) as pending_jobs
from public.badge_print_batches group by status) b)) as audit;
