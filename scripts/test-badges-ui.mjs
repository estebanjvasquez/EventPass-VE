import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const source=await readFile(new URL('../frontend/src/pages/admin/AcreditacionEvento.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('AcreditacionEvento.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name,scope){
  let found;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit)};visit(ast);assert.ok(found);
  const js=ts.transpileModule(found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  return new Function(...Object.keys(scope),`${js};return ${name}`)(...Object.values(scope));
}
const reg={id:'qa-reg',record_type:'registration',first_name:'QA',last_name:null,cedula:null,company:null,job_title:null,participation_type:'attendee',credential_token:'qa-token'};
function fixture(){
  const state={busy:false,printed:false,error:null,info:null,managed:false,failed:false,test:false};
  const scope={selected:reg,orgId:'qa-org',eventId:'qa-event',canPrint:true,operationLock:{current:false},selectionGeneration:{current:0},isConfirmed:()=>true,printLogs:[],window:{setTimeout:()=>0,prompt:()=>null,confirm:()=>true,print:()=>{}},
    bridgeState:'offline',bridgeConfig:{station:'QA',printer:'QA',profile:{}},activeTemplate:{id:'qa-template',width_mm:100,height_mm:60,double_sided:false},edit:{first_name:'QA',last_name:'',cedula:'',company:'',job_title:''},eventName:'QA',orgName:'QA',TYPE_LABELS:{},
    setBusy:v=>state.busy=v,setError:v=>state.error=v,setInfo:v=>state.info=v,setSelected:()=>{},setBrowserPages:()=>{},setBrowserDimensions:()=>{},setPendingJobId:()=>{},setPrintLogs:()=>{},setPrinted:v=>state.printed=v,
    printProfileSnapshot:()=>({}),badgeRpc:async name=>{if(name==='manage_badge_print_job')state.managed=true;return name==='prepare_badge_print_job'?[{job_id:'qa-job',credential_token:'qa-token',print_kind:'initial'}]:'qa-job'},
    getBadgePrintJob:async()=>({template_snapshot:null}),updateBadgeJob:async(_id,next)=>{if(next==='failed')state.failed=true},renderBadgeSides:async()=>['qa-png'],loadPrints:async()=>{},loadOperationalData:async()=>{},ensureStationSync:async()=>{}};
  return {scope,state};
}
{
  const {scope,state}=fixture();scope.renderBadgeSides=async()=>{throw Error('QA render error')};
  await handler('printBadge',scope)();assert.equal(state.busy,false);assert.equal(scope.operationLock.current,false);assert.equal(state.failed,true);assert.match(state.error,/QA render error/);
  console.log('PASS: Browser render failure is audited, visible and releases the operation lock');
}
{
  const {scope,state}=fixture();scope.badgeRpc=async name=>{if(name==='update_badge_print_job')throw Error('QA update denied');return[{job_id:'qa-job',credential_token:'qa-token',print_kind:'initial'}]};
  await handler('printBadge',scope)();assert.equal(state.printed,false);assert.match(state.error,/QA update denied/);assert.equal(state.busy,false);
  console.log('PASS: Failed status RPC does not display successful printing');
}
{
  const {scope,state}=fixture();scope.bridgeState='connected';scope.getBridgeJobByCloudId=async()=>({id:'local',status:'printing'});scope.cancelBridgeJob=async()=>{throw Error('Already sent to Windows')};scope.prioritizeBridgeJob=async()=>{};scope.getBridgeStationId=()=>null;scope.acknowledgeBridgeJob=async()=>{};
  await handler('manageQueueJob',scope)({id:'qa-job',bridge_job_id:'local',status:'sent'},'cancel');assert.equal(state.managed,false);assert.match(state.error,/Already sent/);assert.equal(state.busy,false);
  console.log('PASS: Rejected local cancellation does not cancel the cloud job');
}
{
  const {scope,state}=fixture();scope.selected=null;scope.bridgeState='connected';scope.testBusy=false;scope.setTestBusy=()=>{};scope.templateDraft={width_mm:100,height_mm:60,name:'Demo'};scope.studioPreview={first_name:'Demo',credential_token:'PREVIEW'};scope.crypto={randomUUID:()=> 'qa-test'};scope.submitBridgeJob=async()=>{state.test=true;return{id:'test',status:'spooled'}};scope.waitForBridgeJob=async(_config,job)=>job;
  await handler('testPrint',scope)();assert.equal(state.test,true);assert.equal(state.error,null);assert.match(state.info,/sin crear una impresión/);
  console.log('PASS: Designer test printing works with demo data and no selected participant');
}
{
  const {scope,state}=fixture();scope.bridgeState='connected';scope.dispatchBadgeJob=async()=>({status:'pending',message:'Pending Windows'});
  await handler('printBadge',scope)();assert.equal(state.failed,false);assert.equal(state.printed,false);assert.match(state.info,/Pending Windows/);
  console.log('PASS: Pending transport keeps the job pending and never enables delivery early');
}
console.log('PASS: Credential UI regression groups');
