import assert from 'node:assert/strict';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

// Runs the real HTTP/queue implementation with ONLY printer transport mocked.
// No installed printer is contacted and all data stays in an isolated QA folder.
const source=await readFile(new URL('../print-bridge/src/service.ts',import.meta.url),'utf8');
const transport="const {print}=require('pdf-to-printer') as {print:(pdf:string,options?:PrintOptions)=>Promise<void>}";
assert.ok(source.includes(transport));
const mocked=source.replace(transport,`const print=async (_pdf:string, options:any)=>{await new Promise(resolve=>setTimeout(resolve,300));if(options.printer==='QA_FAIL')throw new Error('QA transport failure')}`);
const runtime=new URL('../print-bridge/.audit-runtime.mjs',import.meta.url);
const dataDir=new URL(`../artifacts/bridge-qa-${randomUUID()}/`,import.meta.url);
await mkdir(dataDir,{recursive:true});
await writeFile(runtime,ts.transpileModule(mocked,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const port=19182,token='qa-isolated-token',base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[fileURLToPath(runtime)],{cwd:fileURLToPath(new URL('../print-bridge/',import.meta.url)),env:{...process.env,EVENTOSFACIL_BRIDGE_PORT:String(port),EVENTOSFACIL_BRIDGE_TOKEN:token,EVENTOSFACIL_BRIDGE_DATA_DIR:fileURLToPath(dataDir)},stdio:['ignore','pipe','pipe'],windowsHide:true});
let errors='';child.stderr.on('data',value=>errors+=value);child.stdout.resume();
const results=[];
const log=(label,details)=>{results.push({label,details});console.log(`${label}: ${details}`)};
const request=(path,body,auth=true)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{'X-Bridge-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const payload=(printer='QA_OK')=>({cloudJobId:randomUUID(),printer,title:'Isolated QA',pngDataUrls:[png],widthMm:100,heightMm:60});
const wait=async id=>{for(let i=0;i<80;i++){const job=await(await request(`/v1/jobs/${id}`)).json();if(['spooled','failed','cancelled'].includes(job.status))return job;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('QA timeout')};
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await request('/v1/health')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,50))}
  assert.ok(ready,errors||'Bridge did not start');
  assert.equal((await request('/v1/printers',null,false)).status,401);log('PASS','Consultar impresoras requiere código de vinculación');
  assert.equal((await request('/v1/jobs',{cloudJobId:'bad'})).status,400);log('PASS','Payload inválido rechazado');
  const input=payload();const first=await(await request('/v1/jobs',input)).json();assert.equal((await wait(first.id)).status,'spooled');
  const duplicate=await(await request('/v1/jobs',input)).json();assert.equal(duplicate.id,first.id);log('PASS','Reenvío secuencial del mismo cloudJobId es idempotente');
  const failed=await(await request('/v1/jobs',payload('QA_FAIL'))).json();assert.equal((await wait(failed.id)).status,'failed');log('PASS','Error del transporte de impresión queda registrado');
  const concurrent=payload();const simultaneous=await Promise.all([request('/v1/jobs',concurrent),request('/v1/jobs',concurrent)]);const jobs=await Promise.all(simultaneous.map(x=>x.json()));
  assert.equal(jobs[0].id,jobs[1].id);log('PASS','POST simultáneos deduplicados');
  for(const job of jobs) await wait(job.id);
  const cors=await fetch(base+'/v1/health',{method:'OPTIONS',headers:{Origin:'https://eventosfacil.net','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-bridge-token'}});assert.equal(cors.headers.get('access-control-allow-origin'),'https://eventosfacil.net');log('PASS','CORS admite el dominio de producción');
  await writeFile(new URL('../artifacts/badge-audit-bridge-results.json',import.meta.url),JSON.stringify(results,null,2));
} finally {
  child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));await unlink(runtime);
}
