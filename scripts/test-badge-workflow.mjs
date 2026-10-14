import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const source=await readFile(new URL('../frontend/src/lib/badgePrintWorkflow.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/^import .*\n/gm,'').replaceAll('import.meta.env','testEnv'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^export /gm,'');
class BridgeHttpError extends Error{constructor(message,status){super(message);this.status=status}}
function fixture(){
  const states=[],acks=[],pages=[];
  const scope={BridgeHttpError,renderBadgeSides:async()=>['png'],getBridgeStationId:()=> 'station',linkBridgeCloud:async()=>{},getBridgeJob:async()=>({id:'local',status:'queued'}),getBridgeJobByCloudId:async()=>({id:'local',status:'queued'}),submitBridgeJob:async()=>({id:'local',status:'queued'}),window:{setTimeout:fn=>{fn();return 0}},testEnv:{VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'public-key'},
    supabase:{rpc:async(name,args)=>{
      if(name==='register_badge_print_station_sync')return{data:[{sync_token:'a'.repeat(64),expires_at:new Date(Date.now()+8*3600000).toISOString()}]};
      if(name==='update_badge_print_job')states.push(args.p_status);
      if(name==='acknowledge_badge_print_job')acks.push(args);
      if(name==='get_badge_print_pending_jobs'){pages.push(args.p_after_id);return{data:args.p_after_id?Array.from({length:25},(_,i)=>({id:`second-${i}`})):Array.from({length:100},(_,i)=>({id:`first-${i}`}))}}
      return{data:null,error:null};
    }}};
  const build=()=>new Function(...Object.keys(scope),`${js};return {dispatchBadgeJob,waitForBridgeJob,reconcileStationPrintJobs}`)(...Object.values(scope));
  const input={config:{url:'local',token:'token',printer:'QA',profile:{}},eventId:'event',jobId:'job',template:{width_mm:100,height_mm:60},data:{},title:'QA',wait:false};
  return{scope,states,acks,pages,build,input};
}
{
  const f=fixture();f.scope.renderBadgeSides=async()=>{throw Error('Render failed')};await assert.rejects(()=>f.build().dispatchBadgeJob(f.input),/Render failed/);assert.deepEqual(f.states,['rendering','failed']);console.log('PASS: Render failure ends as failed before any submission');
}
{
  const f=fixture();f.scope.submitBridgeJob=async()=>{throw Error('Connection lost after POST')};const result=await f.build().dispatchBadgeJob(f.input);assert.equal(result.status,'pending');assert.ok(!f.states.includes('failed'));console.log('PASS: Ambiguous POST failure recovers by cloud ID without resubmitting');
}
{
  const f=fixture();f.scope.submitBridgeJob=async()=>{throw Error('Connection lost')};f.scope.getBridgeJobByCloudId=async()=>{throw Error('Still offline')};const result=await f.build().dispatchBadgeJob(f.input);assert.equal(result.status,'pending');assert.deepEqual(f.states,['rendering','sent']);console.log('PASS: Offline after submission stays sent for later reconciliation');
}
{
  const f=fixture();const result=await f.build().dispatchBadgeJob(f.input);assert.equal(result.status,'pending');assert.deepEqual(f.states,['rendering','sent']);const last=await f.build().waitForBridgeJob(f.input.config,{id:'local',status:'queued'},0);assert.equal(last.status,'queued');console.log('PASS: Wait timeout preserves queued transport status');
}
{
  const f=fixture();f.scope.getBridgeJobByCloudId=async(_config,id)=>({id,status:'spooled'});const changed=await f.build().reconcileStationPrintJobs(f.input.config);assert.equal(changed,true);assert.equal(f.acks.length,125);assert.deepEqual(f.pages,[null,'first-99']);console.log('PASS: Browser reconciliation handles all 125 pending jobs in paginated batches');
}
{
  const bridgeSource=await readFile(new URL('../frontend/src/lib/printBridge.ts',import.meta.url),'utf8');
  const bridgeJs=ts.transpileModule(bridgeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^export /gm,'');
  let calls=0;
  const health=new Function('fetch','window',`${bridgeJs};return bridgeHealth`)(async()=>{calls++;return{ok:true,json:async()=>({ok:true})}},{setTimeout,clearTimeout});
  await assert.rejects(()=>health({url:'https://untrusted.example',token:'do-not-transmit'}),/este ordenador/);
  assert.equal(calls,0);await health({url:'http://127.0.0.1:18181',token:'qa-token'});assert.equal(calls,1);
  console.log('PASS: Bridge credentials are transmitted only to loopback destinations');
}
