import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { sendRecoveryEmail, type EmailSendBinding } from './email';

type Bindings = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; EMAIL: EmailSendBinding; EMAIL_FROM: string; APP_BASE_URL: string };
export const participantApi = new Hono<{Bindings: Bindings}>();
export const recoveryMessage = 'Si hay registros asociados, recibirás un enlace para consultarlos.';
export async function hashToken(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
}
export function newAccessToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join(''); }
const schema = z.object({email:z.string().trim().email().max(254),event_id:z.string().uuid().optional(),program_id:z.string().uuid().optional()}).refine(value=>!!value.event_id !== !!value.program_id);
participantApi.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');await next();});
participantApi.post('/recover',async c=>{
  const parsed=schema.safeParse(await c.req.json().catch(()=>null));
  if (!parsed.success) return c.json({error:'Indica un correo y un evento o programa válido.'},400);
  const input=parsed.data;
  // Uniform immediate response; DB lookup, limits and email happen afterwards.
  c.executionCtx.waitUntil((async()=>{
    try {
      const db=createClient(c.env.SUPABASE_URL,c.env.SUPABASE_SERVICE_ROLE_KEY);
      const token=newAccessToken();
      const {data,error}=await db.rpc('prepare_participant_recovery',{p_email:input.email,p_event_id:input.event_id??null,p_program_id:input.program_id??null,p_ip_hash:await hashToken(c.req.header('CF-Connecting-IP')??'unknown'),p_token_hash:await hashToken(token)});
      if(error) {console.error('[participant-recovery] prepare failed');return;}
      if(!data) return;
      const base=c.env.APP_BASE_URL.replace(/\/$/,'');
      // Fragment is not sent in HTTP requests or referrers; GET never redeems it.
      const result=await sendRecoveryEmail({email:c.env.EMAIL,from:c.env.EMAIL_FROM,to:input.email,url:`${base}/recuperar-registro#${token}`});
      const log=await db.from('email_log').insert({organization_id:data.organization_id,registration_id:data.registration_id,email_type:'participant_recovery_v1',recipient:input.email.toLowerCase(),provider:'cloudflare_email_service',provider_message_id:result.providerMessageId,provider_status:result.providerStatus,status:result.ok?'accepted':'failed',error_code:result.errorCode,error_detail:result.errorDetail,sent_at:result.ok?new Date().toISOString():null});
      if(log.error) console.error('[participant-recovery] audit failed');
    } catch {console.error('[participant-recovery] failed');}
  })());
  return c.json({message:recoveryMessage},202);
});
participantApi.post('/redeem',async c=>{
  const parsed=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return c.json({error:'Enlace inválido o vencido.'},400);
  const db=createClient(c.env.SUPABASE_URL,c.env.SUPABASE_SERVICE_ROLE_KEY);
  const {data:allowed,error:limitError}=await db.rpc('participant_rate_limit',{p_key:'redeem:'+await hashToken(c.req.header('CF-Connecting-IP')??'unknown'),p_limit:30});
  if(limitError||!allowed) return c.json({error:'Espera antes de volver a intentarlo.'},429);
  const session=newAccessToken();
  const {data,error}=await db.rpc('redeem_participant_recovery',{p_token_hash:await hashToken(parsed.data.token),p_session_hash:await hashToken(session)});
  if(error) return c.json({error:'No se pudo verificar el enlace. Inténtalo de nuevo.'},503);
  if(!data) return c.json({error:'Enlace inválido, usado o vencido. Solicita otro.'},401);
  return c.json({access_token:session});
});
participantApi.get('/records',async c=>{
  const token=c.req.header('Authorization')?.replace(/^Bearer /,'')??'';
  if(!/^[a-f0-9]{64}$/.test(token)) return c.json({error:'Necesitas un enlace de acceso válido.'},401);
  const db=createClient(c.env.SUPABASE_URL,c.env.SUPABASE_SERVICE_ROLE_KEY);
  const {data,error}=await db.rpc('get_participant_records',{p_session_hash:await hashToken(token)});
  if(error) return c.json({error:'No se pudo cargar el registro.'},503);
  if(!data) return c.json({error:'El acceso venció. Solicita un nuevo enlace.'},401);
  return c.json({records:data});
});
participantApi.post('/close',async c=>{
  const token=c.req.header('Authorization')?.replace(/^Bearer /,'')??'';
  if(!/^[a-f0-9]{64}$/.test(token)) return c.json({error:'Acceso inválido.'},401);
  const db=createClient(c.env.SUPABASE_URL,c.env.SUPABASE_SERVICE_ROLE_KEY);
  const {error}=await db.rpc('close_participant_access',{p_session_hash:await hashToken(token)});
  if(error) return c.json({error:'No se pudo cerrar el acceso. Inténtalo de nuevo.'},503);
  return c.json({ok:true});
});
