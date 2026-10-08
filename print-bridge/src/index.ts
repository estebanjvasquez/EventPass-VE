import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import cors from 'cors'
import express from 'express'
import { PDFDocument } from 'pdf-lib'
import type { PrintOptions } from 'pdf-to-printer'
import { z } from 'zod'

const require=createRequire(import.meta.url)
const {print}=require('pdf-to-printer') as {print:(pdf:string,options?:PrintOptions)=>Promise<void>}
const execFileAsync=promisify(execFile)

type Job={id:string;cloudJobId:string;printer:string;title:string;status:'queued'|'printing'|'spooled'|'failed'|'cancelled';error?:string;payloadHash:string;createdAt:string;updatedAt:string;pdfPath?:string;copies:number;priority:number;test:boolean;side:'simplex'|'duplexlong'|'duplexshort'}
const port=Number(process.env.EVENTOSFACIL_BRIDGE_PORT||18181)
const host='127.0.0.1'
const dataDir=process.env.EVENTOSFACIL_BRIDGE_DATA_DIR||join(homedir(),'.eventosfacil-print-bridge')
const settingsPath=join(dataDir,'settings.json'),jobsPath=join(dataDir,'jobs.json')
await mkdir(dataDir,{recursive:true})
async function loadToken(){try{const value=JSON.parse(await readFile(settingsPath,'utf8')) as {token?:string};if(value.token)return value.token}catch{}const token=randomBytes(24).toString('hex');await writeFile(settingsPath,JSON.stringify({token},null,2));return token}
const token=process.env.EVENTOSFACIL_BRIDGE_TOKEN||await loadToken()
let jobs:Job[]=[]
try{jobs=JSON.parse(await readFile(jobsPath,'utf8')) as Job[];jobs=jobs.map(job=>({...job,priority:job.priority??100,test:job.test??false,side:job.side??'simplex',status:job.status==='printing'?(job.pdfPath? 'queued':'failed'):job.status}))}catch{}
const persist=()=>writeFile(jobsPath,JSON.stringify(jobs.slice(-500),null,2))
const profile=z.object({offsetXmm:z.number().min(-30).max(30).default(0),offsetYmm:z.number().min(-30).max(30).default(0),scalePercent:z.number().min(50).max(150).default(100),duplexMode:z.enum(['simplex','long-edge','short-edge']).default('simplex')}).default({offsetXmm:0,offsetYmm:0,scalePercent:100,duplexMode:'simplex'})
const payload=z.object({cloudJobId:z.string().uuid(),printer:z.string().min(1).max(240),title:z.string().min(1).max(160),pngDataUrls:z.array(z.string().startsWith('data:image/png;base64,').max(20_000_000)).min(1).max(2),widthMm:z.number().min(20).max(400),heightMm:z.number().min(20).max(400),copies:z.number().int().min(1).max(10).default(1),priority:z.number().int().min(1).max(999).default(100),test:z.boolean().default(false),profile})

const app=express()
app.use(cors({origin:(origin,callback)=>{if(!origin||origin==='https://eventosfacil.net'||origin.endsWith('.eventpass-d7d.pages.dev')||origin.startsWith('http://localhost:'))callback(null,true);else callback(new Error('Origen no autorizado'))},allowedHeaders:['Content-Type','X-Bridge-Token']}))
app.use(express.json({limit:'21mb'}))
app.use((req,res,next)=>{if(req.path==='/v1/health')return next();if(req.header('X-Bridge-Token')!==token)return res.status(401).json({error:'Código de vinculación incorrecto.'});next()})
app.get('/v1/health',(_req,res)=>res.json({ok:true,version:'0.2.0',queue:jobs.filter(job=>job.status==='queued'||job.status==='printing').length,uptimeSeconds:Math.round(process.uptime())}))
app.get('/v1/printers',async(_req,res)=>{try{res.json({printers:await listWindowsPrinters()})}catch(error){res.status(500).json({error:error instanceof Error?error.message:'No se pudieron consultar las impresoras.'})}})
app.get('/v1/jobs/:id',(req,res)=>{const job=jobs.find(item=>item.id===req.params.id);if(!job)return res.status(404).json({error:'Trabajo no encontrado.'});res.json(publicJob(job))})
app.post('/v1/jobs',async(req,res)=>{const parsed=payload.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message||'Trabajo inválido.'});const existing=jobs.find(item=>item.cloudJobId===parsed.data.cloudJobId);if(existing)return res.json(publicJob(existing));const buffers=parsed.data.pngDataUrls.map(value=>Buffer.from(value.slice('data:image/png;base64,'.length),'base64'));const hash=createHash('sha256').update(Buffer.concat(buffers)).digest('hex');const pdf=await PDFDocument.create();for(const bytes of buffers){const page=pdf.addPage([parsed.data.widthMm*72/25.4,parsed.data.heightMm*72/25.4]);const image=await pdf.embedPng(bytes);const scale=parsed.data.profile.scalePercent/100;const width=page.getWidth()*scale,height=page.getHeight()*scale;const x=(page.getWidth()-width)/2+parsed.data.profile.offsetXmm*72/25.4,y=(page.getHeight()-height)/2-parsed.data.profile.offsetYmm*72/25.4;page.drawImage(image,{x,y,width,height})}const pdfPath=join(dataDir,`job-${randomUUID()}.pdf`);await writeFile(pdfPath,await pdf.save());const now=new Date().toISOString();const side=parsed.data.pngDataUrls.length===2?(parsed.data.profile.duplexMode==='short-edge'?'duplexshort':'duplexlong'):'simplex';const job:Job={id:randomUUID(),cloudJobId:parsed.data.cloudJobId,printer:parsed.data.printer,title:parsed.data.title,status:'queued',payloadHash:hash,createdAt:now,updatedAt:now,pdfPath,copies:parsed.data.copies,priority:parsed.data.priority,test:parsed.data.test,side};jobs.push(job);await persist();void processQueue();res.status(202).json(publicJob(job))})
app.post('/v1/jobs/:id/cancel',async(req,res)=>{const job=jobs.find(item=>item.id===req.params.id);if(!job)return res.status(404).json({error:'Trabajo no encontrado.'});if(job.status==='printing'||job.status==='spooled')return res.status(409).json({error:'El trabajo ya fue entregado a Windows.'});job.status='cancelled';job.updatedAt=new Date().toISOString();if(job.pdfPath){await rm(job.pdfPath,{force:true}).catch(()=>undefined);delete job.pdfPath}await persist();res.json(publicJob(job))})
app.post('/v1/jobs/:id/prioritize',async(req,res)=>{const job=jobs.find(item=>item.id===req.params.id);if(!job)return res.status(404).json({error:'Trabajo no encontrado.'});if(job.status!=='queued')return res.status(409).json({error:'Solo los trabajos en cola pueden priorizarse.'});job.priority=1;job.updatedAt=new Date().toISOString();await persist();res.json(publicJob(job))})

let processing=false
async function processQueue(){if(processing)return;processing=true;while(true){const job=jobs.filter(item=>item.status==='queued').sort((a,b)=>a.priority-b.priority||a.createdAt.localeCompare(b.createdAt))[0];if(!job)break;job.status='printing';job.updatedAt=new Date().toISOString();await persist();try{if(!job.pdfPath)throw new Error('Archivo de impresión no disponible.');await print(job.pdfPath,{printer:job.printer,copies:job.copies,scale:'fit',side:job.side});job.status='spooled'}catch(error){job.status='failed';job.error=error instanceof Error?error.message:'La impresora rechazó el trabajo.'}job.updatedAt=new Date().toISOString();if(job.pdfPath){await rm(job.pdfPath,{force:true}).catch(()=>undefined);delete job.pdfPath}await persist()}processing=false}
function publicJob(job:Job){return{id:job.id,status:job.status,error:job.error,payloadHash:job.payloadHash,priority:job.priority,test:job.test}}
async function listWindowsPrinters(){
  const command='[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus,JobCountSinceLastReset) | ConvertTo-Json -Compress'
  const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true})
  const parsed=JSON.parse(stdout||'[]') as {Name:string;Default:boolean;WorkOffline?:boolean;PrinterStatus?:number;JobCountSinceLastReset?:number}|{Name:string;Default:boolean;WorkOffline?:boolean;PrinterStatus?:number;JobCountSinceLastReset?:number}[]
  return (Array.isArray(parsed)?parsed:[parsed]).filter(item=>item?.Name).map(item=>({name:item.Name,isDefault:Boolean(item.Default),offline:Boolean(item.WorkOffline),statusCode:item.PrinterStatus??0,jobCount:item.JobCountSinceLastReset??0}))
}

app.listen(port,host,()=>{console.log(`EventosFácil Print Bridge 0.2.0 · ${host}:${port}`);console.log(`Código de vinculación: ${token}`);void processQueue()})
