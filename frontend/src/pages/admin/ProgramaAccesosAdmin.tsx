import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Ticket } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Event = { id: string; name: string }
type Item = { id: string; name: string }
type Pass = Item & { access_mode: string }
type ProgramCompany = { id: string; name: string; kind: string; event_id: string | null }
type Participation = { id: string; event_id: string | null; participation_type: string; status: string; people: { first_name: string; last_name: string | null; email: string | null; company: string | null } | null }

const field = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'

export default function ProgramaAccesosAdmin() {
  const { programId } = useParams()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [events, setEvents] = useState<Event[]>([])
  const [sessions, setSessions] = useState<Item[]>([])
  const [zones, setZones] = useState<Item[]>([])
  const [passes, setPasses] = useState<Pass[]>([])
  const [companies, setCompanies] = useState<ProgramCompany[]>([])
  const [participations, setParticipations] = useState<Participation[]>([])
  const [eventId, setEventId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [zoneName, setZoneName] = useState('')
  const [passName, setPassName] = useState('')
  const [mode, setMode] = useState<'program' | 'session' | 'zone'>('program')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!programId) return

    const { data: program, error: programError } = await supabase
      .from('event_programs')
      .select('name,organization_id')
      .eq('id', programId)
      .maybeSingle()
    if (programError || !program) {
      setError(programError?.message ?? 'Programa no encontrado.')
      return
    }

    setTitle(program.name)
    setOrgId(program.organization_id)
    const { data: links } = await supabase
      .from('program_events')
      .select('events(id,name)')
      .eq('program_id', programId)
    const programEvents = (links ?? []).flatMap((link) => link.events ? [link.events] : []) as unknown as Event[]
    setEvents(programEvents)
    if (programEvents[0]) setEventId((current) => current || programEvents[0].id)

    const eventIds = programEvents.map((event) => event.id)
    if (!eventIds.length) return
    const [sessionResult, zoneResult, passResult, companyResult, participationResult] = await Promise.all([
      supabase.from('event_sessions').select('id,name').in('event_id', eventIds).order('name'),
      supabase.from('event_zones').select('id,name').in('event_id', eventIds).order('name'),
      supabase.from('passes').select('id,name,access_mode').eq('program_id', programId).order('created_at'),
      supabase.from('companies').select('id,name,kind,event_id').eq('organization_id', program.organization_id).or(`kind.neq.exhibitor,event_id.in.(${eventIds.join(',')})`).order('name'),
      supabase.from('event_participations').select('id,event_id,participation_type,status,people(first_name,last_name,email,company)').eq('program_id', programId).order('created_at', { ascending: false }),
    ])
    if (sessionResult.error || zoneResult.error || passResult.error || companyResult.error || participationResult.error) {
      setError(sessionResult.error?.message ?? zoneResult.error?.message ?? passResult.error?.message ?? companyResult.error?.message ?? participationResult.error?.message ?? 'No se pudo cargar.')
      return
    }
    setSessions((sessionResult.data ?? []) as Item[])
    setZones((zoneResult.data ?? []) as Item[])
    setPasses((passResult.data ?? []) as Pass[])
    setCompanies((companyResult.data ?? []) as ProgramCompany[])
    setParticipations((participationResult.data ?? []) as unknown as Participation[])
  }, [programId])

  useEffect(() => { void load() }, [load])

  async function createSession(event: FormEvent) {
    event.preventDefault()
    if (!orgId || !eventId || !sessionName.trim()) return
    setBusy(true); setError(null)
    const { error: insertError } = await supabase.from('event_sessions').insert({ organization_id: orgId, event_id: eventId, name: sessionName.trim() })
    setBusy(false)
    if (insertError) setError(insertError.message)
    else { setSessionName(''); await load() }
  }

  async function createZone(event: FormEvent) {
    event.preventDefault()
    if (!orgId || !eventId || !zoneName.trim()) return
    setBusy(true); setError(null)
    const { error: insertError } = await supabase.from('event_zones').insert({ organization_id: orgId, event_id: eventId, name: zoneName.trim(), kind: 'general' })
    setBusy(false)
    if (insertError) setError(insertError.message)
    else { setZoneName(''); await load() }
  }

  async function createPass(event: FormEvent) {
    event.preventDefault()
    if (!programId || !passName.trim()) return
    const validRule = mode === 'program' ? eventId : mode === 'session' ? sessionId : zoneId
    if (!validRule) { setError('Selecciona la regla de acceso para este pase.'); return }
    setBusy(true); setError(null)
    const { data, error: passError } = await supabase.from('passes').insert({ program_id: programId, name: passName.trim(), access_mode: mode, is_public: true }).select('id').single()
    if (passError || !data) setError(passError?.message ?? 'No se pudo crear el pase.')
    else {
      const { error: entitlementError } = mode === 'program'
        ? await supabase.from('pass_entitlements').insert({ pass_id: data.id, event_id: eventId })
        : mode === 'session'
          ? await supabase.from('pass_entitlements').insert({ pass_id: data.id, session_id: sessionId })
          : await supabase.from('pass_entitlements').insert({ pass_id: data.id, zone_id: zoneId })
      if (entitlementError) setError(entitlementError.message)
    }
    setBusy(false); setPassName(''); await load()
  }

  const eventName = (id: string | null) => events.find(event => event.id === id)?.name ?? 'Programa completo'
  return <div className="min-h-[100dvh] bg-zinc-50"><header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4"><Link to="/admin/programas" className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100"><ArrowLeft className="h-4 w-4" /></Link><Ticket className="h-5 w-5 text-emerald-700" /><span className="font-semibold">Centro del programa</span></div></header><main className="mx-auto max-w-6xl px-5 py-8"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-zinc-600">Sesiones, zonas y pases se mantienen por evento; empresas y participantes se consultan aquí de forma unificada.</p>{error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="mt-6 grid gap-6 lg:grid-cols-3"><Card title="Sesiones" items={sessions}><form onSubmit={createSession} className="grid gap-3"><EventSelect events={events} value={eventId} onChange={setEventId} /><input value={sessionName} onChange={(event) => setSessionName(event.target.value)} placeholder="Nombre de la sesión" className={field} /><AddButton busy={busy} /></form></Card><Card title="Zonas" items={zones}><form onSubmit={createZone} className="grid gap-3"><EventSelect events={events} value={eventId} onChange={setEventId} /><input value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="Ej.: Exposición general" className={field} /><AddButton busy={busy} /></form></Card><Card title="Pases" items={passes}><form onSubmit={createPass} className="grid gap-3"><input value={passName} onChange={(event) => setPassName(event.target.value)} placeholder="Ej.: Pase expositor" className={field} /><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className={field}><option value="program">Evento</option><option value="session">Sesión</option><option value="zone">Zona</option></select>{mode === 'program' && <EventSelect events={events} value={eventId} onChange={setEventId} />}{mode === 'session' && <RuleSelect items={sessions} value={sessionId} onChange={setSessionId} label="Seleccionar sesión" />}{mode === 'zone' && <RuleSelect items={zones} value={zoneId} onChange={setZoneId} label="Seleccionar zona" />}<AddButton busy={busy} /></form></Card></div><section className="mt-6 grid gap-6 lg:grid-cols-2"><article className="rounded-2xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">Empresas compartidas ({companies.length})</h2><p className="mt-1 text-sm text-zinc-600">Patrocinantes de la organización y expositores de los eventos de este programa.</p><ul className="mt-4 max-h-80 space-y-2 overflow-auto text-sm">{companies.map(company => <li key={company.id} className="rounded-lg bg-zinc-50 p-3"><strong>{company.name}</strong><span className="ml-2 text-zinc-500">{company.kind === 'exhibitor' ? `Expositor · ${eventName(company.event_id)}` : 'Patrocinante / aliado'}</span></li>)}{!companies.length && <li className="text-zinc-500">Aún no hay empresas disponibles.</li>}</ul></article><article className="rounded-2xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">Participantes unificados ({participations.length})</h2><p className="mt-1 text-sm text-zinc-600">Un registro del programa conserva una sola persona, pase y perfil, aunque tenga accesos a varios eventos.</p><ul className="mt-4 max-h-80 space-y-2 overflow-auto text-sm">{participations.map(item => <li key={item.id} className="rounded-lg bg-zinc-50 p-3"><strong>{[item.people?.first_name, item.people?.last_name].filter(Boolean).join(' ') || 'Participante'}</strong><span className="ml-2 text-zinc-500">{item.participation_type} · {eventName(item.event_id)} · {item.status}</span>{item.people?.email && <p className="mt-1 text-xs text-zinc-500">{item.people.email}{item.people.company ? ` · ${item.people.company}` : ''}</p>}</li>)}{!participations.length && <li className="text-zinc-500">Aún no hay registros por programa.</li>}</ul></article></section></main></div>
}

function EventSelect({ events, value, onChange }: { events: Event[]; value: string; onChange: (value: string) => void }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className={field}>{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> }
function RuleSelect({ items, value, onChange, label }: { items: Item[]; value: string; onChange: (value: string) => void; label: string }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className={field}><option value="">{label}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> }
function AddButton({ busy }: { busy: boolean }) { return <button disabled={busy} className="inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Añadir</button> }
function Card({ title, items, children }: { title: string; items: Item[]; children: ReactNode }) { return <section className="rounded-2xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4">{children}</div><ul className="mt-5 space-y-2 text-sm">{items.map((item) => <li key={item.id} className="rounded-lg bg-zinc-50 px-3 py-2"><strong>{item.name}</strong>{'access_mode' in item && <span className="ml-2 text-zinc-500">{(item as Pass).access_mode}</span>}</li>)}</ul></section> }
