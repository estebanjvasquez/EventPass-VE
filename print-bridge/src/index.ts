import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
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

type Job={id:string;cloudJobId:string;printer:string;title:string;status:'queued'|'printing'|'spooled'|'failed';error?:string;payloadHash:string;createdAt:string;updatedAt:string;pdfPath?:string;copies:number}
const port=Number(process.env.EVENTOSFACIL_BRIDGE_PORT||18181)
const host='127.0.0.1'
const dataDir=process.env.EVENTOSFACIL_BRIDGE_DATA_DIR||join(homedir(),'.eventosfacil-print-bridge')
const settingsPath=join(dataDir,'settings.json'),jobsPath=join(dataDir,'jobs.json')
await mkdir(dataDir,{recursive:true})
async function loadToken(){try{const value=JSON.parse(await readFile(settingsPath,'utf8')) as {token?:string};if(value.token)return value.token}catch{}const token=randomBytes(24).toString('hex');await writeFile(settingsPath,JSON.stringify({token},null,2));return token}
const token=process.env.EVENTOSFACIL_BRIDGE_TOKEN||await loadToken()
let jobs:Job[]=[]
try{jobs=JSON.parse(await readFile(jobsPath,'utf8')) as Job[];jobs=jobs.map(job=>job.status==='printing'?{...job,status:'failed',error:'El bridge se reinició durante la impresión.'}:job)}catch{}
const persist=()=>writeFile(jobsPath,JSON.stringify(jobs.slice(-500),null,2))
const payload=z.object({cloudJobId:z.string().uuid(),printer:z.string().min(1).max(240),title:z.string().min(1).max(160),pngDataUrl:z.string().startsWith('data:image/png;base64,').max(20_000_000),widthMm:z.number().min(20).max(400),heightMm:z.number().min(20).max(400),copies:z.number().int().min(1).max(10).default(1)})

const app=express()
app.use(cors({origin:(origin,callback)=>{if(!origin||origin==='https://eventosfacil.net'||origin.endsWith('.eventpass-d7d.pages.dev')||origin.startsWith('http://localhost:'))callback(null,true);else callback(new Error('Origen no autorizado'))},allowedHeaders:['Content-Type','X-Bridge-Token']}))
app.use(express.json({limit:'21mb'}))
app.use((req,res,next)=>{if(req.path==='/v1/health')return next();if(req.header('X-Bridge-Token')!==token)return res.status(401).json({error:'Código de vinculación incorrecto.'});next()})
app.get('/v1/health',(_req,res)=>res.json({ok:true,version:'0.1.0',queue:jobs.filter(job=>job.status==='queued'||job.status==='printing').length}))
app.get('/v1/printers',async(_req,res)=>{try{res.json({printers:await listWindowsPrinters()})}catch(error){res.status(500).json({error:error instanceof Error?error.message:'No se pudieron consultar las impresoras.'})}})
app.get('/v1/jobs/:id',(req,res)=>{const job=jobs.find(item=>item.id===req.params.id);if(!job)return res.status(404).json({error:'Trabajo no encontrado.'});res.json(publicJob(job))})
app.post('/v1/jobs',async(req,res)=>{const parsed=payload.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message||'Trabajo inválido.'});const existing=jobs.find(item=>item.cloudJobId===parsed.data.cloudJobId);if(existing)return res.json(publicJob(existing));const bytes=Buffer.from(parsed.data.pngDataUrl.slice('data:image/png;base64,'.length),'base64');const hash=createHash('sha256').update(bytes).digest('hex');const pdf=await PDFDocument.create();const page=pdf.addPage([parsed.data.widthMm*72/25.4,parsed.data.heightMm*72/25.4]);const image=await pdf.embedPng(bytes);page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});const pdfPath=join(tmpdir(),`eventosfacil-${randomUUID()}.pdf`);await writeFile(pdfPath,await pdf.save());const now=new Date().toISOString();const job:Job={id:randomUUID(),cloudJobId:parsed.data.cloudJobId,printer:parsed.data.printer,title:parsed.data.title,status:'queued',payloadHash:hash,createdAt:now,updatedAt:now,pdfPath,copies:parsed.data.copies};jobs.push(job);await persist();void processQueue();res.status(202).json(publicJob(job))})

let processing=false
async function processQueue(){if(processing)return;processing=true;while(true){const job=jobs.find(item=>item.status==='queued');if(!job)break;job.status='printing';job.updatedAt=new Date().toISOString();await persist();try{if(!job.pdfPath)throw new Error('Archivo de impresión no disponible.');await print(job.pdfPath,{printer:job.printer,copies:job.copies,scale:'fit'});job.status='spooled'}catch(error){job.status='failed';job.error=error instanceof Error?error.message:'La impresora rechazó el trabajo.'}job.updatedAt=new Date().toISOString();if(job.pdfPath){await rm(job.pdfPath,{force:true}).catch(()=>undefined);delete job.pdfPath}await persist()}processing=false}
function publicJob(job:Job){return{id:job.id,status:job.status,error:job.error,payloadHash:job.payloadHash}}
async function listWindowsPrinters(){
  const command='[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Printer | Select-Object Name,Default) | ConvertTo-Json -Compress'
  const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true})
  const parsed=JSON.parse(stdout||'[]') as {Name:string;Default:boolean}|{Name:string;Default:boolean}[]
  return (Array.isArray(parsed)?parsed:[parsed]).filter(item=>item?.Name).map(item=>({name:item.Name,isDefault:Boolean(item.Default)}))
}

app.listen(port,host,()=>{console.log(`EventosFácil Print Bridge ${host}:${port}`);console.log(`Código de vinculación: ${token}`);void processQueue()})
