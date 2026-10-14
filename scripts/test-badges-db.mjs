import assert from 'node:assert/strict';
import {badgeFixture,org,event,otherEvent,registration,template,station,otherStation} from './badge-db-fixture.mjs';
const {db,q,one}=await badgeFixture();
const prepare=(record=registration,reason=null)=>one("select * from prepare_badge_print_job($1,'registration',$2,$3,'QA','QA Printer',$4,1,$5::jsonb)",[event,record,template,reason,JSON.stringify({stationKey:station})]);
const status=(job,next)=>q('select update_badge_print_job($1,$2)',[job,next]);
const print=async job=>{await status(job,'rendering');await status(job,'sent');await status(job,'spooled')};
let checks=0;const pass=text=>{checks++;console.log(`PASS: ${text}`)};
try {
  await assert.rejects(()=>q("select * from prepare_badge_print_job($1,'registration',$2,$3,'QA','QA Printer')",[otherEvent,registration,template]),/No autorizado/);
  await assert.rejects(()=>q("select confirm_event_badge('registration',$1,$2)",[registration,otherEvent]),/No autorizado/);
  await q("select set_config('qa.scope','false',false)");
  for(const sql of ["select confirm_event_badge('registration',$1)","select cancel_event_badge('registration',$1,'QA')","select update_event_badge_identity('registration',$1,'QA','','','','')","select record_accreditation_service('registration',$1,'failed',100)"])
    await assert.rejects(()=>q(sql,[registration]),/No autorizado/);
  await assert.rejects(()=>q("select * from create_walk_in_badge($1,'QA','','','','','','')",[event]),/No autorizado/);
  await q("select set_config('qa.scope','true',false)");pass('All mutations enforce event printing scope');
  const foreign=await one("insert into registrations(organization_id,event_id,first_name) values($1,$2,'Foreign QA') returning credential_token",[org,otherEvent]);
  assert.equal((await q('select * from get_event_badge_for_print($1,$2)',[event,foreign.credential_token])).length,0);
  const program=await one('insert into event_programs(id,organization_id) values(gen_random_uuid(),$1) returning id',[org]);
  const person=await one("insert into people(id,first_name) values(gen_random_uuid(),'Program QA') returning id");
  const participation=await one("insert into event_participations(id,program_id,person_id,status,credential_token,participation_type) values(gen_random_uuid(),$1,$2,'approved','program-token','attendee') returning id",[program.id,person.id]);
  const order=await one("insert into program_registration_orders(id,participation_id,status) values(gen_random_uuid(),$1,'confirmed') returning id",[participation.id]);
  const item=await one('insert into program_registration_order_items(order_id,item_id) values($1,gen_random_uuid()) returning item_id',[order.id]);
  await q('insert into program_registration_entitlements(item_id,event_id) values($1,$2)',[item.item_id,event]);
  assert.equal((await q("select * from get_event_badge_for_print($1,'program-token')",[event])).length,1);
  const programJob=await one("select * from prepare_badge_print_job($1,'participation',$2,$3,'QA','QA Printer')",[event,participation.id,template]);
  await print(programJob.job_id);await status(programJob.job_id,'delivered');
  assert.equal(Number((await one('select count(*) n from checkin_records where participation_id=$1 and event_id=$2',[participation.id,event])).n),1);
  await q("update program_registration_orders set status='pending_payment' where id=$1",[order.id]);
  assert.equal((await q("select * from get_event_badge_for_print($1,'program-token')",[event])).length,0);
  pass('QR lookup is event-bound and program entitlements require confirmed orders');
  await q("update registrations set status='pending_payment' where id=$1",[registration]);await assert.rejects(prepare,/no esta confirmada/);
  await q("select confirm_event_badge('registration',$1,$2)",[registration,event]);
  const first=await prepare();await assert.rejects(prepare,/trabajo pendiente/);await assert.rejects(()=>status(first.job_id,'delivered'),/Transicion/);
  await assert.rejects(()=>q("select record_accreditation_service('registration',$1,'delivered',100)",[registration]),/requiere un trabajo impreso/);
  await print(first.job_id);await status(first.job_id,'spooled');
  assert.equal(Number((await one('select count(*) n from badge_print_logs where print_job_id=$1',[first.job_id])).n),1);
  assert.equal((await one('select attendance_status from registrations where id=$1',[registration])).attendance_status,'checked_in');
  await status(first.job_id,'delivered');await status(first.job_id,'delivered');await assert.rejects(()=>status(first.job_id,'sent'),/Transicion/);
  await q("select record_accreditation_service('registration',$1,'delivered',100)",[registration]);
  assert.equal(Number((await one("select count(*) n from accreditation_service_sessions where print_job_id=$1 and outcome='delivered'",[first.job_id])).n),1);
  pass('Pending deduplication, state machine, idempotent log and atomic delivery metrics');
  const reprint=await prepare(registration,'QA reprint');assert.notEqual(reprint.credential_token,'original-token');
  assert.equal((await one('select credential_token from registrations where id=$1',[registration])).credential_token,'original-token');
  await status(reprint.job_id,'failed');assert.equal((await one('select credential_token from registrations where id=$1',[registration])).credential_token,'original-token');
  const retry=await one("select manage_badge_print_job($1,'retry') id",[reprint.job_id]);const replacement=await one('select * from badge_print_jobs where id=$1',[retry.id]);
  await print(retry.id);assert.equal((await one('select credential_token from registrations where id=$1',[registration])).credential_token,replacement.credential_token_snapshot);
  await status(retry.id,'delivered');await assert.rejects(()=>q("select manage_badge_print_job($1,'retry')",[reprint.job_id]),/ya tiene un reintento/);
  pass('Failed reprint preserves old QR; accepted replacement activates its provisional QR');
  const extra=await one("insert into registrations(organization_id,event_id,first_name) values($1,$2,'Batch QA') returning id",[org,event]);
  const batch=await one("select * from create_badge_print_batch($1,'QA',$2::jsonb,'QA','QA Printer',$3::jsonb)",[event,JSON.stringify([{id:extra.id,record_type:'registration'}]),JSON.stringify({stationKey:station})]);
  await status(batch.job_id,'rendering');await status(batch.job_id,'failed');const retried=await one("select manage_badge_print_job($1,'retry') id",[batch.job_id]);
  const r=await one('select * from badge_print_jobs where id=$1',[retried.id]);assert.equal(r.fulfillment_mode,'preprint');assert.equal(r.batch_id,batch.batch_id);assert.equal(r.batch_sequence,batch.batch_sequence);
  await print(retried.id);assert.equal((await one('select attendance_status from registrations where id=$1',[extra.id])).attendance_status,'no_attendance');
  const summary=await one('select * from badge_print_batches where id=$1',[batch.batch_id]);assert.equal(summary.status,'completed');assert.equal(summary.total_jobs,1);assert.equal(summary.failed_jobs,0);
  pass('Batch retry completes logical batch, preserves mode and never checks in');
  const duplicate={id:extra.id,record_type:'registration'};await assert.rejects(()=>q("select * from create_badge_print_batch($1,'QA',$2::jsonb,'QA','QA Printer')",[event,JSON.stringify([duplicate,duplicate])]),/duplicadas/);
  const sent=await prepare(registration,'Pending QA');await status(sent.job_id,'rendering');await status(sent.job_id,'sent');await assert.rejects(()=>q("select manage_badge_print_job($1,'retry')",[sent.job_id]),/sigue pendiente/);
  pass('Duplicate candidates and retries of still-pending jobs rejected');
  for(let i=0;i<30;i++){const person=await one("insert into registrations(organization_id,event_id,first_name) values($1,$2,$3) returning id",[org,event,`Pagination ${i}`]);const j=await prepare(person.id);await status(j.job_id,'rendering');await status(j.job_id,'sent')}
  let after=null,found=[];while(true){const page=await q('select * from get_badge_print_pending_jobs($1,$2,7)',[station,after]);found.push(...page);if(page.length<7)break;after=page.at(-1).id}
  assert.equal(found.length,31);assert.equal((await q('select * from get_badge_print_pending_jobs($1)',[otherStation])).length,0);pass('Reconciliation paginates beyond 20 and isolates stations');
  const credential=await one('select * from register_badge_print_station_sync($1,$2)',[event,station]);assert.equal(credential.sync_token.length,64);
  await q("select sync_badge_print_job($1,$2,'spooled','qa-local','hash')",[credential.sync_token,sent.job_id]);await q("select sync_badge_print_job($1,$2,'sent','qa-local','hash')",[credential.sync_token,sent.job_id]);
  assert.equal((await one('select status from badge_print_jobs where id=$1',[sent.job_id])).status,'spooled');
  await assert.rejects(()=>q("select sync_badge_print_job($1,$2,'delivered','qa-local')",[credential.sync_token,sent.job_id]),/invalido/);
  const isolated=await one('select * from register_badge_print_station_sync($1,$2)',[event,otherStation]);await assert.rejects(()=>q("select sync_badge_print_job($1,$2,'failed','qa-local')",[isolated.sync_token,found[0].id]),/no autorizado/);
  await q("update badge_private.station_sync_credentials set expires_at=now()-interval '1 second'");await assert.rejects(()=>q("select sync_badge_print_job($1,$2,'failed','qa-local')",[credential.sync_token,found[0].id]),/no autorizado/);
  pass('Background sync is scoped, expires, cannot deliver and ignores stale acknowledgements');
  await db.exec('grant usage on schema public to authenticated;grant select on events to authenticated;set role authenticated;');
  await assert.rejects(()=>q("insert into badge_assets(organization_id,event_id,name,storage_path,public_url,mime_type,size_bytes) values($1,$2,'QA','qa-cross','https://example.test/x','image/png',100)",[org,otherEvent]),/row-level security/);
  await assert.rejects(()=>q("insert into badge_template_versions(organization_id,event_id,participation_type,version,status,snapshot) values($1,$2,'attendee',1,'draft','{}')",[org,otherEvent]),/row-level security/);
  await q("insert into badge_assets(organization_id,event_id,name,storage_path,public_url,mime_type,size_bytes) values($1,$2,'QA','qa-own','https://example.test/x','image/png',100)",[org,event]);
  await q("insert into badge_template_versions(organization_id,event_id,participation_type,version,status,snapshot) values($1,$2,'attendee',1,'draft','{}')",[org,event]);await db.exec('reset role;');pass('Cross-organization writes denied; valid own-event writes allowed');
  for(const name of ['confirm_event_badge','prepare_badge_print_job','update_badge_print_job','register_badge_print_station_sync','acknowledge_badge_print_job']){
    const privileges=await q("select has_function_privilege('anon',p.oid,'execute') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[name]);assert.ok(privileges.every(p=>!p.allowed));
  }
  assert.equal((await one("select has_schema_privilege('anon','badge_private','usage') allowed")).allowed,false);pass('Private credential storage and anonymous mutation grants');
  console.log(`PASS: ${checks} database regression groups`);
} finally {await db.close()}
