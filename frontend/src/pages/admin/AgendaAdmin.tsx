import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Home,
  CalendarDays,
  Clock3,
  Coffee,
  Edit3,
  Mic2,
  Plus,
  Presentation,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { resolveActiveOrg } from '../../lib/activeOrg'
import { supabase } from '../../lib/supabase'
import { AgendaTimelineCanvas } from './agenda/AgendaTimelineCanvas'
import { AgendaContentAdmin } from './agenda/AgendaContentAdmin'
import { AgendaOperationsAdmin } from './agenda/AgendaOperationsAdmin'

type SessionType = 'lecture' | 'workshop' | 'break'
type Tab = 'schedule' | 'sessions' | 'speakers' | 'content' | 'operations' | 'public'

type EventData = { id: string; name: string; organization_id: string; start_date: string | null; end_date: string | null; config: Record<string, unknown> }
type Stage = { id: string; name: string; stream_url: string | null; limit_video_access: boolean; sort_order: number }
type Speaker = {
  id: string; full_name: string; company: string | null; position: string | null; bio: string | null; photo_url: string | null
  email: string | null; phone: string | null; web: string | null; linkedin: string | null; facebook: string | null; twitter: string | null; instagram: string | null
  country: string | null; language: string | null; sort_order: number; profile_type?: 'speaker' | 'moderator'
}
type Session = {
  id: string; name: string; description: string | null; starts_at: string | null; ends_at: string | null; capacity: number | null
  session_type: SessionType; stage_id: string | null; stream_url: string | null; meeting_url: string | null; attachment_url: string | null
  limit_video_access: boolean; sort_order: number
}
type EventSponsor = { id: string; company_id: string; status: string; company?: { name: string } | { name: string }[] | null }

const input = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500'
const sessionLabel: Record<SessionType, string> = { lecture: 'Ponencia', workshop: 'Taller', break: 'Receso' }
const sessionStyle: Record<SessionType, string> = {
  lecture: 'border-blue-200 bg-blue-50 text-blue-800', workshop: 'border-violet-200 bg-violet-50 text-violet-800', break: 'border-amber-200 bg-amber-50 text-amber-800',
}

function localDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function plusMinutes(value: string | null, minutes: number) {
  const base = value ? new Date(value) : new Date()
  base.setMinutes(base.getMinutes() + minutes)
  return localDateTime(base.toISOString())
}
function iso(value: string) { return value ? new Date(value).toISOString() : null }
function day(value: string | null | undefined) { return value ? localDateTime(value).slice(0, 10) : '' }
function time(value: string | null) { return value ? new Date(value).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : 'Sin hora' }
function prettyDay(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }) }

export default function AgendaAdmin() {
  const { eventId } = useParams()
  const [event, setEvent] = useState<EventData | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [speakerIds, setSpeakerIds] = useState<Record<string, string[]>>({})
  const [moderatorIds, setModeratorIds] = useState<Record<string, string[]>>({})
  const [sessionSponsorIds, setSessionSponsorIds] = useState<Record<string, string[]>>({})
  const [eventSponsors, setEventSponsors] = useState<EventSponsor[]>([])
  const [tab, setTab] = useState<Tab>('schedule')
  const [activeDay, setActiveDay] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | SessionType>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stageEditor, setStageEditor] = useState<Stage | 'new' | null>(null)
  const [sessionEditor, setSessionEditor] = useState<Session | 'new' | null>(null)
  const [speakerEditor, setSpeakerEditor] = useState<Speaker | 'new' | null>(null)

  const load = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    setError(null)
    const active = await resolveActiveOrg()
    if (!active) { setError('No se encontró una organización activa.'); setLoading(false); return }
    const { data: eventData, error: eventError } = await supabase
      .from('events').select('id,name,organization_id,start_date,end_date,config').eq('id', eventId).maybeSingle()
    if (eventError || !eventData) { setError(eventError?.message ?? 'No se pudo cargar el evento.'); setLoading(false); return }
    if (eventData.organization_id !== active.organization_id && !active.impersonating) { setError('No tienes acceso a la agenda de este evento.'); setLoading(false); return }
    const [stageResult, sessionResult, speakerResult, linkResult, moderatorLinkResult, sponsorResult, sessionSponsorResult] = await Promise.all([
      supabase.from('event_stages').select('id,name,stream_url,limit_video_access,sort_order').eq('event_id', eventId).order('sort_order').order('name'),
      supabase.from('event_sessions').select('id,name,description,starts_at,ends_at,capacity,session_type,stage_id,stream_url,meeting_url,attachment_url,limit_video_access,sort_order').eq('event_id', eventId).order('starts_at').order('sort_order'),
      supabase.from('event_speakers').select('id,full_name,company,position,bio,photo_url,email,phone,web,linkedin,facebook,twitter,instagram,country,language,sort_order,profile_type').eq('event_id', eventId).order('sort_order').order('full_name'),
      supabase.from('session_speakers').select('session_id,speaker_id,sort_order').order('sort_order'),
      supabase.from('session_moderators').select('session_id,moderator_id,sort_order').order('sort_order'),
      supabase.from('event_sponsorships').select('id,company_id,status,company:companies(name)').eq('event_id', eventId).order('created_at'),
      supabase.from('session_sponsorships').select('session_id,event_sponsorship_id,sort_order').order('sort_order'),
    ])
    const firstError = stageResult.error ?? sessionResult.error ?? speakerResult.error ?? linkResult.error ?? moderatorLinkResult.error ?? sponsorResult.error ?? sessionSponsorResult.error
    if (firstError) setError(firstError.message)
    setEvent(eventData as EventData)
    setStages((stageResult.data ?? []) as Stage[])
    setSessions((sessionResult.data ?? []) as Session[])
    setSpeakers((speakerResult.data ?? []) as Speaker[])
    const sessionSet = new Set((sessionResult.data ?? []).map((item) => item.id))
    const links: Record<string, string[]> = {}
    for (const item of linkResult.data ?? []) if (sessionSet.has(item.session_id)) (links[item.session_id] ??= []).push(item.speaker_id)
    setSpeakerIds(links)
    const moderatorLinks: Record<string, string[]> = {}
    for (const item of moderatorLinkResult.data ?? []) if (sessionSet.has(item.session_id)) (moderatorLinks[item.session_id] ??= []).push(item.moderator_id)
    setModeratorIds(moderatorLinks)
    setEventSponsors((sponsorResult.data ?? []) as EventSponsor[])
    const sponsorLinks: Record<string, string[]> = {}
    for (const item of sessionSponsorResult.data ?? []) if (sessionSet.has(item.session_id)) (sponsorLinks[item.session_id] ??= []).push(item.event_sponsorship_id)
    setSessionSponsorIds(sponsorLinks)
    const initialDay = day((sessionResult.data ?? [])[0]?.starts_at ?? eventData.start_date)
    setActiveDay((current) => current || initialDay)
    setLoading(false)
  }, [eventId])

  useEffect(() => { void load() }, [load])

  const days = useMemo(() => [...new Set(sessions.map((item) => day(item.starts_at)).filter(Boolean))], [sessions])
  const selectedDay = activeDay || days[0] || day(event?.start_date)
  const visibleSessions = useMemo(() => sessions.filter((item) => {
    const matchesText = `${item.name} ${item.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesText && (filter === 'all' || item.session_type === filter)
  }), [filter, search, sessions])
  const speakerNames = useCallback((sessionId: string) => (speakerIds[sessionId] ?? []).map((id) => speakers.find((speaker) => speaker.id === id)?.full_name).filter(Boolean).join(', '), [speakerIds, speakers])
  const moderatorNames = useCallback((sessionId: string) => (moderatorIds[sessionId] ?? []).map((id) => speakers.find((speaker) => speaker.id === id)?.full_name).filter(Boolean).join(', '), [moderatorIds, speakers])

  async function deleteStage(stage: Stage) {
    if (!window.confirm(`¿Eliminar el escenario “${stage.name}”? Las sesiones quedarán sin escenario asignado.`)) return
    const { error: deleteError } = await supabase.from('event_stages').delete().eq('id', stage.id)
    if (deleteError) setError(deleteError.message); else await load()
  }
  async function deleteSession(session: Session) {
    if (!window.confirm(`¿Eliminar la sesión “${session.name}”?`)) return
    const { error: deleteError } = await supabase.from('event_sessions').delete().eq('id', session.id)
    if (deleteError) setError(deleteError.message); else await load()
  }
  async function deleteSpeaker(speaker: Speaker) {
    if (!window.confirm(`¿Eliminar el perfil de “${speaker.full_name}”?`)) return
    const { error: deleteError } = await supabase.from('event_speakers').delete().eq('id', speaker.id)
    if (deleteError) setError(deleteError.message); else await load()
  }
  async function persistTimeline(id: string, change: Pick<Session, 'stage_id' | 'starts_at' | 'ends_at'>) {
    const { data, error: updateError } = await supabase
      .from('event_sessions')
      .update(change)
      .eq('id', id)
      .select('id,stage_id,starts_at,ends_at')
      .maybeSingle()
    if (updateError || !data) {
      setError(updateError?.message ?? 'No se pudo confirmar el cambio de horario.')
      return false
    }
    setSessions((current) => current.map((item) => item.id === id ? { ...item, ...data } : item))
    setError(null)
    return true
  }

  if (loading) return <div className="grid min-h-[100dvh] place-items-center bg-zinc-50"><span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600" /></div>
  if (!event) return <PageFrame title="Agenda del foro"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error ?? 'Evento no encontrado.'}</p></PageFrame>

  return <PageFrame title={`Agenda · ${event.name}`} eventId={event.id}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm text-zinc-500">Programa del foro</p><h1 className="text-2xl font-bold tracking-tight text-zinc-900">{event.name}</h1><p className="mt-1 text-sm text-zinc-600">Crea escenarios, sesiones, talleres, recesos y perfiles de ponentes.</p></div>
      <button type="button" onClick={() => setSessionEditor('new')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Nueva sesión</button>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-7 flex flex-wrap gap-2 border-b border-zinc-200">
      <TabButton active={tab === 'schedule'} onClick={() => setTab('schedule')} icon={<CalendarDays className="h-4 w-4" />}>Horario</TabButton>
      <TabButton active={tab === 'sessions'} onClick={() => setTab('sessions')} icon={<Presentation className="h-4 w-4" />}>Sesiones</TabButton>
      <TabButton active={tab === 'speakers'} onClick={() => setTab('speakers')} icon={<Mic2 className="h-4 w-4" />}>Ponentes y moderadores</TabButton>
      <TabButton active={tab === 'content'} onClick={() => setTab('content')} icon={<Plus className="h-4 w-4" />}>Contenido</TabButton>
      <TabButton active={tab === 'operations'} onClick={() => setTab('operations')} icon={<UsersRound className="h-4 w-4" />}>Operación</TabButton>
      <TabButton active={tab === 'public'} onClick={() => setTab('public')} icon={<CalendarDays className="h-4 w-4" />}>Pantalla pública</TabButton>
    </div>
    {tab === 'schedule' && <ScheduleView stages={stages} sessions={sessions} selectedDay={selectedDay} days={days} speakers={(id) => [speakerNames(id), moderatorNames(id) && `Moderador: ${moderatorNames(id)}`].filter(Boolean).join(' · ')} onDay={setActiveDay} onNewStage={() => setStageEditor('new')} onEditStage={setStageEditor} onDeleteStage={deleteStage} onNewSession={() => setSessionEditor('new')} onEditSession={setSessionEditor} onPersistTimeline={persistTimeline} />}
    {tab === 'sessions' && <SessionsView sessions={visibleSessions} stages={stages} speakers={(id) => [speakerNames(id), moderatorNames(id) && `Moderador: ${moderatorNames(id)}`].filter(Boolean).join(' · ')} filter={filter} search={search} onFilter={setFilter} onSearch={setSearch} onNew={() => setSessionEditor('new')} onEdit={setSessionEditor} onDelete={deleteSession} />}
    {tab === 'speakers' && <SpeakersView speakers={speakers} onNew={() => setSpeakerEditor('new')} onEdit={setSpeakerEditor} onDelete={deleteSpeaker} />}
    {tab === 'content' && <AgendaContentAdmin event={event} sessions={sessions} speakers={speakers} onRefresh={load} />}
    {tab === 'operations' && <AgendaOperationsAdmin event={event} sessions={sessions} />}
    {tab === 'public' && <><PublicAgendaRefreshControl event={event} onSaved={load} /><PublicAgendaDesigner event={event} onSaved={load} /></>}
    {stageEditor && <FriendlyStageModal stage={stageEditor === 'new' ? null : stageEditor} event={event} nextOrder={stages.length} onClose={() => setStageEditor(null)} onSaved={async () => { setStageEditor(null); await load() }} />}
    {sessionEditor && <SessionModal session={sessionEditor === 'new' ? null : sessionEditor} event={event} stages={stages} speakers={speakers} assigned={sessionEditor === 'new' ? [] : speakerIds[sessionEditor.id] ?? []} assignedModerators={sessionEditor === 'new' ? [] : moderatorIds[sessionEditor.id] ?? []} eventSponsors={eventSponsors} assignedSponsors={sessionEditor === 'new' ? [] : sessionSponsorIds[sessionEditor.id] ?? []} allSessions={sessions} onClose={() => setSessionEditor(null)} onSaved={async () => { setSessionEditor(null); await load() }} />}
    {speakerEditor && <SpeakerModal speaker={speakerEditor === 'new' ? null : speakerEditor} event={event} nextOrder={speakers.length} onClose={() => setSpeakerEditor(null)} onSaved={async () => { setSpeakerEditor(null); await load() }} />}
  </PageFrame>
}

function PageFrame({ title, eventId, children }: { title: string; eventId?: string; children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-zinc-50"><header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link to={`/admin/eventos/${eventId}/administrar`} aria-label="Volver a administrar evento" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><Home className="h-4 w-4" />Admin del evento</Link><div className="flex items-center gap-3"><span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900"><CalendarDays className="h-4 w-4 text-emerald-600" />{title}</span>{eventId && <><Link to={`/e/${eventId}/agenda`} target="_blank" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Ver agenda pública</Link><Link to={`/admin/asientos/${eventId}`} className="hidden rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 sm:inline-flex">Asientos</Link></>}</div></div></header><main className="mx-auto max-w-7xl px-5 py-8">{children}</main></div>
}
function PublicAgendaRefreshControl({ event, onSaved }: { event: EventData; onSaved: () => Promise<void> }) {
  const current = (event.config?.public_agenda as Record<string, unknown> | undefined) ?? {}
  const initial = [10, 15, 30, 60, 120, 300].includes(Number(current.refresh_seconds)) ? Number(current.refresh_seconds) : 15
  const [seconds, setSeconds] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  async function save() {
    setBusy(true); setMessage(null)
    const config = { ...event.config, public_agenda: { ...current, refresh_seconds: seconds } }
    const { error } = await supabase.from('events').update({ config }).eq('id', event.id)
    setBusy(false)
    if (error) setMessage(error.message); else { setMessage('Intervalo de actualización guardado.'); await onSaved() }
  }
  return <section className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-5"><div><h2 className="font-bold text-slate-900">Actualización de la pantalla</h2><p className="mt-1 text-sm text-slate-700">Define cada cuánto las pantallas públicas consultan cambios de horario, cancelaciones y patrocinantes.</p></div><div className="flex flex-wrap items-end gap-3"><label className={label}>Refrescar cada<select value={seconds} onChange={e=>setSeconds(Number(e.target.value))} className={`${input} mt-1`}><option value={10}>10 segundos</option><option value={15}>15 segundos (recomendado)</option><option value={30}>30 segundos</option><option value={60}>1 minuto</option><option value={120}>2 minutos</option><option value={300}>5 minutos</option></select></label><button type="button" disabled={busy} onClick={()=>void save()} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar intervalo'}</button></div>{message && <p className="w-full text-sm text-slate-800">{message}</p>}</section>
}
function PublicAgendaDesigner({ event, onSaved }: { event: EventData; onSaved: () => Promise<void> }) {
  const current = (event.config?.public_agenda as Record<string, unknown> | undefined) ?? {}
  const [title, setTitle] = useState(String(current.title ?? 'Agenda del evento'))
  const [accent, setAccent] = useState(String(current.accent_color ?? '#059669'))
  const [background, setBackground] = useState(String(current.background_color ?? '#071d2b'))
  const [textColor, setTextColor] = useState(String(current.text_color ?? '#ffffff'))
  const [fontFamily, setFontFamily] = useState(String(current.font_family ?? 'outfit'))
  const [textScale, setTextScale] = useState(String(current.text_scale ?? 'normal'))
  const [ticker, setTicker] = useState(String(current.ticker_text ?? ''))
  const [published, setPublished] = useState(current.published === true)
  const [showSponsors, setShowSponsors] = useState(current.show_sponsors !== false)
  const [showSchedule, setShowSchedule] = useState(current.show_schedule !== false)
  const [showCurrent, setShowCurrent] = useState(current.show_current !== false)
  const [showNext, setShowNext] = useState(current.show_next !== false)
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null)
  async function save() { setBusy(true); setMessage(null); const config = { ...event.config, public_agenda: { title: title.trim() || 'Agenda del evento', accent_color: accent, background_color: background, text_color: textColor, font_family: fontFamily, text_scale: textScale, ticker_text: ticker.trim(), published, show_sponsors: showSponsors, show_schedule: showSchedule, show_current: showCurrent, show_next: showNext } }; const { error } = await supabase.from('events').update({ config }).eq('id', event.id); setBusy(false); if (error) setMessage(error.message); else { setMessage(published ? 'Pantalla pública guardada y publicada.' : 'Diseño guardado. Activa la publicación cuando esté listo.'); await onSaved() } }
  return <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]"><form onSubmit={(e)=>{e.preventDefault();void save()}} className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Pantalla pública de agenda</h2><p className="mt-1 text-sm text-zinc-600">Una pantalla de lectura rápida para TV, proyector o enlace público. Los cambios de horarios y cancelaciones se reflejan automáticamente.</p><div className="mt-5 grid gap-4"><label className={label}>Título visible<input value={title} onChange={e=>setTitle(e.target.value)} className={input}/></label><div className="grid gap-4 sm:grid-cols-2"><label className={label}>Color de acento<div className="mt-1 flex gap-2"><input type="color" value={accent} onChange={e=>setAccent(e.target.value)} className="h-10 w-14 rounded border"/><input value={accent} onChange={e=>setAccent(e.target.value)} className={input}/></div></label><label className={label}>Fondo de pantalla<div className="mt-1 flex gap-2"><input type="color" value={background} onChange={e=>setBackground(e.target.value)} className="h-10 w-14 rounded border"/><input value={background} onChange={e=>setBackground(e.target.value)} className={input}/></div></label></div><div className="grid gap-4 sm:grid-cols-3"><label className={label}>Color del texto<div className="mt-1 flex gap-2"><input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)} className="h-10 w-14 rounded border"/><input value={textColor} onChange={e=>setTextColor(e.target.value)} className={input}/></div></label><label className={label}>Fuente<select value={fontFamily} onChange={e=>setFontFamily(e.target.value)} className={`${input} mt-1`}><option value="outfit">Outfit moderna</option><option value="arial">Arial legible</option><option value="georgia">Georgia editorial</option><option value="mono">Monoespaciada FIDS</option></select></label><label className={label}>Tamaño de lectura<select value={textScale} onChange={e=>setTextScale(e.target.value)} className={`${input} mt-1`}><option value="compact">Compacto</option><option value="normal">Normal</option><option value="large">Grande</option></select></label></div><label className={label}>Mensaje del cintillo<textarea value={ticker} onChange={e=>setTicker(e.target.value)} rows={2} placeholder="Ej.: Bienvenidos a Expo Petróleo 2026." className={input}/></label><fieldset className="grid gap-2 rounded-xl border border-zinc-200 p-4"><legend className="px-1 text-sm font-semibold">Contenido visible</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showSchedule} onChange={e=>setShowSchedule(e.target.checked)}/>Tabla de agenda y estados</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showCurrent} onChange={e=>setShowCurrent(e.target.checked)}/>Actividad en curso</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showNext} onChange={e=>setShowNext(e.target.checked)}/>Próxima actividad</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showSponsors} onChange={e=>setShowSponsors(e.target.checked)}/>Logos y nombres de patrocinantes, globales y por actividad</label></fieldset><label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><input className="mt-1" type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/><span><strong>Publicar esta pantalla.</strong><br/>Al activarla, el enlace será visible incluso si la inscripción general todavía no está publicada.</span></label></div><div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Guardando…':'Guardar configuración'}</button><Link to={`/e/${event.id}/agenda`} target="_blank" className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700">Abrir pantalla pública</Link></div>{message&&<p className="mt-3 rounded-lg bg-zinc-100 p-3 text-sm">{message}</p>}</form><aside className="overflow-hidden rounded-2xl border p-5 text-white" style={{backgroundColor:background}}><p className="text-xs font-semibold uppercase tracking-wide text-white/55">Vista previa</p><div className="mt-4 h-2 rounded" style={{backgroundColor:accent}}/><h3 className="mt-5 text-2xl font-bold">{title || 'Agenda del evento'}</h3><p className="mt-4 text-sm text-white/70">EN ESTE MOMENTO · A CONTINUACIÓN</p>{showSchedule&&<div className="mt-4 divide-y divide-white/15 border-y border-white/15 text-sm"><p className="py-3">10:00 · Apertura · Auditorio</p><p className="py-3">11:00 · Panel principal · En curso</p></div>}{showSponsors&&<p className="mt-4 text-sm" style={{color:accent}}>Patrocinantes y logos en el cintillo</p>}{ticker&&<p className="mt-5 border-t border-white/20 pt-3 text-sm text-white/80">{ticker}</p>}<p className="mt-5 text-xs text-white/50">{published ? 'PUBLICADA' : 'AÚN SIN PUBLICAR'}</p></aside></section>
}
function TabButton({ active, icon, children, onClick }: { active: boolean; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) { return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>{icon}{children}</button> }

function ScheduleView({ stages, sessions, selectedDay, days, speakers, onDay, onNewStage, onEditStage, onDeleteStage, onNewSession, onEditSession, onPersistTimeline }: { stages: Stage[]; sessions: Session[]; selectedDay: string; days: string[]; speakers: (id: string) => string; onDay: (value: string) => void; onNewStage: () => void; onEditStage: (stage: Stage) => void; onDeleteStage: (stage: Stage) => void; onNewSession: () => void; onEditSession: (session: Session) => void; onPersistTimeline: (id: string, change: Pick<Session, 'stage_id' | 'starts_at' | 'ends_at'>) => Promise<boolean> }) {
  const daySessions = sessions.filter((item) => !selectedDay || day(item.starts_at) === selectedDay)
  const globalBreaks = daySessions.filter((item) => item.session_type === 'break' && !item.stage_id)
  return <section className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{days.map((item) => <button key={item} type="button" onClick={() => onDay(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${item === selectedDay ? 'bg-emerald-600 text-white' : 'border border-zinc-300 bg-white text-zinc-700'}`}>{prettyDay(item)}</button>)}{!days.length && <span className="text-sm text-zinc-500">Añade la primera sesión para comenzar el horario.</span>}</div><div className="flex gap-2"><button type="button" onClick={onNewStage} className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"><Plus className="h-4 w-4" />Añadir escenario</button><button type="button" onClick={onNewSession} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Nueva sesión</button></div></div>
    {globalBreaks.length > 0 && <div className="mt-5 space-y-2">{globalBreaks.map((item) => <SessionCard key={item.id} session={item} speakers={speakers(item.id)} onEdit={() => onEditSession(item)} />)}</div>}
    {stages.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{stages.map((stage) => <div key={stage.id} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white py-1 pl-3 pr-1 text-sm font-semibold text-zinc-700"><span>{stage.name}</span><button type="button" onClick={() => onEditStage(stage)} aria-label={`Editar ${stage.name}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100"><Edit3 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => onDeleteStage(stage)} aria-label={`Eliminar ${stage.name}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
    {stages.length ? <AgendaTimelineCanvas key={selectedDay} day={selectedDay} stages={stages} sessions={sessions} onEdit={(id) => { const session = sessions.find((item) => item.id === id); if (session) onEditSession(session) }} onPersist={onPersistTimeline} /> : <div className="mt-5"><Empty title="Crea el primer escenario" text="Los escenarios representan salas, auditorios o tarimas. Luego podrás programar sesiones dentro de cada uno." action="Añadir escenario" onAction={onNewStage} /></div>}
  </section>
}
function SessionCard({ session, speakers, onEdit }: { session: Session; speakers: string; onEdit: () => void }) { return <button type="button" onClick={onEdit} className={`w-full rounded-xl border p-3 text-left transition hover:brightness-95 ${sessionStyle[session.session_type]}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide">{sessionLabel[session.session_type]}</span><span className="inline-flex items-center gap-1 text-xs"><Clock3 className="h-3 w-3" />{time(session.starts_at)}{session.ends_at ? ` – ${time(session.ends_at)}` : ''}</span></div><p className="mt-2 font-semibold">{session.name}</p>{speakers && <p className="mt-1 text-xs opacity-80">{speakers}</p>}</button> }

function SessionsView({ sessions, stages, speakers, filter, search, onFilter, onSearch, onNew, onEdit, onDelete }: { sessions: Session[]; stages: Stage[]; speakers: (id: string) => string; filter: 'all' | SessionType; search: string; onFilter: (value: 'all' | SessionType) => void; onSearch: (value: string) => void; onNew: () => void; onEdit: (session: Session) => void; onDelete: (session: Session) => void }) { const stageName = (id: string | null) => stages.find((stage) => stage.id === id)?.name ?? (id ? 'Escenario eliminado' : 'Receso general'); return <section className="mt-6"><div className="flex flex-wrap gap-3"><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar sesión" className={`${input} max-w-xs`} />{(['all','lecture','workshop','break'] as const).map((item) => <button key={item} type="button" onClick={() => onFilter(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter === item ? 'bg-emerald-600 text-white' : 'border border-zinc-300 bg-white text-zinc-700'}`}>{item === 'all' ? 'Todas' : sessionLabel[item]}</button>)}<button type="button" onClick={onNew} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Nueva sesión</button></div><div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-3">Horario</th><th className="px-4 py-3">Sesión</th><th className="px-4 py-3">Escenario</th><th className="px-4 py-3">Ponentes</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-zinc-100">{sessions.map((item) => <tr key={item.id}><td className="px-4 py-3 text-zinc-600">{item.starts_at ? <>{new Date(item.starts_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}<br />{time(item.starts_at)}</> : 'Sin horario'}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${sessionStyle[item.session_type]}`}>{sessionLabel[item.session_type]}</span><p className="mt-1 font-semibold text-zinc-900">{item.name}</p></td><td className="px-4 py-3 text-zinc-600">{stageName(item.stage_id)}</td><td className="px-4 py-3 text-zinc-600">{speakers(item.id) || '—'}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><Edit3 className="h-4 w-4" /></button><button type="button" onClick={() => onDelete(item)} aria-label={`Eliminar ${item.name}`} className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}{!sessions.length && <tr><td colSpan={5}><div className="p-10"><Empty title="No hay sesiones todavía" text="Crea una ponencia, taller o receso para empezar a construir el programa." action="Nueva sesión" onAction={onNew} /></div></td></tr>}</tbody></table></div></section> }

function SpeakersView({ speakers, onNew, onEdit, onDelete }: { speakers: Speaker[]; onNew: () => void; onEdit: (speaker: Speaker) => void; onDelete: (speaker: Speaker) => void }) { return <section className="mt-6"><div className="flex justify-end"><button type="button" onClick={onNew} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Nuevo ponente</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{speakers.map((speaker) => <article key={speaker.id} className="rounded-2xl border border-zinc-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-100 font-bold text-emerald-700">{speaker.full_name.slice(0, 1).toUpperCase()}</div><div className="flex gap-1"><button type="button" onClick={() => onEdit(speaker)} aria-label={`Editar ${speaker.full_name}`} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><Edit3 className="h-4 w-4" /></button><button type="button" onClick={() => onDelete(speaker)} aria-label={`Eliminar ${speaker.full_name}`} className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div></div><h2 className="mt-4 font-semibold text-zinc-900">{speaker.full_name}</h2><p className="text-sm text-zinc-600">{[speaker.position, speaker.company].filter(Boolean).join(' · ') || 'Perfil por completar'}</p>{speaker.bio && <p className="mt-3 line-clamp-3 text-sm text-zinc-600">{speaker.bio}</p>}</article>)}{!speakers.length && <Empty title="Añade perfiles de ponentes" text="Después podrás asignar uno o varios ponentes a cada sesión." action="Nuevo ponente" onAction={onNew} />}</div></section> }
function Empty({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) { return <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-7 text-center"><UsersRound className="mx-auto h-7 w-7 text-zinc-400" /><h2 className="mt-3 font-semibold text-zinc-900">{title}</h2><p className="mx-auto mt-1 max-w-sm text-sm text-zinc-600">{text}</p><button type="button" onClick={onAction} className="mt-4 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">{action}</button></div> }

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/40 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="agenda-modal-title" className="mx-auto my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl"><header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><h2 id="agenda-modal-title" className="text-lg font-bold text-zinc-900">{title}</h2><button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button></header>{children}</div></div> }

function StageModal({ stage, event, nextOrder, onClose, onSaved }: { stage: Stage | null; event: EventData; nextOrder: number; onClose: () => void; onSaved: () => Promise<void> }) { const [name, setName] = useState(stage?.name ?? ''); const [streamUrl, setStreamUrl] = useState(stage?.stream_url ?? ''); const [restricted, setRestricted] = useState(stage?.limit_video_access ?? false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const nameInput = useRef<HTMLInputElement>(null); useEffect(() => { const frame = requestAnimationFrame(() => nameInput.current?.focus()); return () => cancelAnimationFrame(frame) }, []); async function save(eventForm: React.FormEvent) { eventForm.preventDefault(); if (!name.trim()) { setError('Indica el nombre del escenario.'); return }; setBusy(true); const payload = { organization_id: event.organization_id, event_id: event.id, name: name.trim(), stream_url: streamUrl.trim() || null, limit_video_access: restricted, sort_order: stage?.sort_order ?? nextOrder }; const result = stage ? await supabase.from('event_stages').update(payload).eq('id', stage.id) : await supabase.from('event_stages').insert(payload); setBusy(false); if (result.error) setError(result.error.message); else await onSaved() } return <Modal title={stage ? 'Editar escenario' : 'Nuevo escenario'} onClose={onClose}><form onSubmit={save} className="space-y-4 p-5"><div><label htmlFor="stage-name" className={label}>Nombre *</label><input ref={nameInput} id="stage-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Auditorio principal" className={input} /></div><div><label htmlFor="stage-stream-url" className={label}>URL de transmisión (opcional)</label><input id="stage-stream-url" type="url" value={streamUrl} onChange={(event) => setStreamUrl(event.target.value)} placeholder="https://…" className={input} /></div><label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={restricted} onChange={(event) => setRestricted(event.target.checked)} />Limitar el video a asistentes autorizados</label>{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<ModalActions onClose={onClose} busy={busy} label="Guardar escenario" /></form></Modal> }

function FriendlyStageModal({ stage, event, nextOrder, onClose, onSaved }: { stage: Stage | null; event: EventData; nextOrder: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(stage?.name ?? '')
  const [streamUrl, setStreamUrl] = useState(stage?.stream_url ?? '')
  const [restricted, setRestricted] = useState(stage?.limit_video_access ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => { const frame = requestAnimationFrame(() => nameInput.current?.focus()); return () => cancelAnimationFrame(frame) }, [])
  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    if (!name.trim()) { setError('Indica el nombre del escenario.'); return }
    setBusy(true)
    const payload = { organization_id: event.organization_id, event_id: event.id, name: name.trim(), stream_url: streamUrl.trim() || null, limit_video_access: restricted, sort_order: stage?.sort_order ?? nextOrder }
    const result = stage ? await supabase.from('event_stages').update(payload).eq('id', stage.id) : await supabase.from('event_stages').insert(payload)
    setBusy(false)
    if (result.error) setError(result.error.code === '23505' ? 'Ya existe un escenario con ese nombre en este evento.' : result.error.message)
    else await onSaved()
  }
  return <Modal title={stage ? 'Editar escenario' : 'Nuevo escenario'} onClose={onClose}><form onSubmit={save} className="space-y-4 p-5"><div><label htmlFor="friendly-stage-name" className={label}>Nombre del escenario *</label><input ref={nameInput} id="friendly-stage-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Auditorio principal" className={input} /></div><div><label htmlFor="friendly-stage-stream" className={label}>URL de transmisión (opcional)</label><input id="friendly-stage-stream" type="url" value={streamUrl} onChange={(event) => setStreamUrl(event.target.value)} placeholder="https://…" className={input} /></div><label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={restricted} onChange={(event) => setRestricted(event.target.checked)} />Limitar el video a asistentes autorizados</label>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<ModalActions onClose={onClose} busy={busy} label="Guardar escenario" /></form></Modal>
}

// Conserva la implementación legacy durante la transición de agenda.
void StageModal

function SessionModalLegacy({ session, event, stages, speakers, assigned, assignedModerators, allSessions, onClose, onSaved }: { session: Session | null; event: EventData; stages: Stage[]; speakers: Speaker[]; assigned: string[]; assignedModerators: string[]; allSessions: Session[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const initialStart = session?.starts_at ?? event.start_date
  const [type, setType] = useState<SessionType>(session?.session_type ?? 'lecture'); const [name, setName] = useState(session?.name ?? ''); const [stageId, setStageId] = useState(session?.stage_id ?? ''); const [startsAt, setStartsAt] = useState(localDateTime(initialStart)); const [endsAt, setEndsAt] = useState(session?.ends_at ? localDateTime(session.ends_at) : plusMinutes(initialStart, 60)); const [description, setDescription] = useState(session?.description ?? ''); const [capacity, setCapacity] = useState(session?.capacity?.toString() ?? ''); const [streamUrl, setStreamUrl] = useState(session?.stream_url ?? ''); const [meetingUrl, setMeetingUrl] = useState(session?.meeting_url ?? ''); const [attachmentUrl, setAttachmentUrl] = useState(session?.attachment_url ?? ''); const [restricted, setRestricted] = useState(session?.limit_video_access ?? false); const [selected, setSelected] = useState<string[]>(assigned); const [selectedModerators, setSelectedModerators] = useState<string[]>(assignedModerators); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  function toggleSpeaker(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  useEffect(() => { if (!selectedModerators.length) setSelectedModerators(speakers.filter((person) => person.profile_type === 'moderator').map((person) => person.id)) }, [selectedModerators.length, speakers])
  async function save(form: React.FormEvent) { form.preventDefault(); if (!name.trim() || !startsAt || !endsAt) { setError('Completa nombre, inicio y fin.'); return }; if (new Date(endsAt) <= new Date(startsAt)) { setError('La hora de fin debe ser posterior al inicio.'); return }; const normalizedStage = stageId || null; const overlapping = allSessions.some((item) => item.id !== session?.id && item.stage_id === normalizedStage && item.session_type !== 'break' && type !== 'break' && item.starts_at && item.ends_at && new Date(startsAt) < new Date(item.ends_at) && new Date(endsAt) > new Date(item.starts_at)); if (overlapping) { setError('Ese escenario ya tiene una sesión en ese horario. Cambia el horario o el escenario.'); return }; setBusy(true); const payload = { organization_id: event.organization_id, event_id: event.id, name: name.trim(), session_type: type, stage_id: normalizedStage, starts_at: iso(startsAt), ends_at: iso(endsAt), description: description.trim() || null, capacity: type === 'workshop' && capacity ? Number(capacity) : null, stream_url: type === 'break' ? null : streamUrl.trim() || null, meeting_url: type === 'break' ? null : meetingUrl.trim() || null, attachment_url: type === 'break' ? null : attachmentUrl.trim() || null, limit_video_access: type === 'break' ? false : restricted, sort_order: session?.sort_order ?? allSessions.length }; const result = session ? await supabase.from('event_sessions').update(payload).eq('id', session.id).select('id').single() : await supabase.from('event_sessions').insert(payload).select('id').single(); if (result.error || !result.data) { setError(result.error?.message ?? 'No se pudo guardar la sesión.'); setBusy(false); return }; const id = result.data.id as string; const { error: deleteError } = await supabase.from('session_speakers').delete().eq('session_id', id); if (deleteError) { setError(deleteError.message); setBusy(false); return }; await supabase.from('session_moderators').delete().eq('session_id', id); if (type !== 'break' && selected.length) { const { error: linkError } = await supabase.from('session_speakers').insert(selected.map((speakerId, sortOrder) => ({ session_id: id, speaker_id: speakerId, sort_order: sortOrder }))); if (linkError) { setError(linkError.message); setBusy(false); return } } if (type !== 'break' && selectedModerators.length) { const { error: moderatorError } = await supabase.from('session_moderators').insert(selectedModerators.map((moderatorId, sortOrder) => ({ session_id: id, moderator_id: moderatorId, sort_order: sortOrder }))); if (moderatorError) { setError(moderatorError.message); setBusy(false); return } } setBusy(false); await onSaved() }
  return <Modal title={session ? 'Editar sesión' : 'Nueva sesión'} onClose={onClose}><form onSubmit={save} className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-3">{(['lecture','workshop','break'] as SessionType[]).map((item) => <button key={item} type="button" onClick={() => setType(item)} className={`rounded-xl border p-3 text-left ${type === item ? sessionStyle[item] : 'border-zinc-200 text-zinc-600'}`}>{item === 'break' ? <Coffee className="h-4 w-4" /> : <Presentation className="h-4 w-4" />}<span className="mt-2 block text-sm font-semibold">{sessionLabel[item]}</span></button>)}</div><div><label className={label}>Nombre *</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={type === 'break' ? 'Ej.: Coffee break' : 'Título de la sesión'} className={input} /></div><div className="grid gap-4 sm:grid-cols-2"><div><label className={label}>Inicio *</label><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={input} /></div><div><label className={label}>Fin *</label><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={input} /></div></div><div><label className={label}>{type === 'break' ? 'Escenario (opcional; vacío = receso general)' : 'Escenario'}</label><select value={stageId} onChange={(event) => setStageId(event.target.value)} className={input}><option value="">{type === 'break' ? 'Receso general' : 'Sin escenario todavía'}</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></div><div><label className={label}>Descripción</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={input} /></div>{type !== 'break' && <><fieldset><legend className={label}>Ponentes</legend><div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3">{speakers.length ? speakers.map((speaker) => <label key={speaker.id} className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={selected.includes(speaker.id)} onChange={() => toggleSpeaker(speaker.id)} />{speaker.full_name}{speaker.company ? ` · ${speaker.company}` : ''}</label>) : <p className="text-sm text-zinc-500">Crea perfiles de ponentes primero.</p>}</div></fieldset>{type === 'workshop' && <div><label className={label}>Cupo del taller</label><input min="1" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="Sin límite" className={input} /></div>}<details className="rounded-xl border border-zinc-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-zinc-700">Opciones virtuales y adjuntos</summary><div className="mt-3 grid gap-3"><input type="url" value={streamUrl} onChange={(event) => setStreamUrl(event.target.value)} placeholder="URL de transmisión" className={input} /><input type="url" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="URL de reunión" className={input} /><input type="url" value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="URL de adjunto" className={input} /><label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={restricted} onChange={(event) => setRestricted(event.target.checked)} />Limitar video a asistentes autorizados</label></div></details></>}{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<ModalActions onClose={onClose} busy={busy} label="Guardar sesión" /></form></Modal>
}

function SpeakerModalLegacy({ speaker, event, nextOrder, onClose, onSaved }: { speaker: Speaker | null; event: EventData; nextOrder: number; onClose: () => void; onSaved: () => Promise<void> }) { const [form, setForm] = useState({ full_name: speaker?.full_name ?? '', company: speaker?.company ?? '', position: speaker?.position ?? '', bio: speaker?.bio ?? '', photo_url: speaker?.photo_url ?? '', email: speaker?.email ?? '', phone: speaker?.phone ?? '', web: speaker?.web ?? '', linkedin: speaker?.linkedin ?? '', facebook: speaker?.facebook ?? '', twitter: speaker?.twitter ?? '', instagram: speaker?.instagram ?? '', country: speaker?.country ?? '', language: speaker?.language ?? '' }); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value })); async function save(eventForm: React.FormEvent) { eventForm.preventDefault(); if (!form.full_name.trim()) { setError('Indica el nombre del ponente.'); return }; setBusy(true); const nullable = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null])); const payload = { ...nullable, full_name: form.full_name.trim(), organization_id: event.organization_id, event_id: event.id, sort_order: speaker?.sort_order ?? nextOrder }; const result = speaker ? await supabase.from('event_speakers').update(payload).eq('id', speaker.id) : await supabase.from('event_speakers').insert(payload); setBusy(false); if (result.error) setError(result.error.message); else await onSaved() } return <Modal title={speaker ? 'Editar ponente' : 'Nuevo ponente'} onClose={onClose}><form onSubmit={save} className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre completo *" value={form.full_name} onChange={(value) => change('full_name', value)} /><Field label="Empresa" value={form.company} onChange={(value) => change('company', value)} /><Field label="Cargo" value={form.position} onChange={(value) => change('position', value)} /><Field label="País" value={form.country} onChange={(value) => change('country', value)} /><Field label="Idioma" value={form.language} onChange={(value) => change('language', value)} /><Field label="Foto (URL)" type="url" value={form.photo_url} onChange={(value) => change('photo_url', value)} /></div><div><label className={label}>Biografía</label><textarea value={form.bio} onChange={(event) => change('bio', event.target.value)} rows={4} className={input} /></div><details className="rounded-xl border border-zinc-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-zinc-700">Contacto y redes</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Correo" type="email" value={form.email} onChange={(value) => change('email', value)} /><Field label="Teléfono" value={form.phone} onChange={(value) => change('phone', value)} /><Field label="Web" type="url" value={form.web} onChange={(value) => change('web', value)} /><Field label="LinkedIn" type="url" value={form.linkedin} onChange={(value) => change('linkedin', value)} /><Field label="Facebook" type="url" value={form.facebook} onChange={(value) => change('facebook', value)} /><Field label="X / Twitter" type="url" value={form.twitter} onChange={(value) => change('twitter', value)} /><Field label="Instagram" type="url" value={form.instagram} onChange={(value) => change('instagram', value)} /></div></details>{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<ModalActions onClose={onClose} busy={busy} label="Guardar ponente" /></form></Modal> }
function SessionModal({ session, event, stages, speakers, assigned, assignedModerators, eventSponsors, assignedSponsors, allSessions, onClose, onSaved }: { session: Session | null; event: EventData; stages: Stage[]; speakers: Speaker[]; assigned: string[]; assignedModerators: string[]; eventSponsors: EventSponsor[]; assignedSponsors: string[]; allSessions: Session[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const initialStart = session?.starts_at ?? event.start_date
  const [type, setType] = useState<SessionType>(session?.session_type ?? 'lecture')
  const [name, setName] = useState(session?.name ?? '')
  const [stageId, setStageId] = useState(session?.stage_id ?? '')
  const [startsAt, setStartsAt] = useState(localDateTime(initialStart))
  const [endsAt, setEndsAt] = useState(session?.ends_at ? localDateTime(session.ends_at) : plusMinutes(initialStart, 60))
  const [description, setDescription] = useState(session?.description ?? '')
  const [capacity, setCapacity] = useState(session?.capacity?.toString() ?? '')
  const [streamUrl, setStreamUrl] = useState(session?.stream_url ?? '')
  const [meetingUrl, setMeetingUrl] = useState(session?.meeting_url ?? '')
  const [attachmentUrl, setAttachmentUrl] = useState(session?.attachment_url ?? '')
  const [restricted, setRestricted] = useState(session?.limit_video_access ?? false)
  const [selected, setSelected] = useState<string[]>(assigned)
  const [selectedModerators, setSelectedModerators] = useState<string[]>(assignedModerators)
  const [selectedSponsors, setSelectedSponsors] = useState<string[]>(assignedSponsors)
  const [sponsorType, setSponsorType] = useState(type === 'break' ? 'coffee_break' : 'session')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function toggle(current: string[], setter: (value: string[]) => void, id: string) { setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  async function save(form: React.FormEvent) {
    form.preventDefault()
    if (!name.trim() || !startsAt || !endsAt) { setError('Completa nombre, inicio y fin.'); return }
    if (new Date(endsAt) <= new Date(startsAt)) { setError('La hora de fin debe ser posterior al inicio.'); return }
    const normalizedStage = stageId || null
    const overlapping = allSessions.some((item) => item.id !== session?.id && item.stage_id === normalizedStage && item.session_type !== 'break' && type !== 'break' && item.starts_at && item.ends_at && new Date(startsAt) < new Date(item.ends_at) && new Date(endsAt) > new Date(item.starts_at))
    if (overlapping) { setError('Ese escenario ya tiene una sesión en ese horario. Cambia el horario o el escenario.'); return }
    setBusy(true)
    const payload = { organization_id: event.organization_id, event_id: event.id, name: name.trim(), session_type: type, stage_id: normalizedStage, starts_at: iso(startsAt), ends_at: iso(endsAt), description: description.trim() || null, capacity: type === 'workshop' && capacity ? Number(capacity) : null, stream_url: type === 'break' ? null : streamUrl.trim() || null, meeting_url: type === 'break' ? null : meetingUrl.trim() || null, attachment_url: type === 'break' ? null : attachmentUrl.trim() || null, limit_video_access: type === 'break' ? false : restricted, sort_order: session?.sort_order ?? allSessions.length }
    const result = session ? await supabase.from('event_sessions').update(payload).eq('id', session.id).select('id').single() : await supabase.from('event_sessions').insert(payload).select('id').single()
    if (result.error || !result.data) { setError(result.error?.message ?? 'No se pudo guardar la sesión.'); setBusy(false); return }
    const id = result.data.id as string
    const speakerDelete = await supabase.from('session_speakers').delete().eq('session_id', id)
    const moderatorDelete = await supabase.from('session_moderators').delete().eq('session_id', id)
    const sponsorDelete = await supabase.from('session_sponsorships').delete().eq('session_id', id)
    if (speakerDelete.error || moderatorDelete.error || sponsorDelete.error) { setError(speakerDelete.error?.message ?? moderatorDelete.error?.message ?? sponsorDelete.error?.message ?? 'No se pudieron actualizar las asignaciones.'); setBusy(false); return }
    if (type !== 'break' && selected.length) { const linked = await supabase.from('session_speakers').insert(selected.map((speakerId, sortOrder) => ({ session_id: id, speaker_id: speakerId, sort_order: sortOrder }))); if (linked.error) { setError(linked.error.message); setBusy(false); return } }
    if (type !== 'break' && selectedModerators.length) { const linked = await supabase.from('session_moderators').insert(selectedModerators.map((moderatorId, sortOrder) => ({ session_id: id, moderator_id: moderatorId, sort_order: sortOrder }))); if (linked.error) { setError(linked.error.message); setBusy(false); return } }
    if (selectedSponsors.length) { const linked = await supabase.from('session_sponsorships').insert(selectedSponsors.map((eventSponsorshipId, sortOrder) => ({ session_id: id, event_sponsorship_id: eventSponsorshipId, activation_type: sponsorType, sort_order: sortOrder }))); if (linked.error) { setError(linked.error.message); setBusy(false); return } }
    setBusy(false); await onSaved()
  }
  const speakerProfiles = speakers.filter((person) => person.profile_type !== 'moderator')
  const moderatorProfiles = speakers.filter((person) => person.profile_type === 'moderator')
  const sponsorName = (sponsor: EventSponsor) => Array.isArray(sponsor.company) ? sponsor.company[0]?.name : sponsor.company?.name
  return <Modal title={session ? 'Editar actividad' : 'Nueva actividad'} onClose={onClose}><form onSubmit={save} className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-3">{(['lecture', 'workshop', 'break'] as SessionType[]).map((item) => <button key={item} type="button" onClick={() => { setType(item); if (item === 'break' && sponsorType === 'session') setSponsorType('coffee_break') }} className={`rounded-xl border p-3 text-left ${type === item ? sessionStyle[item] : 'border-zinc-200 text-zinc-600'}`}>{item === 'break' ? <Coffee className="h-4 w-4" /> : <Presentation className="h-4 w-4" />}<span className="mt-2 block text-sm font-semibold">{sessionLabel[item]}</span></button>)}</div><div><label className={label}>Nombre *</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={type === 'break' ? 'Ej.: Coffee break' : 'Título de la sesión'} className={input} /></div><div className="grid gap-4 sm:grid-cols-2"><div><label className={label}>Inicio *</label><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={input} /></div><div><label className={label}>Fin *</label><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={input} /></div></div><div><label className={label}>{type === 'break' ? 'Escenario (opcional; vacío = receso general)' : 'Escenario'}</label><select value={stageId} onChange={(event) => setStageId(event.target.value)} className={input}><option value="">{type === 'break' ? 'Receso general' : 'Sin escenario todavía'}</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></div><div><label className={label}>Descripción</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={input} /></div>{type !== 'break' && <><fieldset><legend className={label}>Ponentes</legend><div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3">{speakerProfiles.length ? speakerProfiles.map((speaker) => <label key={speaker.id} className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={selected.includes(speaker.id)} onChange={() => toggle(selected, setSelected, speaker.id)} />{speaker.full_name}{speaker.company ? ` · ${speaker.company}` : ''}</label>) : <p className="text-sm text-zinc-500">Crea perfiles de ponentes primero.</p>}</div></fieldset><fieldset><legend className={label}>Moderadores</legend><div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3">{moderatorProfiles.length ? moderatorProfiles.map((speaker) => <label key={speaker.id} className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={selectedModerators.includes(speaker.id)} onChange={() => toggle(selectedModerators, setSelectedModerators, speaker.id)} />{speaker.full_name}{speaker.company ? ` · ${speaker.company}` : ''}</label>) : <p className="text-sm text-zinc-500">Crea un perfil con tipo Moderador.</p>}</div></fieldset>{type === 'workshop' && <div><label className={label}>Cupo del taller</label><input min="1" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="Sin límite" className={input} /></div>}<details className="rounded-xl border border-zinc-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-zinc-700">Opciones virtuales y adjuntos</summary><div className="mt-3 grid gap-3"><input type="url" value={streamUrl} onChange={(event) => setStreamUrl(event.target.value)} placeholder="URL de transmisión" className={input} /><input type="url" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="URL de reunión" className={input} /><input type="url" value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="URL de adjunto" className={input} /><label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={restricted} onChange={(event) => setRestricted(event.target.checked)} />Limitar video a asistentes autorizados</label></div></details></>}{<fieldset><legend className={label}>Patrocinantes de esta actividad</legend><div className="grid gap-3 sm:grid-cols-2"><select value={sponsorType} onChange={(event) => setSponsorType(event.target.value)} className={input}><option value="session">Patrocinio de charla/taller</option><option value="coffee_break">Coffee break</option><option value="lunch">Lunch</option><option value="welcome">Bienvenida</option><option value="closing">Cierre</option><option value="other">Otro</option></select><div className="max-h-32 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3">{eventSponsors.length ? eventSponsors.map((sponsor) => <label key={sponsor.id} className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={selectedSponsors.includes(sponsor.id)} onChange={() => toggle(selectedSponsors, setSelectedSponsors, sponsor.id)} />{sponsorName(sponsor) ?? sponsor.company_id}</label>) : <p className="text-sm text-zinc-500">Asigna primero patrocinantes al evento.</p>}</div></div></fieldset>}{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<ModalActions onClose={onClose} busy={busy} label="Guardar actividad" /></form></Modal>
}

void SessionModalLegacy
void SpeakerModalLegacy

function SpeakerModal({ speaker, event, nextOrder, onClose, onSaved }: { speaker: Speaker | null; event: EventData; nextOrder: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ full_name: speaker?.full_name ?? '', company: speaker?.company ?? '', position: speaker?.position ?? '', bio: speaker?.bio ?? '', photo_url: speaker?.photo_url ?? '', email: speaker?.email ?? '', phone: speaker?.phone ?? '', web: speaker?.web ?? '', linkedin: speaker?.linkedin ?? '', facebook: speaker?.facebook ?? '', twitter: speaker?.twitter ?? '', instagram: speaker?.instagram ?? '', country: speaker?.country ?? '', language: speaker?.language ?? '' })
  const [profileType, setProfileType] = useState<'speaker' | 'moderator'>(speaker?.profile_type ?? 'speaker')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  async function save(eventForm: React.FormEvent) { eventForm.preventDefault(); if (!form.full_name.trim()) { setError('Indica el nombre del perfil.'); return }; setBusy(true); const nullable = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null])); const payload = { ...nullable, full_name: form.full_name.trim(), profile_type: profileType, organization_id: event.organization_id, event_id: event.id, sort_order: speaker?.sort_order ?? nextOrder }; const result = speaker ? await supabase.from('event_speakers').update(payload).eq('id', speaker.id) : await supabase.from('event_speakers').insert(payload); setBusy(false); if (result.error) setError(result.error.message); else await onSaved() }
  return <Modal title={speaker ? 'Editar perfil' : 'Nuevo perfil'} onClose={onClose}><form onSubmit={save} className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre completo *" value={form.full_name} onChange={(value) => change('full_name', value)} /><div><label className={label}>Tipo de perfil</label><select value={profileType} onChange={(event) => setProfileType(event.target.value as 'speaker' | 'moderator')} className={input}><option value="speaker">Ponente</option><option value="moderator">Moderador</option></select></div><Field label="Empresa" value={form.company} onChange={(value) => change('company', value)} /><Field label="Cargo" value={form.position} onChange={(value) => change('position', value)} /><Field label="País" value={form.country} onChange={(value) => change('country', value)} /><Field label="Idioma" value={form.language} onChange={(value) => change('language', value)} /><Field label="Foto (URL)" type="url" value={form.photo_url} onChange={(value) => change('photo_url', value)} /></div><div><label className={label}>Biografía</label><textarea value={form.bio} onChange={(event) => change('bio', event.target.value)} rows={4} className={input} /></div><details className="rounded-xl border border-zinc-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-zinc-700">Contacto y redes</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Correo" type="email" value={form.email} onChange={(value) => change('email', value)} /><Field label="Teléfono" value={form.phone} onChange={(value) => change('phone', value)} /><Field label="Web" type="url" value={form.web} onChange={(value) => change('web', value)} /><Field label="LinkedIn" type="url" value={form.linkedin} onChange={(value) => change('linkedin', value)} /><Field label="Facebook" type="url" value={form.facebook} onChange={(value) => change('facebook', value)} /><Field label="X / Twitter" type="url" value={form.twitter} onChange={(value) => change('twitter', value)} /><Field label="Instagram" type="url" value={form.instagram} onChange={(value) => change('instagram', value)} /></div></details>{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<ModalActions onClose={onClose} busy={busy} label="Guardar perfil" /></form></Modal>
}

function Field({ label: text, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <div><label className={label}>{text}</label><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={input} /></div> }
function ModalActions({ onClose, busy, label: text }: { onClose: () => void; busy: boolean; label: string }) { return <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700">Cancelar</button><button disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : text}</button></div> }
