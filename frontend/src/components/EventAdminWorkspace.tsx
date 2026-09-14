import { useEffect, useState, type ReactNode } from 'react'
import { BarChart3, CalendarCog, ChevronLeft, ClipboardList, Handshake, LayoutDashboard, Map, ScanLine, Users } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { resolveActiveOrg } from '../lib/activeOrg'
import { supabase } from '../lib/supabase'

type EventInfo = { id: string; name: string; event_type: string; status: string }

function eventIdFromPath(pathname: string) {
  const match = pathname.match(/^\/admin\/(?:eventos\/([^/]+)\/(?:resumen|administrar|conversiones)|agenda\/([^/]+)|stands\/([^/]+)|expositores\/([^/]+)|patrocinantes\/([^/]+)|personal\/([^/]+)|operacion-plano\/([^/]+)|asientos\/([^/]+)|foro-plano\/([^/]+)|plano-comercial\/([^/]+)|plano-publicar\/([^/]+))/)
  return match?.slice(1).find(Boolean) ?? null
}

export default function EventAdminWorkspace({ children }: { children: ReactNode }) {
  const location = useLocation()
  const eventId = eventIdFromPath(location.pathname)
  const [event, setEvent] = useState<EventInfo | null>(null)

  useEffect(() => {
    let mounted = true
    if (!eventId) { setEvent(null); return () => { mounted = false } }
    async function load() {
      const active = await resolveActiveOrg()
      if (!active) return
      const { data } = await supabase.from('events').select('id,name,event_type,status').eq('id', eventId).eq('organization_id', active.organization_id).maybeSingle()
      if (mounted) setEvent(data as EventInfo | null)
    }
    void load()
    return () => { mounted = false }
  }, [eventId])

  if (!eventId) return <>{children}</>
  const base = `/admin/eventos/${eventId}`
  const exhibition = event?.event_type === 'exhibition'
  const forum = event?.event_type === 'forum'
  const entries = [
    { to: `${base}/resumen`, label: 'Resumen', icon: LayoutDashboard },
    { to: '/admin/registros', label: 'Venta y registros', icon: ClipboardList },
    ...(forum ? [{ to: `/admin/agenda/${eventId}`, label: 'Programa y agenda', icon: CalendarCog }] : []),
    ...(exhibition ? [{ to: `/admin/stands/${eventId}`, label: 'Exposición', icon: Map }, { to: `/admin/expositores/${eventId}`, label: 'Expositores', icon: Users }] : []),
    { to: `/admin/patrocinantes/${eventId}`, label: 'Patrocinantes', icon: Handshake },
    { to: `/admin/operacion-plano/${eventId}`, label: 'Operación', icon: ScanLine },
    { to: `${base}/conversiones`, label: 'Promoción y conversiones', icon: BarChart3 },
  ]

  return <div className="min-h-[calc(100dvh-4rem)] bg-zinc-50 lg:pl-72">
    <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-2 py-2 backdrop-blur lg:inset-y-16 lg:left-0 lg:right-auto lg:w-72 lg:border-r lg:border-t-0 lg:px-3 lg:py-5">
      <div className="hidden px-3 lg:block"><Link to="/admin/eventos" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><ChevronLeft className="h-4 w-4" />Todos los eventos</Link><p className="mt-5 text-xs font-bold uppercase tracking-[.14em] text-zinc-500">Evento activo</p><p className="mt-1 truncate text-base font-bold text-zinc-900">{event?.name ?? 'Cargando evento…'}</p><p className="mt-1 text-xs text-zinc-500">{event?.status === 'published' ? 'Publicado' : 'Configuración y operación'}</p></div>
      <nav aria-label="Centro de control del evento" className="flex gap-1 overflow-x-auto lg:mt-6 lg:block lg:space-y-1">
        {entries.map(({ to, label, icon: Icon }) => { const active = location.pathname === to || (label === 'Promoción y conversiones' && location.pathname === `${base}/conversiones`); return <Link key={to} to={to} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition lg:text-sm ${active ? 'bg-emerald-700 text-white' : 'text-zinc-700 hover:bg-emerald-50 hover:text-emerald-900'}`}><Icon className="h-4 w-4" />{label}</Link> })}
      </nav>
    </aside>
    <div className="pb-16 lg:pb-0">{children}</div>
  </div>
}
