import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Rocket } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { type EventReadiness } from "../../lib/eventPresentation";
import { supabase } from "../../lib/supabase";

const destinations: Record<string, string> = {
  basics: "administrar", dates: "administrar", deadline: "administrar", registration: "registros",
  price: "entradas", payments: "registros", agenda: "resumen", passes: "resumen",
  contact: "landing", public_link: "landing",
};

export default function EventLaunchChecklist() {
  const { eventId } = useParams();
  const [readiness, setReadiness] = useState<EventReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true); setError(null);
    const result = await supabase.rpc("get_event_launch_readiness", { p_event_id: eventId });
    setLoading(false);
    if (result.error) setError(result.error.message);
    else setReadiness(result.data as unknown as EventReadiness);
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);
  const checks = readiness?.checks ?? [];
  const completed = checks.filter((item) => item.ok).length;
  const blockers = checks.filter((item) => item.blocking && !item.ok).length;

  return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-7">
    <header><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">Lanzamiento</p><h1 className="mt-1 text-2xl font-bold">Checklist del evento</h1><p className="mt-1 text-sm text-zinc-600">Validación automática de registro, cobro, fechas, agenda y enlaces públicos.</p></header>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="mt-6 rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between gap-4"><div><h2 className="font-bold">Preparación actual</h2><p className="text-sm text-zinc-600">{loading ? "Comprobando configuración…" : `${completed} de ${checks.length} verificaciones listas.`}</p></div><Rocket className="h-7 w-7 text-emerald-700" /></div>
      {loading ? <div className="mt-6 space-y-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-zinc-100" />)}</div> : <>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-emerald-600" style={{ width: `${checks.length ? Math.round((completed / checks.length) * 100) : 0}%` }} /></div>
        <p className={`mt-4 rounded-xl p-3 text-sm font-medium ${blockers ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{blockers ? `${blockers} requisitos bloquean la publicación.` : "El evento cumple todos los requisitos obligatorios de publicación."}</p>
        <div className="mt-6 space-y-3">{checks.map((item) => <Link key={item.key} to={`/admin/eventos/${eventId}/${destinations[item.key] ?? "administrar"}`} className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50"><span className={`mt-0.5 ${item.ok ? "text-emerald-700" : item.blocking ? "text-amber-700" : "text-zinc-400"}`}>{item.ok ? <CheckCircle2 className="h-5 w-5" /> : item.blocking ? <AlertTriangle className="h-5 w-5" /> : <Circle className="h-5 w-5" />}</span><span><b className="block text-sm">{item.label}{!item.blocking && " · recomendado"}</b><span className="mt-1 block text-sm text-zinc-600">{item.detail}</span></span></Link>)}</div>
      </>}
    </section>
  </main>;
}
