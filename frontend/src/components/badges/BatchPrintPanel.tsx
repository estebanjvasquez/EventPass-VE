import { useEffect, useMemo, useState } from "react";
import { Layers3, LoaderCircle, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

export type BatchCandidate = {
  id: string;
  record_type: "registration" | "participation";
  first_name: string;
  last_name: string | null;
  cedula: string | null;
  company: string | null;
  job_title: string | null;
  participation_type: string;
  status: string;
  attendance_status: string;
  credential_token: string;
  seat_label: string | null;
  badge_cancelled_at: string | null;
  already_printed: boolean;
  has_template: boolean;
};

export type BatchSummary = {
  id: string;
  name: string;
  status: "preparing" | "queued" | "processing" | "completed" | "partial" | "failed" | "cancelled";
  printer_name: string;
  total_jobs: number;
  queued_jobs: number;
  spooled_jobs: number;
  failed_jobs: number;
  cancelled_jobs: number;
  created_by_name: string | null;
  created_at: string;
};

const labels: Record<string, string> = {
  attendee: "Participante", guest: "Invitado", vip: "VIP", speaker: "Ponente",
  exhibitor: "Expositor", staff: "Staff", security: "Seguridad",
};
const statusLabels: Record<BatchSummary["status"], string> = {
  preparing: "Preparando", queued: "En cola", processing: "Procesando", completed: "Completado",
  partial: "Parcial", failed: "Fallido", cancelled: "Cancelado",
};
const field = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500";

export default function BatchPrintPanel({eventId,connected,printer,batches,onStart,busy}:{
  eventId:string; connected:boolean; printer:string; batches:BatchSummary[]; busy:boolean;
  onStart:(records:BatchCandidate[],name:string,allowReprints:boolean)=>Promise<void>;
}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [type,setType]=useState("");
  const [includePrinted,setIncludePrinted]=useState(false);
  const [rows,setRows]=useState<BatchCandidate[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const key=(row:BatchCandidate)=>`${row.record_type}:${row.id}`;
  const eligible=useMemo(()=>rows.filter(row=>row.has_template&&(!row.already_printed||includePrinted)),[rows,includePrinted]);
  const picked=useMemo(()=>rows.filter(row=>selected.includes(key(row))),[rows,selected]);

  useEffect(()=>{setRows([]);setSelected([]);setMessage(null)},[eventId]);
  async function load(){
    if(!eventId)return;
    setLoading(true);setMessage(null);
    const result=await supabase.rpc("list_event_badges_for_batch",{p_event_id:eventId,p_query:query.trim(),p_participation_type:type||null,p_include_printed:includePrinted,p_limit:250});
    setLoading(false);
    if(result.error){setMessage(result.error.message);return}
    const next=(result.data??[]) as BatchCandidate[];setRows(next);setSelected(current=>current.filter(item=>next.some(row=>key(row)===item)));
    if(!next.length)setMessage("No hay credenciales listas con estos filtros.");
  }
  function toggle(row:BatchCandidate){const id=key(row);setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])}
  const missing=rows.filter(row=>!row.has_template).length;
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)} className="mt-4 rounded-2xl border border-violet-200 bg-white">
    <summary className="cursor-pointer list-none p-5"><div className="flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-2 font-bold"><Layers3 className="h-5 w-5 text-violet-700"/>Preimpresión por lotes</span><span className="text-xs font-semibold text-zinc-500">Hasta 250 credenciales por lote</span></div></summary>
    <div className="border-t p-5">
      <p className="text-sm text-zinc-600">Prepara credenciales antes del evento sin registrar check-in ni entrega. Cada trabajo conserva participante, plantilla, estación y operador.</p>
      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px_auto_auto]">
        <input aria-label="Buscar participantes del lote" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nombre, cédula o empresa" className={field}/>
        <select aria-label="Tipo de participante del lote" value={type} onChange={event=>setType(event.target.value)} className={field}><option value="">Todos los tipos</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><input type="checkbox" checked={includePrinted} onChange={event=>{setIncludePrinted(event.target.checked);setSelected([])}}/>Incluir impresas</label>
        <button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Cargar</button>
      </div>
      {message&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
      {!!rows.length&&<>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 p-3 text-sm"><span><b>{rows.length}</b> encontradas · <b>{picked.length}</b> seleccionadas{missing?` · ${missing} sin plantilla`:""}</span><div className="flex gap-2"><button type="button" onClick={()=>setSelected(eligible.map(key))} className="rounded border bg-white px-3 py-1.5 text-xs font-semibold">Seleccionar aptas</button><button type="button" onClick={()=>setSelected([])} className="rounded border bg-white px-3 py-1.5 text-xs font-semibold">Limpiar</button></div></div>
        <div className="mt-2 max-h-80 overflow-auto rounded-xl border"><table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 bg-zinc-100 text-xs text-zinc-600"><tr><th className="p-3"></th><th className="p-3">Participante</th><th className="p-3">Tipo</th><th className="p-3">Empresa</th><th className="p-3">Estado</th></tr></thead><tbody className="divide-y">{rows.map(row=>{const disabled=!row.has_template||(!includePrinted&&row.already_printed);return <tr key={key(row)} className={disabled?"bg-zinc-50 text-zinc-400":""}><td className="p-3"><input aria-label={`Seleccionar ${row.first_name} ${row.last_name??""}`} type="checkbox" disabled={disabled} checked={selected.includes(key(row))} onChange={()=>toggle(row)}/></td><td className="p-3"><b>{row.first_name} {row.last_name??""}</b><small className="block text-zinc-500">{row.cedula??row.seat_label??"Sin identificación"}</small></td><td className="p-3">{labels[row.participation_type]??row.participation_type}</td><td className="p-3">{row.company??"—"}</td><td className="p-3">{!row.has_template?<span className="font-semibold text-red-700">Sin plantilla</span>:row.already_printed?<span className="font-semibold text-amber-700">Reimpresión</span>:<span className="font-semibold text-emerald-700">Lista</span>}</td></tr>})}</tbody></table></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-zinc-500">Destino: {connected&&printer?printer:"conecta el Print Bridge y elige una impresora"}</p><button type="button" disabled={busy||!connected||!printer||!picked.length||picked.some(row=>!row.has_template)} onClick={()=>void onStart(picked,`Preimpresión ${new Date().toLocaleString("es-VE")}`,includePrinted)} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<Layers3 className="h-4 w-4"/>}Enviar {picked.length} a la cola</button></div>
      </>}
      {!!batches.length&&<div className="mt-6"><h3 className="text-sm font-bold">Lotes recientes</h3><div className="mt-2 grid gap-2">{batches.map(batch=>{const finished=batch.spooled_jobs+batch.failed_jobs+batch.cancelled_jobs;const percent=batch.total_jobs?Math.round(finished/batch.total_jobs*100):0;return <div key={batch.id} className="rounded-xl border p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span><b>{batch.name}</b><small className="ml-2 text-zinc-500">{batch.printer_name}</small></span><span className="font-semibold">{statusLabels[batch.status]} · {finished}/{batch.total_jobs}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full ${batch.failed_jobs?"bg-amber-500":"bg-emerald-600"}`} style={{width:`${percent}%`}}/></div><p className="mt-2 text-xs text-zinc-500">{batch.spooled_jobs} impresas · {batch.queued_jobs} pendientes · {batch.failed_jobs} fallidas · {new Date(batch.created_at).toLocaleString("es-VE")}</p></div>})}</div></div>}
    </div>
  </details>
}
