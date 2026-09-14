import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, BarChart3, Eye, MousePointerClick, UserCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type Metrics = { landing_views: number; registration_starts: number; registration_completions: number }
const empty: Metrics = { landing_views: 0, registration_starts: 0, registration_completions: 0 }

function percentage(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '—'
}

export default function EventConversions() {
  const { eventId } = useParams()
  const [metrics, setMetrics] = useState<Metrics>(empty)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!eventId) return
    const { data, error: rpcError } = await supabase.rpc('get_event_growth_metrics', { p_event_id: eventId })
    if (rpcError) { setError(rpcError.message); return }
    setMetrics((Array.isArray(data) ? data[0] : data) as Metrics ?? empty)
  }, [eventId])
  useEffect(() => { void load() }, [load])

  const steps = [
    { label: 'Visitas a la página', value: metrics.landing_views, rate: 'Base del embudo', icon: Eye },
    { label: 'Inicios de registro', value: metrics.registration_starts, rate: percentage(metrics.registration_starts, metrics.landing_views), icon: MousePointerClick },
    { label: 'Registros completados', value: metrics.registration_completions, rate: percentage(metrics.registration_completions, metrics.landing_views), icon: UserCheck },
  ]

  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-7">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">Crecimiento del evento</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Promoción y conversiones</h1><p className="mt-1 text-sm text-zinc-600">Mide cómo las visitas se convierten en registros para decidir dónde impulsar la promoción.</p></div><Link to={`/admin/eventos/${eventId}/registros`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><UserCheck className="h-4 w-4" />Revisar registros</Link></div>
    {error && <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No se pudieron cargar las métricas: {error}</p>}
    <section className="mt-7 rounded-2xl border bg-white p-5 sm:p-6"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-emerald-700"/><div><p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Embudo de conversión</p><h2 className="text-lg font-bold">Del interés al registro</h2></div></div><div className="mt-6 grid gap-3 md:grid-cols-3">{steps.map(({ label, value, rate, icon: Icon }, index) => <div key={label} className="relative rounded-xl bg-zinc-50 p-5"><Icon className="h-5 w-5 text-emerald-700"/><p className="mt-4 text-sm text-zinc-500">{label}</p><p className="mt-1 text-3xl font-bold text-zinc-950">{value}</p><p className="mt-2 text-sm font-semibold text-emerald-700">{rate}</p>{index < steps.length - 1 && <ArrowRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-zinc-300 md:block"/>}</div>)}</div></section>
    <section className="mt-5 grid gap-5 lg:grid-cols-2"><article className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Lectura rápida</p><h2 className="mt-1 text-lg font-bold">Conversión total</h2><p className="mt-4 text-4xl font-bold text-emerald-700">{percentage(metrics.registration_completions, metrics.landing_views)}</p><p className="mt-2 text-sm text-zinc-600">De las visitas registradas a la página pública, esta proporción completó su inscripción.</p></article><article className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Siguiente paso</p><h2 className="mt-1 text-lg font-bold">Atribución de campañas</h2><p className="mt-4 text-sm leading-6 text-zinc-600">Las nuevas visitas y registros guardan el origen de campaña cuando se comparte el enlace con parámetros UTM. Así podrás comparar los canales conforme llegue información.</p></article></section>
  </main>
}
