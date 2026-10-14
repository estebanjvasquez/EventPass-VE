import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
import {badgeFixture,event,org,template,station} from './badge-db-fixture.mjs';

// Real bridge HTTP + PDF + persistence -> local PostgreSQL workflow functions.
// Only printer transport and the cloud network destination are substituted.
const {db,q,one}=await badgeFixture();
const sink=createServer(async(req,res)=>{
  try{
    let body='';for await(const chunk of req)body+=chunk;
    const p=JSON.parse(body);
    await q('select sync_badge_print_job($1,$2,$3,$4,$5,$6)',[p.p_sync_token,p.p_job_id,p.p_status,p.p_bridge_job_id,p.p_payload_hash,p.p_error_message]);
    res.writeHead(204);res.end();
  }catch(error){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}))}
});
await new Promise(resolve=>sink.listen(0,'127.0.0.1',resolve));
const sinkPort=sink.address().port;
const source=await readFile(new URL('../print-bridge/src/service.ts',import.meta.url),'utf8');
const transport="const {print}=require('pdf-to-printer') as {print:(pdf:string,options?:PrintOptions)=>Promise<void>}";
assert.ok(source.includes(transport));
const mocked=source.replace(transport,()=>"const print=async (_pdf:string,_options:any)=>{await new Promise(resolve=>setTimeout(resolve,10))}")
  .replace('const require=createRequire',()=>`const fetch=async (_url:string,options:any)=>globalThis.fetch('http://127.0.0.1:${sinkPort}/rest/v1/rpc/sync_badge_print_job',options)\nconst require=createRequire`);
const runtime=new URL('../print-bridge/.background-qa-runtime.mjs',import.meta.url),dir=new URL(`../artifacts/bridge-background-${randomUUID()}/`,import.meta.url);
await mkdir(dir,{recursive:true});await writeFile(runtime,ts.transpileModule(mocked,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const port=19184,base=`http://127.0.0.1:${port}`,token='qa-only-local-token';
const child=spawn(process.execPath,[fileURLToPath(runtime)],{cwd:fileURLToPath(new URL('../print-bridge/',import.meta.url)),env:{...process.env,EVENTOSFACIL_BRIDGE_PORT:String(port),EVENTOSFACIL_BRIDGE_TOKEN:token,EVENTOSFACIL_BRIDGE_DATA_DIR:fileURLToPath(dir)},stdio:['ignore','pipe','pipe'],windowsHide:true});
let errors='';child.stdout.resume();child.stderr.on('data',value=>errors+=value);
const request=(path,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Bridge-Token':token},...(body?{body:JSON.stringify(body)}:{})});
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await request('/v1/health')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,50))}assert.ok(ready,errors);
  const credential=await one('select * from register_badge_print_station_sync($1,$2)',[event,station]);
  const linked=await request('/v1/cloud-link',{eventId:event,supabaseUrl:'https://moqywmcbklaeaelttzdm.supabase.co',anonKey:'qa-public-key-not-a-production-key',syncToken:credential.sync_token,expiresAt:credential.expires_at.toISOString()});assert.equal(linked.status,200,linked.ok?'':await linked.text());
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const created=[];
  for(let i=0;i<30;i++){
    const person=await one("insert into registrations(organization_id,event_id,first_name) values($1,$2,$3) returning id",[org,event,`Background QA ${i}`]);
    const job=await one("select * from prepare_badge_print_job($1,'registration',$2,$3,'QA','QA Printer',null,1,$4::jsonb)",[event,person.id,template,JSON.stringify({stationKey:station})]);
    await q("select update_badge_print_job($1,'rendering')",[job.job_id]);
    const result=await request('/v1/jobs',{cloudJobId:job.job_id,eventId:event,printer:'QA Printer',title:'Isolated background test',pngDataUrls:[png],widthMm:100,heightMm:60});assert.equal(result.status,202);created.push(job.job_id);
  }
  // No browser acknowledgements after submission: the service must finish all 30.
  let complete=false;for(let i=0;i<200;i++){
    const result=await one("select count(*) n from badge_print_jobs where id=any($1::uuid[]) and status='spooled'",[created]);
    if(Number(result.n)===30){complete=true;break}await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(complete,'Bridge did not synchronize all 30 jobs independently of the browser');
  assert.equal(Number((await one('select count(*) n from badge_print_logs')).n),30);
  const persisted=JSON.parse(await readFile(new URL('jobs.json',dir),'utf8'));assert.equal(persisted.length,30);
  assert.ok(persisted.every(job=>job.status==='spooled'));
  const forbidden=await request('/v1/cloud-link',{eventId:event,supabaseUrl:'https://untrusted.example',anonKey:'qa-public-key-not-a-production-key',syncToken:credential.sync_token,expiresAt:credential.expires_at.toISOString()});assert.equal(forbidden.status,400);
  console.log('PASS: 30 real HTTP/PDF jobs synchronize into isolated PostgreSQL without browser acknowledgements');
  console.log('PASS: Serialized atomic persistence preserves all jobs and cloud-link rejects untrusted destinations');
} finally {
  child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
  await unlink(runtime);await new Promise(resolve=>sink.close(resolve));await db.close();
}
