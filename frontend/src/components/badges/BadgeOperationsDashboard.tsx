import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Gauge, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../lib/supabase";

type Dashboard={
  summary:{ready:number;total_jobs:number;pending:number;printed:number;failed:number;reprints:number;preprinted:number;average_seconds:number;failure_rate:number};
  hourly:{hour:string;total:number;printed:number;failed:number}[];
  by_type:{label:string;total:number;printed:number}[];
  by_station:{label:string;total:number;printed:number;failed:number}[];
  stations:{station_key:string;label:string;state:"connected"|"offline"|"unknown";version:string|null;printer:string|null;queue:number;printer_count:number;offline_printers:number;operator:string|null;last_seen_at:string}[];
  readiness:{participant_types:number;published_templates:number;open_batches:number};
};
const empty:Dashboard={summary:{ready:0,total_jobs:0,pending:0,printed:0,failed:0,reprints:0,preprinted:0,average_seconds:0,failure_rate:0},hourly:[],by_type:[],by_station:[],stations:[],readiness:{participant_types:0,published_templates:0,open_batches:0}};
const typeLabels:Record<string,string>={attendee:"Participante",guest:"Invitado",vip:"VIP",speaker:"Ponente",exhibitor:"Expositor",staff:"Staff",security:"Seguridad",unknown:"Sin tipo"};
const csv=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;

export default function BadgeOperationsDashboard({eventId,refreshToken=0}:{eventId:string;refreshToken?:number}){
  const [open,setOpen]=useState(false);
  const [data,setData]=useState<Dashboard>(empty);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{
    if(!eventId)return;setLoading(true);setError(null);
    const result=await supabase.rpc("get_badge_operations_dashboard",{p_event_id:eventId});
    setLoading(false);if(result.error){setError(result.error.message);return}setData((result.data??empty) as Dashboard);
  },[eventId]);
  useEffect(()=>{if(open)void load()},[eventId,open,refreshToken,load]);
  useEffect(()=>{if(!open)return;const timer=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(timer)},[open,load]);
  const stations=useMemo(()=>data.stations.map(station=>({...station,online:station.state==="connected"&&Date.now()-new Date(station.last_seen_at).getTime()<90000})),[data.stations]);
  const alerts=useMemo(()=>{
    const values:string[]=[];
    if(data.readiness.participant_types>data.readiness.published_templates)values.push(`Faltan ${data.readiness.participant_types-data.readiness.published_templates} plantilla(s) para cubrir todos los tipos confirmados.`);
    if(!stations.some(station=>station.online))values.push("No hay estaciones conectadas con actividad en los últimos 90 segundos.");
    if(data.summary.pending)values.push(`Hay ${data.summary.pending} trabajo(s) pendientes de confirmación.`);
    if(data.summary.failure_rate>=5)values.push(`La tasa de fallos es ${data.summary.failure_rate}%; revisa impresora, consumibles y calibración.`);
    if(stations.some(station=>station.offline_printers))values.push("Una estación reporta impresoras sin conexión.");
    return values;
  },[data,stations]);
  async function exportCsv(){
    setError(null);const result=await supabase.rpc("get_badge_operations_export",{p_event_id:eventId});if(result.error){setError(result.error.message);return}
    const headers=["Trabajo","Participante","Tipo","Lote","Clase","Modalidad","Estado","Estación","Impresora","Operador","Creado","Impreso","Entregado","Error"];
    const rows=(result.data??[]) as Record<string,unknown>[];
    const body=[headers.map(csv).join(","),...rows.map(row=>[row.job_id,row.participant_name,typeLabels[String(row.participation_type)]??row.participation_type,row.batch_name,row.print_kind,row.fulfillment_mode,row.status,row.station_label,row.printer_name,row.operator_name,row.queued_at,row.spooled_at,row.delivered_at,row.error_message].map(csv).join(","))].join("\n");
    const url=URL.createObjectURL(new Blob([`\uFEFF${body}`],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`operacion-credenciales-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);
  }
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)} className="mt-4 rounded-2xl border border-sky-200 bg-white">
    <summary className="cursor-pointer list-none p-5"><div className="flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-2 font-bold"><Gauge className="h-5 w-5 text-sky-700"/>Centro de control</span><span className="text-xs font-semibold text-zinc-500">Estaciones, rendimiento y alertas en tiempo real</span></div></summary>
    <div className="border-t p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Operación de credenciales</h3><p className="mt-1 text-sm text-zinc-600">Actualización automática cada 15 segundos.</p></div><div className="flex gap-2"><button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Actualizar</button><button type="button" onClick={()=>void exportCsv()} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white"><Download className="h-4 w-4"/>Exportar CSV</button></div></div>
      {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Listos",data.summary.ready],["Impresas",data.summary.printed],["Preimpresas",data.summary.preprinted],["Pendientes",data.summary.pending],["Fallos",data.summary.failed],["Promedio",`${data.summary.average_seconds}s`]].map(([label,value])=><div key={String(label)} className="rounded-xl border bg-zinc-50 p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><section className="rounded-xl border p-4"><h4 className="text-sm font-bold">Últimas 12 horas</h4><div className="mt-3 h-56"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.hourly}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="hour" fontSize={11}/><YAxis allowDecimals={false} fontSize={11}/><Tooltip/><Area type="monotone" dataKey="printed" name="Impresas" stroke="#047857" fill="#d1fae5"/><Area type="monotone" dataKey="failed" name="Fallidas" stroke="#dc2626" fill="#fee2e2"/></AreaChart></ResponsiveContainer></div></section><section className="rounded-xl border p-4"><h4 className="text-sm font-bold">Por tipo de participante</h4><div className="mt-3 h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.by_type.map(item=>({...item,label:typeLabels[item.label]??item.label}))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label" fontSize={10}/><YAxis allowDecimals={false} fontSize={11}/><Tooltip/><Bar dataKey="printed" name="Impresas" fill="#0369a1" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></section></div>
      {!!alerts.length&&<section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><h4 className="inline-flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4"/>Atención requerida</h4><ul className="mt-2 grid gap-1 text-sm text-amber-900">{alerts.map(alert=><li key={alert}>• {alert}</li>)}</ul></section>}
      {!alerts.length&&<p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">La operación no presenta alertas activas.</p>}
      <section className="mt-4 rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><h4 className="font-bold">Estaciones</h4><span className="text-xs text-zinc-500">{stations.filter(station=>station.online).length} conectadas · {stations.length} registradas</span></div><div className="divide-y">{stations.map(station=><div key={station.station_key} className="grid gap-2 p-4 text-sm md:grid-cols-[1.2fr_1fr_1fr_auto]"><span className="inline-flex items-center gap-2 font-bold">{station.online?<Wifi className="h-4 w-4 text-emerald-600"/>:<WifiOff className="h-4 w-4 text-zinc-400"/>}{station.label}</span><span>{station.printer??"Sin impresora"}<small className="block text-zinc-500">{station.printer_count} detectadas · {station.offline_printers} offline</small></span><span>{station.operator??"Sin operador"}<small className="block text-zinc-500">Bridge {station.version??"—"}</small></span><span className="text-xs text-zinc-500">{new Date(station.last_seen_at).toLocaleTimeString("es-VE")}</span></div>)}{!stations.length&&<p className="p-5 text-sm text-zinc-500">Las estaciones aparecerán al abrir este módulo desde cada mostrador.</p>}</div></section>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Readiness label="Plantillas publicadas" value={`${data.readiness.published_templates}/${data.readiness.participant_types}`} ok={data.readiness.published_templates>=data.readiness.participant_types}/><Readiness label="Estación activa" value={stations.some(station=>station.online)?"Lista":"Pendiente"} ok={stations.some(station=>station.online)}/><Readiness label="Lotes abiertos" value={String(data.readiness.open_batches)} ok={data.readiness.open_batches===0}/></div>
    </div>
  </details>
}

function Readiness({label,value,ok}:{label:string;value:string;ok:boolean}){return <div className={`rounded-xl border p-3 ${ok?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50"}`}><p className="text-xs text-zinc-600">{label}</p><p className={`mt-1 font-bold ${ok?"text-emerald-800":"text-amber-800"}`}>{value}</p></div>}
