import {useEffect,useMemo,useRef,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import {Html5Qrcode} from 'html5-qrcode'
import {Camera,CheckCircle2,Printer,RotateCcw} from 'lucide-react'
import {defaultBadgeLayout,type BadgeTemplateV2} from '../../lib/badgeStudio'
import {extractCredentialToken} from '../../lib/credentialQr'
import {bridgeHealth,bridgePrinters,getBridgeJobByCloudId,loadBridgeConfig} from '../../lib/printBridge'
import {acknowledgeBridgeJob,badgeRpc,dispatchBadgeJob,ensureStationSync,getBadgePrintJob,printProfileSnapshot,updateBadgeJob,type PreparedBadgeJob} from '../../lib/badgePrintWorkflow'
import {resolveActiveOrg} from '../../lib/activeOrg'
import {supabase} from '../../lib/supabase'
import {usePrintReconciliation} from '../../components/badges/usePrintReconciliation'

type Reg={id:string;record_type:'registration'|'participation';first_name:string;last_name:string|null;cedula:string|null;company:string|null;job_title:string|null;participation_type:string;status:string;credential_token:string;seat_label:string|null;badge_cancelled_at:string|null}
const labels:Record<string,string>={attendee:'Participante',guest:'Invitado',vip:'VIP',speaker:'Ponente',exhibitor:'Expositor',staff:'Staff',security:'Seguridad'}
const readerId='badge-kiosk-reader'
export default function AcreditacionKiosco(){
  const {eventId}=useParams()
  const [eventName,setEventName]=useState(''),[orgName,setOrgName]=useState('')
  const [templates,setTemplates]=useState<BadgeTemplateV2[]>([]),[code,setCode]=useState('')
  const [status,setStatus]=useState<'ready'|'scanning'|'printing'|'pending'|'done'|'error'>('ready')
  const [message,setMessage]=useState('Escanea el QR de tu registro para imprimir la credencial.')
  const [person,setPerson]=useState<Reg|null>(null),[pendingJobId,setPendingJobId]=useState<string|null>(null)
  const [connected,setConnected]=useState(false),[deliveryBusy,setDeliveryBusy]=useState(false)
  const busy=useRef(false),config=useMemo(()=>loadBridgeConfig(),[]),processCodeRef=useRef(processCode)
  processCodeRef.current=processCode
  const checkPendingRef=useRef(checkPending);checkPendingRef.current=checkPending
  useEffect(()=>{
    if(!eventId)return;let disposed=false
    void(async()=>{
      try{
        const active=await resolveActiveOrg();if(!disposed)setOrgName(active?.organizations?.name??'EventosFácil')
        const options=await badgeRpc<{id:string;name:string;can_print:boolean}[]>('get_accreditation_event_options',{})
        const event=options.find(item=>item.id===eventId&&item.can_print)
        if(!event)throw new Error('Esta sesión no tiene permiso de impresión para el evento.')
        const result=await supabase.from('badge_templates').select('*').eq('event_id',eventId).eq('active',true).eq('template_status','published')
        if(result.error)throw new Error(result.error.message)
        const health=await bridgeHealth(config)
        if(health.version.startsWith('0.')&&Number(health.version.split('.')[1])<3)throw new Error('Actualiza el conector a la versión 0.3.0 desde el Centro de impresión.')
        const printers=await bridgePrinters(config)
        if(!printers.printers.some(printer=>printer.name===config.printer&&!printer.offline))throw new Error('La impresora seleccionada no está disponible. Configúrala desde el Centro de impresión.')
        await ensureStationSync(config,eventId)
        if(!disposed){setEventName(event.name);setTemplates((result.data??[]) as BadgeTemplateV2[]);setConnected(true)}
      }catch(error){if(!disposed){setStatus('error');setMessage(error instanceof Error?error.message:'La estación no está conectada. Solicita ayuda al personal.')}}
    })()
    return()=>{disposed=true}
  },[eventId,config])
  useEffect(()=>{
    if(status!=='scanning')return
    const scanner=new Html5Qrcode(readerId);let closed=false
    void scanner.start({facingMode:'environment'},{fps:12,qrbox:{width:260,height:260}},decoded=>{if(!closed)void processCodeRef.current(decoded)},undefined).catch(()=>{setStatus('error');setMessage('No se pudo abrir la cámara. Introduce el código manualmente.')})
    return()=>{closed=true;void scanner.stop().then(()=>scanner.clear()).catch(()=>undefined)}
  },[status])
  usePrintReconciliation(eventId??'',config,connected,()=>{if(status==='pending')void checkPending()},text=>setMessage(`Sincronización pendiente: ${text}`))
  useEffect(()=>{
    if(status!=='pending'||!pendingJobId)return
    const timer=window.setInterval(()=>void checkPendingRef.current(),5000)
    return()=>window.clearInterval(timer)
  },[status,pendingJobId])
  function reset(){busy.current=false;setCode('');setPerson(null);setPendingJobId(null);setStatus('ready');setMessage('Escanea el QR de tu registro para imprimir la credencial.')}
  async function checkPending(){
    if(!pendingJobId)return
    try{
      const local=await getBridgeJobByCloudId(config,pendingJobId);await acknowledgeBridgeJob(config,pendingJobId,local)
      if(local.status==='spooled'){setStatus('done');setMessage('Windows confirmó el trabajo. Comprueba la credencial y confirma que la retiraste.')}
      else if(local.status==='failed'||local.status==='cancelled'){busy.current=false;setStatus('error');setMessage(local.error??'El trabajo fue cancelado. Solicita ayuda al personal.')}
    }catch(error){setMessage(`Trabajo pendiente de confirmación. ${error instanceof Error?error.message:'Comprueba la estación.'} Evita volver a enviarlo.`)}
  }
  async function confirmDelivery(){
    if(!pendingJobId||deliveryBusy)return;setDeliveryBusy(true)
    try{await updateBadgeJob(pendingJobId,'delivered');reset()}
    catch(error){setMessage(error instanceof Error?error.message:'No se pudo registrar la entrega.')}
    finally{setDeliveryBusy(false)}
  }
  async function processCode(raw:string){
    if(!eventId||busy.current)return
    if(!connected||!config.printer){setStatus('error');setMessage('Esta estación no tiene una impresora conectada. Solicita ayuda al personal.');return}
    busy.current=true;setStatus('printing');setMessage('Verificando registro y preparando credencial…')
    let jobId:string|null=null,delegated=false
    try{
      const found=await badgeRpc<Reg[]>('get_event_badge_for_print',{p_event_id:eventId,p_token:extractCredentialToken(raw)})
      const reg=found[0]
      if(!reg||reg.badge_cancelled_at||!['confirmed','approved'].includes(reg.status))throw new Error('La credencial no está disponible para este evento. Solicita ayuda al personal.')
      const template=templates.find(item=>item.participation_type===reg.participation_type)??({participation_type:reg.participation_type,name:labels[reg.participation_type]??reg.participation_type,size_key:'etiqueta',primary_color:'#047857',background_color:'#ffffff',text_color:'#18181b',header_text:'',footer_text:'',show_company:true,show_job_title:true,show_identification:false,show_qr:true,width_mm:100,height_mm:60,dpi:300,double_sided:false,layout:defaultBadgeLayout(),back_layout:{version:1,elements:[]},template_status:'published',version:1} satisfies BadgeTemplateV2)
      const prepared=await badgeRpc<PreparedBadgeJob[]>('prepare_badge_print_job',{p_event_id:eventId,p_record_type:reg.record_type,p_record_id:reg.id,p_template_id:template.id??null,p_station_label:config.station,p_printer_name:config.printer,p_reason:'Reimpresión solicitada en kiosco',p_output_sides:template.double_sided?2:1,p_profile_snapshot:printProfileSnapshot(config)})
      if(!prepared[0])throw new Error('No se pudo preparar la impresión.')
      jobId=prepared[0].job_id;setPendingJobId(jobId);setPerson(reg)
      const stored=await getBadgePrintJob(jobId);delegated=true
      const result=await dispatchBadgeJob({config,eventId,jobId,template:stored.template_snapshot??template,data:{...reg,credential_token:prepared[0].credential_token,event_name:eventName,organization_name:orgName,participation_type:labels[reg.participation_type]??reg.participation_type},title:`${eventName} · ${reg.first_name}`})
      if(result.status==='spooled'){setStatus('done');setMessage('Windows confirmó el trabajo. Comprueba la credencial y confirma que la retiraste.')}
      else if(result.status==='pending'){setStatus('pending');setMessage(result.message??'Trabajo pendiente en la cola. Se actualizará automáticamente; evita volver a enviarlo.')}
      else throw new Error(result.message??'No se pudo imprimir. Solicita ayuda al personal.')
    }catch(error){
      let text=error instanceof Error?error.message:'No se pudo imprimir.'
      if(jobId&&!delegated){try{await updateBadgeJob(jobId,'failed',text)}catch(auditError){text+=` No se pudo registrar el fallo: ${auditError instanceof Error?auditError.message:'error de auditoría'}`}}
      busy.current=false;setStatus('error');setMessage(text)
    }
  }
  return <main className="grid min-h-[100dvh] place-items-center bg-zinc-950 p-5 text-white"><section className="w-full max-w-2xl rounded-3xl bg-white p-7 text-zinc-900 shadow-2xl sm:p-10">
    <div className="text-center"><p className="text-sm font-bold uppercase tracking-widest text-emerald-700">{orgName}</p><h1 className="mt-2 text-3xl font-black">{eventName}</h1><p role="status" className="mt-3 text-zinc-600">{message}</p></div>
    {status==='scanning'&&<div id={readerId} className="mx-auto mt-6 max-w-md overflow-hidden rounded-2xl bg-black"/>}
    {status==='done'&&<CheckCircle2 className="mx-auto mt-8 h-24 w-24 text-emerald-600"/>}
    {['printing','pending'].includes(status)&&<Printer className="mx-auto mt-8 h-20 w-20 animate-pulse text-emerald-600"/>}
    {status==='ready'&&<div className="mt-8 grid gap-4 sm:grid-cols-2"><button disabled={!connected} onClick={()=>setStatus('scanning')} className="inline-flex min-h-28 items-center justify-center gap-3 rounded-2xl bg-emerald-700 p-5 text-lg font-bold text-white disabled:opacity-40"><Camera className="h-7 w-7"/>Escanear QR</button><form onSubmit={event=>{event.preventDefault();void processCode(code)}} className="rounded-2xl border p-4"><label className="text-sm font-bold">Código manual<input autoFocus className="mt-2 w-full rounded-xl border px-4 py-3" value={code} onChange={e=>setCode(e.target.value)} placeholder="Código de credencial"/></label><button disabled={!code.trim()||!connected} className="mt-3 w-full rounded-xl bg-zinc-900 px-4 py-2.5 font-bold text-white disabled:opacity-40">Continuar</button></form></div>}
    {status==='error'&&<button onClick={reset} className="mx-auto mt-7 flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 font-bold text-white"><RotateCcw className="h-5 w-5"/>Volver</button>}
    {status==='pending'&&<button onClick={()=>void checkPending()} className="mx-auto mt-5 block rounded-xl border px-6 py-3 font-bold">Comprobar estado</button>}
    {person&&status==='done'&&<><p className="mt-5 text-center text-xl font-bold">{person.first_name} {person.last_name}</p><button type="button" disabled={deliveryBusy} onClick={()=>void confirmDelivery()} className="mx-auto mt-5 block rounded-xl bg-emerald-700 px-6 py-3 text-lg font-bold text-white disabled:opacity-40">Ya retiré mi credencial</button></>}
    <Link to="/admin/acreditacion" className="mt-8 block text-center text-sm font-semibold text-zinc-500">Salir del modo kiosco</Link>
  </section></main>
}
