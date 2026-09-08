import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Building2, Home, Handshake, Plus, UsersRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { loadProgramScopes, type ProgramScope } from '../../lib/programContext'

type EventRow = { id: string; name: string; organization_id: string }
type Company = { id: string; name: string; kind: string; event_id: string | null }
type Package = { id: string; name: string; price: number | null; currency: string; description: string | null }
type Sponsor = { id: string; company_id: string; package_id: string | null; status: string; agreed_amount: number | null }
type Session = { id: string; name: string; session_type: string }
const field = 'rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm'

export default function PatrocinantesAdmin() {
  const { eventId } = useParams()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [scopes, setScopes] = useState<ProgramScope[]>([])
  const [companyId, setCompanyId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [status, setStatus] = useState('prospect')
  const [activation, setActivation] = useState('')
  const [activationType, setActivationType] = useState('coffee_break')
  const [sessionId, setSessionId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!eventId) return
    const eventResult = await supabase.from('events').select('id,name,organization_id').eq('id', eventId).maybeSingle()
    if (eventResult.error || !eventResult.data) { setError(eventResult.error?.message ?? 'Evento no encontrado.'); return }
    const current = eventResult.data as EventRow
    setEvent(current)
    const scopeMap = await loadProgramScopes(current.organization_id, [current.id])
    const programScopes = scopeMap.get(current.id) ?? []
    setScopes(programScopes)
    const sharedEventIds = [...new Set([current.id, ...programScopes.flatMap(scope => scope.eventIds)])]
    const [companyResult, packageResult, sponsorResult, sessionResult] = await Promise.all([
      supabase.from('companies').select('id,name,kind,event_id').eq('organization_id', current.organization_id).or(`kind.neq.exhibitor,event_id.in.(${sharedEventIds.join(',')})`).order('name'),
      supabase.from('sponsorship_packages').select('id,name,price,currency,description').eq('organization_id', current.organization_id).eq('is_active', true).order('name'),
      supabase.from('event_sponsorships').select('id,company_id,package_id,status,agreed_amount').eq('event_id', current.id).order('created_at'),
      supabase.from('event_sessions').select('id,name,session_type').eq('event_id', current.id).order('starts_at'),
    ])
    setCompanies((companyResult.data ?? []) as Company[])
    setPackages((packageResult.data ?? []) as Package[])
    setSponsors((sponsorResult.data ?? []) as Sponsor[])
    setSessions((sessionResult.data ?? []) as Session[])
    setError(companyResult.error?.message ?? packageResult.error?.message ?? sponsorResult.error?.message ?? sessionResult.error?.message ?? null)
  }, [eventId])
  useEffect(() => { void load() }, [load])
  const sharedExhibitors = useMemo(() => companies.filter(company => company.kind === 'exhibitor' && company.event_id !== eventId), [companies, eventId])
  async function assign(form: React.FormEvent) {
    form.preventDefault()
    if (!event || !companyId) return
    setBusy(true); setError(null)
    const result = await supabase.from('event_sponsorships').upsert({ organization_id: event.organization_id, event_id: event.id, company_id: companyId, package_id: packageId || null, status, agreed_amount: null }, { onConflict: 'event_id,company_id' }).select('id').single()
    if (!result.error && result.data && activation.trim()) {
      const activationResult = await supabase.from('sponsorship_activations').insert({ event_sponsorship_id: result.data.id, activation_type: activationType, label: activation.trim(), session_id: sessionId || null })
      if (activationResult.error) setError(activationResult.error.message)
    }
    setBusy(false)
    if (result.error) setError(result.error.message)
    else { setActivation(''); await load() }
  }
  return <div className="min-h-[100dvh] bg-zinc-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4"><Link to={`/admin/eventos/${eventId}/administrar`} aria-label="Volver a administrar evento" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><Home className="h-4 w-4" />Admin del evento</Link><Handshake className="h-5 w-5 text-emerald-700" /><span className="font-semibold">Patrocinantes</span></div></header><main className="mx-auto max-w-6xl px-5 py-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">Plan comercial · {event?.name ?? 'Evento'}</h1><p className="mt-1 text-sm text-zinc-600">Asigna paquetes, controla entregables y vincula coffee breaks o lunch patrocinados.</p></div><Link to="/admin/patrocinantes" className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700"><Building2 className="h-4 w-4" />Administrar empresas</Link></div>{scopes.length > 0 && <aside className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex gap-2"><UsersRound className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Catálogo compartido por programa</strong><p className="mt-1">Este evento pertenece a {scopes.map(scope => scope.name).join(', ')}. Puedes seleccionar patrocinantes propios y {sharedExhibitors.length} expositor(es) de los eventos vinculados; el acuerdo, sus pagos y entregables quedan registrados en este evento.</p></div></div></aside>}{error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<section className="mt-6 grid gap-6 lg:grid-cols-2"><form onSubmit={assign} className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Asignar patrocinante y activación</h2><p className="mt-1 text-xs text-zinc-500">Las empresas se administran en el catálogo comercial. Los expositores compartidos aparecen identificados en el selector.</p><div className="mt-4 grid gap-3"><select className={field} value={companyId} onChange={event => setCompanyId(event.target.value)}><option value="">Empresa patrocinante</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}{company.kind === 'exhibitor' ? company.event_id === eventId ? ' · Expositor de este evento' : ' · Expositor del programa' : ''}</option>)}</select><select className={field} value={packageId} onChange={event => setPackageId(event.target.value)}><option value="">Sin paquete</option>{packages.map(item => <option key={item.id} value={item.id}>{item.name}{item.price != null ? ` · ${item.price} ${item.currency}` : ''}</option>)}</select><select className={field} value={status} onChange={event => setStatus(event.target.value)}>{['prospect', 'proposed', 'confirmed', 'active', 'fulfilled', 'cancelled'].map(value => <option key={value} value={value}>{value}</option>)}</select><input className={field} value={activation} onChange={event => setActivation(event.target.value)} placeholder="Activación opcional: Coffee break patrocinado" /><div className="grid grid-cols-2 gap-3"><select className={field} value={activationType} onChange={event => setActivationType(event.target.value)}><option value="coffee_break">Coffee break</option><option value="lunch">Lunch</option><option value="welcome">Bienvenida</option><option value="closing">Cierre</option><option value="session">Sesión</option><option value="other">Otra</option></select><select className={field} value={sessionId} onChange={event => setSessionId(event.target.value)}><option value="">Sin sesión</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.name}</option>)}</select></div></div><button disabled={busy || !companyId} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Guardar asignación</button></form><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Paquetes comerciales</h2><ul className="mt-4 space-y-2">{packages.map(item => <li key={item.id} className="rounded-lg bg-zinc-50 p-3 text-sm"><strong>{item.name}</strong>{item.description && <span className="ml-2 text-zinc-600">{item.description}</span>}</li>)}{!packages.length && <li className="text-sm text-zinc-500">Crea paquetes desde Administración de patrocinantes.</li>}</ul></section></section><section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Patrocinantes asignados</h2><div className="mt-4 space-y-2">{sponsors.map(sponsor => <div key={sponsor.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-zinc-50 p-3 text-sm"><span><strong>{companies.find(company => company.id === sponsor.company_id)?.name ?? 'Empresa'}</strong><span className="ml-2 text-zinc-600">{packages.find(item => item.id === sponsor.package_id)?.name ?? 'Sin paquete'} · {sponsor.status}</span></span><span className="text-zinc-500">{sponsor.agreed_amount ?? 'Monto pendiente'}</span></div>)}{!sponsors.length && <p className="text-sm text-zinc-500">Aún no hay patrocinantes asignados.</p>}</div></section></main></div>
}
