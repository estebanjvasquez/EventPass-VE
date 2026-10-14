import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {execFile} from 'node:child_process'
import {mkdir,readFile,rm,writeFile,rename} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {promisify} from 'node:util'
import cors from 'cors'
import express from 'express'
import {PDFDocument} from 'pdf-lib'
import type {PrintOptions} from 'pdf-to-printer'
import {z} from 'zod'

const require=createRequire(import.meta.url)
const {print}=require('pdf-to-printer') as {print:(pdf:string,options?:PrintOptions)=>Promise<void>}
const execFileAsync=promisify(execFile)
const version='0.3.0'
type Job={id:string;cloudJobId:string;eventId?:string;printer:string;title:string;status:'queued'|'printing'|'spooled'|'failed'|'cancelled';error?:string;payloadHash:string;fingerprint?:string;createdAt:string;updatedAt:string;pdfPath?:string;copies:number;priority:number;test:boolean;side:'simplex'|'duplexlong'|'duplexshort';cloudSyncedStatus?:string}
const port=Number(process.env.EVENTOSFACIL_BRIDGE_PORT||18181),host='127.0.0.1'
const dataDir=process.env.EVENTOSFACIL_BRIDGE_DATA_DIR||join(homedir(),'.eventosfacil-print-bridge')
const settingsPath=join(dataDir,'settings.json'),jobsPath=join(dataDir,'jobs.json'),linksPath=join(dataDir,'cloud-links.json')
await mkdir(dataDir,{recursive:true})
async function loadToken(){try{const value=JSON.parse(await readFile(settingsPath,'utf8')) as {token?:string};if(value.token)return value.token}catch{}const token=randomBytes(24).toString('hex');await writeFile(settingsPath,JSON.stringify({token},null,2),{mode:0o600});return token}
const token=process.env.EVENTOSFACIL_BRIDGE_TOKEN||await loadToken()
let jobs:Job[]=[]
try{jobs=JSON.parse(await readFile(jobsPath,'utf8')) as Job[];jobs=jobs.map(job=>({...job,priority:job.priority??100,test:job.test??false,side:job.side??'simplex',...(job.status==='printing'?{status:'failed' as const,error:'El servicio se interrumpió durante la impresión. Comprueba la cola de Windows antes de reintentar.'}:{})}))}catch{}
let writes=Promise.resolve()
function persist(){
  const retained=jobs.filter(job=>['queued','printing'].includes(job.status)||(!job.test&&job.eventId&&job.cloudSyncedStatus!==job.status))
  const recent=jobs.slice(-500).filter(job=>!retained.includes(job))
  const snapshot=JSON.stringify([...recent,...retained],null,2)
  const next=writes.catch(()=>undefined).then(async()=>{const temp=jobsPath+'.tmp';await writeFile(temp,snapshot,{mode:0o600});await rename(temp,jobsPath)})
  writes=next;return next
}
const profile=z.object({offsetXmm:z.number().min(-30).max(30).default(0),offsetYmm:z.number().min(-30).max(30).default(0),scalePercent:z.number().min(50).max(150).default(100),duplexMode:z.enum(['simplex','long-edge','short-edge']).default('simplex')}).default({offsetXmm:0,offsetYmm:0,scalePercent:100,duplexMode:'simplex'})
const payload=z.object({cloudJobId:z.string().uuid(),eventId:z.string().uuid().optional(),printer:z.string().min(1).max(240),title:z.string().min(1).max(160),pngDataUrls:z.array(z.string().startsWith('data:image/png;base64,').max(20_000_000)).min(1).max(2),widthMm:z.number().min(20).max(400),heightMm:z.number().min(20).max(400),copies:z.number().int().min(1).max(10).default(1),priority:z.number().int().min(1).max(999).default(100),test:z.boolean().default(false),profile})
const cloudLink=z.object({eventId:z.string().uuid(),supabaseUrl:z.string().url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='moqywmcbklaeaelttzdm.supabase.co'&&!url.port&&(url.pathname==='/'||url.pathname==='')&&!url.username&&!url.password&&!url.search&&!url.hash},'Destino de sincronización no autorizado'),anonKey:z.string().min(20).max(3000),syncToken:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.string().datetime({offset:true})})
type CloudLink=z.infer<typeof cloudLink>
const links=new Map<string,CloudLink>()
let linkWrites=Promise.resolve()
function persistLinks(){
  const snapshot=JSON.stringify([...links.values()])
  const next=linkWrites.catch(()=>undefined).then(async()=>{const temp=linksPath+'.tmp';await writeFile(temp,snapshot,{mode:0o600});await rename(temp,linksPath)})
  linkWrites=next;return next
}
try{for(const value of JSON.parse(await readFile(linksPath,'utf8')) as unknown[]){const checked=cloudLink.safeParse(value);if(checked.success&&Date.parse(checked.data.expiresAt)>Date.now())links.set(checked.data.eventId,checked.data)}}catch{}
let syncing=false
async function syncCloud(){
  if(syncing)return;syncing=true
  try{for(const job of jobs){
    if(job.test||!job.eventId||!['spooled','failed','cancelled'].includes(job.status)||job.cloudSyncedStatus===job.status)continue
    const link=links.get(job.eventId);if(!link||Date.parse(link.expiresAt)<=Date.now())continue
    try{
      const response=await fetch(`${link.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/sync_badge_print_job`,{method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json',apikey:link.anonKey,...(link.anonKey.startsWith('eyJ')?{Authorization:`Bearer ${link.anonKey}`}:{})},body:JSON.stringify({p_sync_token:link.syncToken,p_job_id:job.cloudJobId,p_status:job.status,p_bridge_job_id:job.id,p_payload_hash:job.payloadHash,p_error_message:job.error??null})})
      if(response.ok){job.cloudSyncedStatus=job.status;await persist()}
    }catch{/* A pending acknowledgement is retried, never reported as a print failure. */}
  }}finally{syncing=false}
}

const app=express()
app.use(cors({origin:(origin,callback)=>{if(!origin||origin==='https://eventosfacil.net'||/^https:\/\/[^/]+\.eventosfacil\.net$/.test(origin)||origin.endsWith('.eventpass-d7d.pages.dev')||/^http:\/\/localhost:\d+$/.test(origin))callback(null,true);else callback(new Error('Origen no autorizado'))},allowedHeaders:['Content-Type','X-Bridge-Token']}))
app.use(express.json({limit:'41mb'}))
app.use((req,res,next)=>{if(req.path==='/v1/health')return next();if(req.header('X-Bridge-Token')!==token)return res.status(401).json({error:'Código de vinculación incorrecto.'});next()})
app.get('/v1/health',(_req,res)=>res.json({ok:true,version,queue:jobs.filter(job=>job.status==='queued'||job.status==='printing').length,uptimeSeconds:Math.round(process.uptime()),pendingCloudSync:jobs.filter(job=>!job.test&&job.eventId&&['spooled','failed','cancelled'].includes(job.status)&&job.cloudSyncedStatus!==job.status).length}))
app.post('/v1/cloud-link',async(req,res)=>{
  const parsed=cloudLink.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message||'Vinculación inválida.'})
  if(Date.parse(parsed.data.expiresAt)<=Date.now())return res.status(400).json({error:'La vinculación de sincronización ha caducado.'})
  links.set(parsed.data.eventId,parsed.data);await persistLinks();void syncCloud();res.json({ok:true})
})
app.get('/v1/printers',async(_req,res)=>{try{res.json({printers:await listWindowsPrinters()})}catch(error){res.status(500).json({error:error instanceof Error?error.message:'No se pudieron consultar las impresoras.'})}})
const creations=new Map<string,{fingerprint:string;promise:Promise<Job>}>()
app.get('/v1/jobs/by-cloud/:cloudJobId',async(req,res)=>{
  let job=jobs.find(item=>item.cloudJobId===req.params.cloudJobId)
  if(!job){const pending=creations.get(req.params.cloudJobId);if(pending)job=await pending.promise}
  if(!job)return res.status(404).json({error:'Trabajo no encontrado.'});res.json(publicJob(job))
})
app.get('/v1/jobs/:id',(req,res)=>{const job=jobs.find(item=>item.id===req.params.id);if(!job)return res.status(404).json({error:'Trabajo no encontrado.'});res.json(publicJob(job))})
app.post('/v1/jobs',async(req,res)=>{
  const parsed=payload.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message||'Trabajo inválido.'})
  const fingerprint=createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex')
  const existing=jobs.find(item=>item.cloudJobId===parsed.data.cloudJobId),pending=creations.get(parsed.data.cloudJobId)
  if((existing?.fingerprint&&existing.fingerprint!==fingerprint)||(pending&&pending.fingerprint!==fingerprint))return res.status(409).json({error:'El identificador ya pertenece a otro contenido. Crea un reintento desde la cola.'})
  if(existing)return res.json(publicJob(existing))
  if(pending)return res.json(publicJob(await pending.promise))
  const promise=createJob(parsed.data,fingerprint)
  creations.set(parsed.data.cloudJobId,{fingerprint,promise})
  try{res.status(202).json(publicJob(await promise))}finally{creations.delete(parsed.data.cloudJobId)}
})
async function createJob(input:z.infer<typeof payload>,fingerprint:string):Promise<Job>{
  const buffers=input.pngDataUrls.map(value=>Buffer.from(value.slice('data:image/png;base64,'.length),'base64'))
  const hash=createHash('sha256').update(Buffer.concat(buffers)).digest('hex'),pdf=await PDFDocument.create()
  for(const bytes of buffers){const page=pdf.addPage([input.widthMm*72/25.4,input.heightMm*72/25.4]);const image=await pdf.embedPng(bytes),scale=input.profile.scalePercent/100,width=page.getWidth()*scale,height=page.getHeight()*scale;page.drawImage(image,{x:(page.getWidth()-width)/2+input.profile.offsetXmm*72/25.4,y:(page.getHeight()-height)/2-input.profile.offsetYmm*72/25.4,width,height})}
  const pdfPath=join(dataDir,`job-${randomUUID()}.pdf`);await writeFile(pdfPath,await pdf.save())
  const now=new Date().toISOString(),side=input.pngDataUrls.length===2&&input.profile.duplexMode!=='simplex'?(input.profile.duplexMode==='short-edge'?'duplexshort':'duplexlong'):'simplex'
  const job:Job={id:randomUUID(),cloudJobId:input.cloudJobId,eventId:input.eventId,printer:input.printer,title:input.title,status:'queued',payloadHash:hash,fingerprint,createdAt:now,updatedAt:now,pdfPath,copies:input.copies,priority:input.priority,test:input.test,side}
  jobs.push(job)
  try{await persist()}catch(error){jobs=jobs.filter(item=>item!==job);await rm(pdfPath,{force:true});throw error}
  void processQueue();return job
}
app.post('/v1/jobs/:id/cancel',async(req,res)=>{
  const job=jobs.find(item=>item.id===req.params.id);if(!job)return res.status(404).json({error:'Trabajo no encontrado.'})
  if(job.status==='printing'||job.status==='spooled')return res.status(409).json({error:'El trabajo ya fue entregado a Windows y no puede cancelarse desde el conector.'})
  if(job.status==='failed')return res.status(409).json({error:'El trabajo ya falló; consulta su estado antes de reintentar.'})
  job.status='cancelled';job.updatedAt=new Date().toISOString();if(job.pdfPath){await rm(job.pdfPath,{force:true});delete job.pdfPath}await persist();void syncCloud();res.json(publicJob(job))
})
app.post('/v1/jobs/:id/prioritize',async(req,res)=>{
  const job=jobs.find(item=>item.id===req.params.id);if(!job)return res.status(404).json({error:'Trabajo no encontrado.'})
  if(job.status!=='queued')return res.status(409).json({error:'Solo los trabajos en cola pueden priorizarse.'})
  job.priority=1;job.updatedAt=new Date().toISOString();await persist();res.json(publicJob(job))
})
let processing=false
async function processQueue(){
  if(processing)return;processing=true
  try{while(true){
    const job=jobs.filter(item=>item.status==='queued').sort((a,b)=>a.priority-b.priority||a.createdAt.localeCompare(b.createdAt))[0];if(!job)break
    job.status='printing';job.updatedAt=new Date().toISOString();await persist()
    try{if(!job.pdfPath)throw new Error('Archivo de impresión no disponible.');await print(job.pdfPath,{printer:job.printer,copies:job.copies,scale:'noscale',side:job.side});job.status='spooled'}catch(error){job.status='failed';job.error=error instanceof Error?error.message:'La impresora rechazó el trabajo.'}
    job.updatedAt=new Date().toISOString();if(job.pdfPath){await rm(job.pdfPath,{force:true}).catch(()=>undefined);delete job.pdfPath}await persist();void syncCloud()
  }}catch(error){console.error('No se pudo guardar la cola local:',error instanceof Error?error.message:'Error de almacenamiento')}finally{processing=false}
}
function publicJob(job:Job){return{id:job.id,cloudJobId:job.cloudJobId,status:job.status,error:job.error,payloadHash:job.payloadHash,priority:job.priority,test:job.test}}
async function listWindowsPrinters(){
  const command='[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus,JobCountSinceLastReset) | ConvertTo-Json -Compress'
  const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true})
  const parsed=JSON.parse(stdout||'[]') as {Name:string;Default:boolean;WorkOffline?:boolean;PrinterStatus?:number;JobCountSinceLastReset?:number}|{Name:string;Default:boolean;WorkOffline?:boolean;PrinterStatus?:number;JobCountSinceLastReset?:number}[]
  return(Array.isArray(parsed)?parsed:[parsed]).filter(item=>item?.Name).map(item=>({name:item.Name,isDefault:Boolean(item.Default),offline:Boolean(item.WorkOffline),statusCode:item.PrinterStatus??0,jobCount:item.JobCountSinceLastReset??0}))
}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(500).json({error:error instanceof Error?error.message:'Error del conector local.'}))
setInterval(()=>void syncCloud(),5000).unref()
app.listen(port,host,()=>{console.log(`EventosFácil Print Bridge ${version} · ${host}:${port}`);console.log(`Código de vinculación: ${token}`);void persist().then(()=>processQueue());void syncCloud()})
