import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, MapPin, Search, Ticket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type CatalogEvent = {
  id: string
  name: string
  description: string | null
  event_type: string
  start_date: string | null
  end_date: string | null
  location: string | null
  organization_name: string
  hero_image: string | null
  min_price: number | null
  currency: string | null
}

const TYPES: Record<string, string> = { forum: 'Foros y congresos', exhibition: 'Exposiciones', social: 'Eventos', workshop: 'Talleres' }

export default function EventosPublicos() {
  const [events, setEvents] = useState<CatalogEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [order, setOrder] = useState('date')

  useEffect(() => {
    void supabase.rpc('get_platform_event_catalog').then(({ data }) => {
      setEvents((data ?? []) as CatalogEvent[])
      setLoading(false)
    })
  }, [])

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es')
    return events
      .filter((event) => type === 'all' || event.event_type === type)
      .filter((event) => !term || `${event.name} ${event.description ?? ''} ${event.location ?? ''} ${event.organization_name}`.toLocaleLowerCase('es').includes(term))
      .sort((a, b) => order === 'name' ? a.name.localeCompare(b.name, 'es') : (Date.parse(a.start_date ?? '9999') - Date.parse(b.start_date ?? '9999')))
  }, [events, order, query, type])

  return <div className="min-h-[100dvh] bg-[#f4f7f5] text-zinc-950">
    <header className="border-b border-white/10 bg-zinc-950 text-white"><div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5"><Link to="/" className="flex items-center gap-3 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-zinc-950"><Ticket className="h-5 w-5" /></span>EventosFácil</Link><Link to="/crear-cuenta" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-950">Publicar un evento</Link></div></header>
    <main>
      <section className="bg-zinc-950 px-5 pb-16 pt-12 text-white"><div className="mx-auto max-w-7xl"><p className="text-sm font-semibold text-emerald-300">Agenda pública</p><h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-.04em] sm:text-6xl">Encuentra tu próximo evento.</h1><p className="mt-5 max-w-2xl text-lg text-zinc-300">Explora los eventos seleccionados por EventosFácil y reserva directamente con cada organizador.</p><label className="mt-9 flex max-w-2xl items-center gap-3 rounded-2xl bg-white px-4 py-3 text-zinc-950 shadow-2xl"><Search className="h-5 w-5 text-zinc-400" /><input value={query} onChange={event=>setQuery(event.target.value)} className="min-w-0 flex-1 outline-none" placeholder="Buscar por evento, ciudad u organizador" /></label></div></section>
      <section className="mx-auto max-w-7xl px-5 py-10"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex flex-wrap gap-2"><button onClick={()=>setType('all')} className={`rounded-full px-4 py-2 text-sm font-semibold ${type==='all'?'bg-zinc-950 text-white':'border bg-white'}`}>Todos</button>{Object.entries(TYPES).map(([value,label])=><button key={value} onClick={()=>setType(value)} className={`rounded-full px-4 py-2 text-sm font-semibold ${type===value?'bg-zinc-950 text-white':'border bg-white'}`}>{label}</button>)}</div><select value={order} onChange={event=>setOrder(event.target.value)} className="rounded-xl border bg-white px-3 py-2 text-sm"><option value="date">Próximos primero</option><option value="name">Nombre A–Z</option></select></div>
        {loading ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map(item=><div key={item} className="h-96 animate-pulse rounded-3xl bg-zinc-200" />)}</div> : visible.length===0 ? <div className="mt-10 rounded-3xl border border-dashed bg-white p-12 text-center text-zinc-600">No hay eventos que coincidan con la búsqueda.</div> : <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visible.map(event=><article key={event.id} className="group overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className="relative aspect-[16/10] overflow-hidden bg-[linear-gradient(135deg,#064e3b,#18181b)]">{event.hero_image&&<img src={event.hero_image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}<span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-zinc-800">{TYPES[event.event_type] ?? 'Evento'}</span></div><div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{event.organization_name}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{event.name}</h2><div className="mt-4 space-y-2 text-sm text-zinc-600"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-emerald-700" />{event.start_date?new Date(event.start_date).toLocaleString('es-VE',{dateStyle:'medium',timeStyle:'short'}):'Fecha por confirmar'}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-700" />{event.location||'Ubicación por confirmar'}</p></div><div className="mt-6 flex items-end justify-between gap-3"><div><span className="block text-xs text-zinc-500">Entradas</span><strong>{event.min_price==null?'Consultar':Number(event.min_price)===0?'Gratis':`Desde ${Number(event.min_price).toFixed(2)} ${event.currency??'USD'}`}</strong></div><Link to={`/e/${event.id}`} className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Ver evento <ArrowRight className="h-4 w-4" /></Link></div></div></article>)}</div>}
      </section>
    </main>
  </div>
}
