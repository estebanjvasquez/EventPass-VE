import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, MapPin, Mic2, Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Speaker = { id: string; full_name: string; company: string | null; position: string | null }
type Sponsor = { name: string; logo_url?: string | null; activation_type?: string }
type Settings = { title?: string; accent_color?: string; background_color?: string; text_color?: string; font_family?: 'outfit' | 'arial' | 'georgia' | 'mono'; text_scale?: 'compact' | 'normal' | 'large'; ticker_text?: string; show_sponsors?: boolean; show_schedule?: boolean; show_current?: boolean; show_next?: boolean; refresh_seconds?: number }
type Item = { event_name: string; event_branding: { logo_url?: string; color?: string } | null; public_agenda_config: Settings | null; session_id: string; session_name: string; session_type: string; session_status: 'scheduled' | 'cancelled' | 'completed'; starts_at: string | null; ends_at: string | null; stage_name: string | null; speakers: Speaker[]; sponsors: Sponsor[]; event_sponsors: Sponsor[] }

const time = (value: string | null) => value ? new Date(value).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—'
const dayLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
const typeLabel: Record<string, string> = { lecture: 'Ponencia', workshop: 'Taller', break: 'Receso' }
const refreshSeconds = (value: unknown) => Math.min(300, Math.max(10, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 15))

export default function AgendaPublica() {
  const { eventId } = useParams()
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [day, setDay] = useState('')
  const [refreshEvery, setRefreshEvery] = useState(15)
  useEffect(() => {
    if (!eventId) return
    let alive = true
    const load = async () => {
      const { data, error: requestError } = await supabase.rpc('get_public_forum_agenda', { p_event_id: eventId })
      if (!alive) return
      if (requestError) { setError('La agenda pública todavía no está disponible.'); setItems([]); return }
      const next = (data ?? []) as Item[]; setItems(next); setRefreshEvery(current => { const configured = refreshSeconds(next[0]?.public_agenda_config?.refresh_seconds); return current === configured ? current : configured }); setError(next.length ? null : 'El organizador aún no ha publicado sesiones para esta pantalla.')
    }
    void load(); const refresh = window.setInterval(() => void load(), refreshEvery * 1_000); const clock = window.setInterval(() => setNow(new Date()), 30_000)
    return () => { alive = false; window.clearInterval(refresh); window.clearInterval(clock) }
  }, [eventId, refreshEvery])
  const settings = items[0]?.public_agenda_config ?? {}
  const branding = items[0]?.event_branding ?? {}
  const accent = settings.accent_color || branding.color || '#00a879'
  const background = settings.background_color || '#071d2b'
  const textColor = settings.text_color || '#ffffff'
  const fontFamily = { outfit: 'Outfit, system-ui, sans-serif', arial: 'Arial, Helvetica, sans-serif', georgia: 'Georgia, serif', mono: 'ui-monospace, SFMono-Regular, Menlo, monospace' }[settings.font_family ?? 'outfit']
  const textScale = settings.text_scale ?? 'normal'
  const days = useMemo(() => [...new Set(items.map((item) => item.starts_at?.slice(0, 10)).filter((value): value is string => Boolean(value)))], [items])
  useEffect(() => { if (!day && days.length) setDay(days.find((value) => value === now.toISOString().slice(0, 10)) ?? days[0]) }, [day, days, now])
  const visible = useMemo(() => items.filter((item) => !day || item.starts_at?.startsWith(day)), [items, day])
  const current = useMemo(() => visible.find((item) => item.starts_at && item.ends_at && new Date(item.starts_at) <= now && new Date(item.ends_at) >= now && item.session_status === 'scheduled') ?? null, [now, visible])
  const next = useMemo(() => visible.find((item) => item.starts_at && new Date(item.starts_at) > now && item.session_status === 'scheduled') ?? null, [now, visible])
  const sponsors = useMemo(() => [...new Map(items.flatMap((item) => item.event_sponsors ?? []).map((item) => [item.name, item])).values()], [items])
  const title = settings.title || items[0]?.event_name || 'Agenda del evento'
  if (error) return <main className="grid min-h-[100dvh] place-items-center bg-slate-950 p-6 text-center text-white"><div className="max-w-md"><CalendarDays className="mx-auto h-10 w-10" style={{ color: accent }} /><h1 className="mt-5 text-2xl font-bold">Agenda pública</h1><p className="mt-2 text-slate-300">{error}</p></div></main>
  return <main className={`agenda-text-scale-${textScale} min-h-[100dvh] overflow-hidden pb-16`} style={{ backgroundColor: background, color: textColor, fontFamily, ['--agenda-accent' as string]: accent, ['--agenda-text' as string]: textColor }}>
    <header className="border-b border-white/15 bg-black/15 px-5 py-5 sm:px-8"><div className="mx-auto flex max-w-[1800px] items-center justify-between gap-5"><div className="flex min-w-0 items-center gap-4">{branding.logo_url ? <img src={branding.logo_url} alt="" className="h-12 w-16 rounded-md bg-white object-contain p-1 sm:h-16 sm:w-24" /> : <div className="grid h-12 w-12 place-items-center rounded-md bg-white/10"><CalendarDays className="h-6 w-6" /></div>}<div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Programación en vivo</p><h1 className="agenda-primary truncate text-xl font-bold sm:text-3xl">{title}</h1></div></div><div className="text-right"><p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-white/55 sm:block">Hora local</p><time className="agenda-primary font-mono text-2xl font-bold tabular-nums sm:text-4xl">{now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</time></div></div></header>
    <div className="mx-auto max-w-[1800px] px-5 py-5 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{days.map((value) => <button type="button" key={value} onClick={() => setDay(value)} className={`rounded-md border px-3 py-2 text-sm font-bold capitalize ${value === day ? 'border-transparent bg-[var(--agenda-accent)] text-slate-950' : 'border-white/25 bg-white/5 text-white hover:bg-white/10'}`}>{dayLabel(value)}</button>)}</div><p className="text-sm text-white/65">Actualiza automáticamente cada {refreshEvery} segundos</p></div>
      <section className="mt-5 grid gap-4 lg:grid-cols-2">{settings.show_current !== false && <FocusCard kind="EN ESTE MOMENTO" item={current} accent={accent} empty="No hay una actividad en curso." />}{settings.show_next !== false && <FocusCard kind="A CONTINUACIÓN" item={next} accent={accent} empty="No hay más actividades programadas." />}</section>
      {settings.show_schedule !== false && <section className="mt-5 overflow-hidden rounded-lg border border-white/15 bg-black/15"><div className="grid grid-cols-[92px_minmax(0,1fr)_minmax(112px,0.35fr)_112px] gap-3 border-b border-white/15 bg-white/8 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white/65 sm:grid-cols-[120px_minmax(0,1fr)_minmax(160px,0.45fr)_140px]"><span>Hora</span><span>Actividad</span><span>Espacio</span><span>Estado</span></div><div className="divide-y divide-white/10">{visible.map((item) => <article key={item.session_id} className={`agenda-primary grid grid-cols-[92px_minmax(0,1fr)_minmax(112px,0.35fr)_112px] gap-3 px-4 py-4 sm:grid-cols-[120px_minmax(0,1fr)_minmax(160px,0.45fr)_140px] ${item.session_status === 'cancelled' ? 'bg-red-500/12 opacity-85' : item.session_id === current?.session_id ? 'bg-white/10' : ''}`}><time className="font-mono text-base font-bold sm:text-xl">{time(item.starts_at)}</time><div className="min-w-0"><h2 className={`text-base font-bold sm:text-xl ${item.session_status === 'cancelled' ? 'line-through' : ''}`}>{item.session_name}</h2><p className="mt-1 hidden text-sm text-white/70 sm:block">{item.speakers.map((speaker) => speaker.full_name).join(' · ') || typeLabel[item.session_type] || 'Actividad'}</p>{settings.show_sponsors !== false && item.sponsors.length > 0 && <p className="mt-2 text-xs font-semibold" style={{ color: accent }}>Patrocina: {item.sponsors.map((sponsor) => sponsor.name).join(' · ')}</p>}</div><p className="flex items-start gap-1 text-sm font-semibold text-white/80"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{item.stage_name || 'Por confirmar'}</p><span className={`self-start justify-self-start rounded px-2 py-1 text-xs font-bold ${item.session_status === 'cancelled' ? 'bg-red-500 text-white' : item.session_id === current?.session_id ? 'bg-[var(--agenda-accent)] text-slate-950' : 'bg-white/10 text-white/85'}`}>{item.session_status === 'cancelled' ? 'CANCELADA' : item.session_id === current?.session_id ? 'EN CURSO' : 'PROGRAMADA'}</span></article>)}{!visible.length && <p className="p-10 text-center text-white/65">No hay actividades para este día.</p>}</div></section>}
    </div>
    {(settings.ticker_text || (settings.show_sponsors !== false && sponsors.length > 0)) && <footer className="fixed inset-x-0 bottom-0 border-t border-white/20 bg-slate-950/95 py-3 backdrop-blur"><div className="agenda-ticker flex min-w-max items-center gap-9 px-6 text-sm font-semibold"><span style={{ color: accent }}>{settings.ticker_text || 'Gracias a nuestros patrocinantes'}</span>{settings.show_sponsors !== false && sponsors.map((sponsor) => <span key={sponsor.name} className="inline-flex items-center gap-3 whitespace-nowrap">{sponsor.logo_url ? <img src={sponsor.logo_url} alt="" className="h-7 w-12 rounded bg-white object-contain p-0.5" /> : <Radio className="h-4 w-4" style={{ color: accent }} />}{sponsor.name}</span>)}</div></footer>}
  </main>
}

function FocusCard({ kind, item, accent, empty }: { kind: string; item: Item | null; accent: string; empty: string }) {
  return <article className="overflow-hidden rounded-lg border border-white/15 bg-black/20"><div className="h-1.5" style={{ backgroundColor: accent }} /><div className="p-5"><p className="text-xs font-bold tracking-[0.16em] text-white/55">{kind}</p>{item ? <div className="mt-3 flex gap-4"><time className="font-mono text-2xl font-bold" style={{ color: accent }}>{time(item.starts_at)}</time><div className="min-w-0"><h2 className="text-xl font-bold sm:text-2xl">{item.session_name}</h2><p className="mt-1 flex items-center gap-2 text-sm text-white/70"><Mic2 className="h-4 w-4" />{item.speakers.map((speaker) => speaker.full_name).join(' · ') || item.stage_name || 'Información por confirmar'}</p></div></div> : <p className="mt-3 text-lg text-white/65">{empty}</p>}</div></article>
}
