import {supabase} from './supabase'
import {renderBadgeSides,type BadgeTemplateV2,type BadgeRenderData} from './badgeStudio'
import {BridgeHttpError,getBridgeJob,getBridgeJobByCloudId,getBridgeStationId,linkBridgeCloud,submitBridgeJob,type BridgeJob,type BridgeConfig} from './printBridge'

export type PreparedBadgeJob={job_id:string;print_kind:'initial'|'reprint';credential_token:string}
export type PendingBadgeJob={id:string;event_id:string;registration_id:string|null;participation_id:string|null;status:string;bridge_job_id:string|null;station_key:string|null;credential_token_snapshot:string;previous_credential_token:string|null;template_snapshot:BadgeTemplateV2|null;profile_snapshot:BridgeConfig['profile'];printer_name:string}
export async function badgeRpc<T=unknown>(name:string,args:Record<string,unknown>):Promise<T>{
  const result=await supabase.rpc(name,args)
  if(result.error)throw new Error(result.error.message)
  return result.data as T
}
export function printProfileSnapshot(config:BridgeConfig){return{...config.profile,stationKey:getBridgeStationId()}}
export async function updateBadgeJob(id:string,status:string,error?:string){
  await badgeRpc('update_badge_print_job',{p_job_id:id,p_status:status,p_bridge_job_id:null,p_payload_hash:null,p_error_message:error??null})
}
export async function getBadgePrintJob(id:string):Promise<PendingBadgeJob>{
  const result=await supabase.from('badge_print_jobs').select('*').eq('id',id).single()
  if(result.error)throw new Error(result.error.message)
  return result.data as PendingBadgeJob
}
export async function acknowledgeBridgeJob(config:BridgeConfig,id:string,local:BridgeJob){
  void config // The station is bound separately from the display name/printer.
  await badgeRpc('acknowledge_badge_print_job',{p_job_id:id,p_station_key:getBridgeStationId(),p_status:['queued','printing'].includes(local.status)?'sent':local.status,p_bridge_job_id:local.id,p_payload_hash:local.payloadHash??null,p_error_message:local.error??null})
}
const cloudLinks=new Map<string,{expires:number;pending:Promise<void>}>()
export async function ensureStationSync(config:BridgeConfig,eventId:string){
  const key=`${config.url}:${config.token}:${eventId}`,existing=cloudLinks.get(key)
  if(existing&&existing.expires>Date.now()+60*60*1000)return existing.pending
  const pending=(async()=>{
    const rows=await badgeRpc<{sync_token:string;expires_at:string}[]>('register_badge_print_station_sync',{p_event_id:eventId,p_station_key:getBridgeStationId()})
    if(!rows[0])throw new Error('No se pudo vincular la sincronización de la estación.')
    await linkBridgeCloud(config,{eventId,supabaseUrl:import.meta.env.VITE_SUPABASE_URL,anonKey:import.meta.env.VITE_SUPABASE_ANON_KEY,syncToken:rows[0].sync_token,expiresAt:rows[0].expires_at})
    const entry=cloudLinks.get(key);if(entry)entry.expires=Date.parse(rows[0].expires_at)
  })()
  cloudLinks.set(key,{expires:Date.now()+2*60*60*1000,pending})
  try{await pending}catch(error){cloudLinks.delete(key);throw error}
}
export async function waitForBridgeJob(config:BridgeConfig,local:BridgeJob,timeoutMs=30000):Promise<BridgeJob>{
  const deadline=Date.now()+timeoutMs
  while(['queued','printing'].includes(local.status)&&Date.now()<deadline){
    await new Promise(resolve=>window.setTimeout(resolve,400))
    try{local=await getBridgeJob(config,local.id)}catch{return local}
  }
  return local
}
export type DispatchResult={status:'spooled'|'pending'|'failed'|'cancelled';message?:string;local?:BridgeJob}
export async function dispatchBadgeJob(input:{config:BridgeConfig;eventId:string;jobId:string;template:BadgeTemplateV2;data:BadgeRenderData;title:string;priority?:number;wait?:boolean}):Promise<DispatchResult>{
  const {config,eventId,jobId,template,data}=input
  let attempted=false
  try{
    await ensureStationSync(config,eventId)
    await updateBadgeJob(jobId,'rendering')
    const pngDataUrls=await renderBadgeSides(template,data)
    // Mark submission before POST; a network timeout leaves a recoverable pending job.
    await updateBadgeJob(jobId,'sent')
    attempted=true
    let local=await submitBridgeJob(config,{cloudJobId:jobId,eventId,printer:config.printer,title:input.title,pngDataUrls,widthMm:template.width_mm,heightMm:template.height_mm,priority:input.priority})
    await acknowledgeBridgeJob(config,jobId,local)
    if(input.wait!==false)local=await waitForBridgeJob(config,local)
    await acknowledgeBridgeJob(config,jobId,local)
    return{status:['queued','printing'].includes(local.status)?'pending':local.status as DispatchResult['status'],local,message:local.error}
  }catch(error){
    const message=error instanceof Error?error.message:'No se pudo preparar la impresión.'
    if(!attempted){
      try{await updateBadgeJob(jobId,'failed',message)}catch(auditError){throw new Error(`${message} No se pudo registrar el fallo: ${auditError instanceof Error?auditError.message:'error de auditoría'}`)}
      throw error
    }
    // Never resend or declare failure when Windows may already own the job.
    try{
      const local=await getBridgeJobByCloudId(config,jobId)
      await acknowledgeBridgeJob(config,jobId,local)
      return{status:['queued','printing'].includes(local.status)?'pending':local.status as DispatchResult['status'],local,message}
    }catch{/* Retained as sent; background transport/browser reconciliation will recover it. */}
    if(error instanceof BridgeHttpError&&error.status>=400&&error.status<500&&error.status!==409){
      await updateBadgeJob(jobId,'failed',message);return{status:'failed',message}
    }
    return{status:'pending',message:`Envío pendiente de confirmación. ${message} Comprueba la cola antes de reintentar.`}
  }
}
export async function reconcileStationPrintJobs(config:BridgeConfig):Promise<boolean>{
  let after:string|null=null,changed=false
  do{
    const page:PendingBadgeJob[]=await badgeRpc<PendingBadgeJob[]>('get_badge_print_pending_jobs',{p_station_key:getBridgeStationId(),p_after_id:after,p_limit:100})
    for(let start=0;start<page.length;start+=5){
      const results=await Promise.allSettled(page.slice(start,start+5).map(async job=>{
        try{
          const local=await getBridgeJobByCloudId(config,job.id)
          await acknowledgeBridgeJob(config,job.id,local)
          return ['spooled','failed','cancelled'].includes(local.status)
        }catch(error){if(error instanceof BridgeHttpError&&error.status===404)return false;throw error}
      }))
      for(const result of results){if(result.status==='rejected')throw result.reason;changed=changed||result.value}
    }
    if(page.length<100)break
    after=page.at(-1)!.id
  }while(after)
  return changed
}
