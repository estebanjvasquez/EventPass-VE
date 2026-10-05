import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PurchaseSummary from '../components/PurchaseSummary';
import { emailState, participantState, purchaseDate, type ParticipantRecord } from '../lib/participant';
const api = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/,'');
export default function MiRegistro() {
  const {accessToken} = useParams();
  const navigate = useNavigate();
  const [token] = useState(()=>accessToken ?? sessionStorage.getItem('participant_access'));
  const [records,setRecords] = useState<ParticipantRecord[]>([]);
  const [selected,setSelected] = useState('');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const [revision,setRevision] = useState(0);
  useEffect(()=>{
    if (accessToken && /^[a-f0-9]{64}$/.test(accessToken)) { sessionStorage.setItem('participant_access',accessToken); navigate('/mi-registro',{replace:true}); }
  },[accessToken,navigate]);
  useEffect(()=>{
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null);
      if (!api || !token) { setError('Solicita un enlace para consultar tu registro.'); setLoading(false); return; }
      try {
        const response = await fetch(`${api}/api/participant/records`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) { setRecords([]); setError(result.error ?? 'No se pudo consultar el registro.'); return; }
        setRecords(result.records); setSelected(current=>result.records.some((record:ParticipantRecord)=>record.id===current)?current:result.records[0]?.id??'');
      } catch { if (!controller.signal.aborted) setError('No se pudo conectar. Inténtalo de nuevo.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return ()=>controller.abort();
  },[token,revision]);
  const record = records.find(item=>item.id===selected);
  const state = record && participantState(record);
  async function closeAccess() {
    if (!api || !token) return;
    try {
      const response=await fetch(`${api}/api/participant/close`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok) {setError('No se pudo cerrar el acceso. Inténtalo de nuevo.');return;}
      sessionStorage.removeItem('participant_access'); navigate('/recuperar-registro',{replace:true});
    } catch {setError('No se pudo cerrar el acceso. Comprueba la conexión.');}
  }
  return <main className="mx-auto max-w-2xl px-5 py-10"><h1 className="text-2xl font-bold">Mi registro</h1>{loading && <p role="status" className="mt-4">Consultando estado…</p>}{error && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-4">{error}</p>}{!loading && !error && !record && <p className="mt-4">No hay registros disponibles.</p>}{records.length>1 && <label className="mt-5 block">Selecciona un registro<select className="mt-2 w-full rounded-lg border p-3" value={selected} onChange={e=>setSelected(e.target.value)}>{records.map(item=><option key={item.id} value={item.id}>{item.snapshot.event_name} · {item.reference}</option>)}</select></label>}{record && !loading && !error && <><p className="mt-4 text-sm">{record.name} · Referencia {record.reference}</p><div className="my-5 rounded-xl bg-emerald-50 p-5"><h2 className="font-bold">{state?.label}</h2><p className="mt-2">{state?.detail}</p>{record.deadline && <p className="mt-2 text-sm">Plazo: {purchaseDate(record.deadline,record.snapshot.timezone)}</p>}</div><PurchaseSummary snapshot={record.snapshot}/>{record.passes?.length ? <p className="mt-4">Pases: {record.passes.join(', ')}</p>:null}{record.email_status && <p className="mt-4 text-sm text-zinc-600">Correo: {emailState(record.email_status)}</p>}<div className="mt-5 flex flex-wrap gap-4">{record.status==='confirmed' && record.credential_token && <Link to={`/credencial/${record.credential_token}`} className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white">Ver e imprimir credencial</Link>}{record.upload_token && state?.label==='Pendiente de pago' && <Link to={record.upload_kind==='program'?`/programa/comprobante/${record.upload_token}`:`/comprobante/${record.upload_token}`} className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white">Cargar comprobante</Link>}<Link className="py-3 font-semibold text-emerald-700" to={record.program_id?`/p/${record.program_id}/agenda`:`/e/${record.event_id}/programa`}>Consultar agenda</Link></div></>}<div className="mt-6 flex flex-wrap gap-4"><button type="button" onClick={()=>setRevision(value=>value+1)} disabled={loading} className="rounded-lg border px-4 py-2 disabled:opacity-50">Actualizar estado</button><Link className="py-2 text-emerald-700 underline" to="/recuperar-registro">Solicitar otro enlace</Link>{token && <button className="rounded-lg border px-4 py-2" onClick={()=>void closeAccess()}>Cerrar acceso</button>}</div></main>;
}
