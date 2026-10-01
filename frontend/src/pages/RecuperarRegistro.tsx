import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTenant } from '../lib/useTenant';
const api = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/,'');
export default function RecuperarRegistro() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const {tenant,loading:tenantLoading} = useTenant();
  const [recoveryToken] = useState(()=>window.location.hash.slice(1));
  const [scope,setScope] = useState(params.get('programa')?`program:${params.get('programa')}`:params.get('evento')?`event:${params.get('evento')}`:'');
  const [choices,setChoices] = useState<{id:string;name:string;kind:string}[]>([]);
  const [email,setEmail] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState<string | null>(null);
  const [error,setError] = useState<string | null>(null);
  useEffect(()=>{
    if (recoveryToken) window.history.replaceState(null,'',window.location.pathname+window.location.search);
  },[recoveryToken]);
  useEffect(()=>{
    if (scope || tenantLoading || recoveryToken) return;
    let active=true;
    let events=supabase.from('events').select('id,name').eq('status','published').order('name');
    let programs=supabase.from('event_programs').select('id,name').eq('status','published').order('name');
    if (tenant) {events=events.eq('organization_id',tenant.id);programs=programs.eq('organization_id',tenant.id);}
    void Promise.all([events,programs]).then(([ev,pr])=>{if(active){if(ev.error||pr.error)setError('No se pudieron cargar los eventos. Abre la recuperación desde la web de tu evento.');else setChoices([...(ev.data??[]).map(item=>({...item,kind:'event'})),...(pr.data??[]).map(item=>({...item,kind:'program'}))]);}});
    return ()=>{active=false;};
  },[scope,tenant,tenantLoading,recoveryToken]);
  async function submit(redeem:boolean) {
    setBusy(true);setError(null);setMessage(null);
    try {
      if (!api) throw new Error('El servicio no está configurado.');
      const [kind,id]=scope.split(':');
      const response=await fetch(`${api}/api/participant/${redeem?'redeem':'recover'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(redeem?{token:recoveryToken}:{email,...(kind==='program'?{program_id:id}:{event_id:id})})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error??'No se pudo completar la solicitud.');
      if(redeem){sessionStorage.setItem('participant_access',result.access_token);navigate('/mi-registro',{replace:true});}else setMessage(result.message);
    }catch(err){setError(err instanceof Error?err.message:'No se pudo conectar.');}finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-lg px-5 py-12"><h1 className="text-2xl font-bold">Recuperar mi registro y credencial</h1><p className="mt-3 text-zinc-600">Consulta el estado de tu registro o abre tu credencial si ya está confirmada.</p>{recoveryToken?<div className="mt-6"><p>El enlace se utilizará al pulsar el botón. No necesitas crear una cuenta.</p><button disabled={busy} onClick={()=>void submit(true)} className="mt-4 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy?'Verificando…':'Abrir mis registros'}</button></div>:<form className="mt-6 space-y-5" onSubmit={e=>{e.preventDefault();void submit(false);}}>{!params.get('evento')&&!params.get('programa')&&<label className="block">Evento o programa<select required value={scope} onChange={e=>setScope(e.target.value)} className="mt-2 w-full rounded-lg border p-3"><option value="">Selecciona tu evento</option>{choices.map(item=><option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{item.name}</option>)}</select></label>}<label className="block">Correo utilizado en el registro<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="mt-2 w-full rounded-lg border p-3"/></label><button disabled={busy||!scope} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy?'Solicitando…':'Enviar enlace de acceso'}</button></form>}{message&&<p role="status" className="mt-5 rounded-lg bg-emerald-50 p-4">{message}</p>}{error&&<p role="alert" className="mt-5 rounded-lg bg-amber-50 p-4">{error}</p>}{recoveryToken&&<a href="/recuperar-registro" className="mt-5 block text-emerald-700 underline">Solicitar otro enlace</a>}</main>;
}
