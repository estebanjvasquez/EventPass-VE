import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Home, UserRound, UserPlus, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Event = { id: string; name: string; organization_id: string }
type Option = { id: string; name: string }
type Person = { id: string; full_name: string; email: string | null; role: string; source_type: string; provider_id: string | null; sponsor_company_id: string | null; status: string }
const field = 'rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm'

export default function PersonalEventoAdmin() {
  const { eventId } = useParams()
  const [event, setEvent] = useState<Event | null>(null)
  const [providers, setProviders] = useState<Option[]>([])
  const [sponsors, setSponsors] = useState<Option[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [role, setRole] = useState('support'); const [source, setSource] = useState('organizer'); const [providerId, setProviderId] = useState(''); const [sponsorId, setSponsorId] = useState(''); const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!eventId) return
    const eventResult = await supabase.from('events').select('id,name,organization_id').eq('id', eventId).maybeSingle()
    if (eventResult.error || !eventResult.data) { setError(eventResult.error?.message ?? 'Evento no encontrado.'); return }
    const e = eventResult.data as Event; setEvent(e)
    const [providerResult, sponsorResult, peopleResult] = await Promise.all([supabase.from('providers').select('id,name').eq('organization_id', e.organization_id).order('name'), supabase.from('companies').select('id,name').eq('organization_id', e.organization_id).in('kind', ['sponsor', 'partner']).order('name'), supabase.from('event_personnel').select('id,full_name,email,role,source_type,provider_id,sponsor_company_id,status').eq('event_id', e.id).order('full_name')])
    setProviders((providerResult.data ?? []) as Option[]); setSponsors((sponsorResult.data ?? []) as Option[]); setPeople((peopleResult.data ?? []) as Person[]); setError(providerResult.error?.message ?? sponsorResult.error?.message ?? peopleResult.error?.message ?? null)
  }, [eventId])
  useEffect(() => { void load() }, [load])
  async function createProvider() {
    if (!event) return
    const providerName = window.prompt('Nombre del proveedor')?.trim()
    if (!providerName) return
    const result = await supabase.from('providers').insert({ organization_id: event.organization_id, name: providerName, category: 'Otro' }).select('id,name').single()
    if (result.error || !result.data) setError(result.error?.message ?? 'No se pudo crear el proveedor.')
    else { const option = result.data as Option; setProviders((current) => [...current, option].sort((a, b) => a.name.localeCompare(b.name))); setProviderId(option.id) }
  }
  async function create(form: React.FormEvent) { form.preventDefault(); if (!event || !name.trim()) return; const result = await supabase.from('event_personnel').insert({ organization_id: event.organization_id, event_id: event.id, full_name: name.trim(), email: email.trim() || null, role, source_type: source, provider_id: source === 'provider' ? providerId : null, sponsor_company_id: source === 'sponsor' ? sponsorId : null }); if (result.error) setError(result.error.message); else { setName(''); setEmail(''); setProviderId(''); setSponsorId(''); await load() } }
  return <div className="min-h-[100dvh] bg-zinc-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4"><Link to={`/admin/eventos/${eventId}/administrar`} aria-label="Volver a administrar evento" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><Home className="h-4 w-4" />Admin del evento</Link><UserRound className="h-5 w-5 text-emerald-700" /><span className="font-semibold">Personal del evento</span></div></header><main className="mx-auto max-w-5xl px-5 py-8"><h1 className="text-2xl font-bold">Personal operativo · {event?.name ?? 'Evento'}</h1><p className="mt-1 text-sm text-zinc-600">Registra quién trabaja en el evento y si pertenece al organizador, a un proveedor o a un patrocinante.</p>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<form onSubmit={create} className="mt-6 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-2"><input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" /><input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo (opcional)" /><select className={field} value={role} onChange={(e) => setRole(e.target.value)}><option value="support">Apoyo operativo</option><option value="checkin">Check-in</option><option value="security">Seguridad</option><option value="host">Anfitrión</option><option value="technical">Técnico</option><option value="catering">Catering</option></select><select className={field} value={source} onChange={(e) => setSource(e.target.value)}><option value="organizer">Personal del organizador</option><option value="provider">Personal de proveedor</option><option value="sponsor">Personal de patrocinante</option></select>{source === 'provider' && <div className="flex gap-2"><select className={`${field} min-w-0 flex-1`} value={providerId} onChange={(e) => setProviderId(e.target.value)}><option value="">Seleccionar proveedor</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={createProvider} title="Crear proveedor" className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><Plus className="h-3.5 w-3.5" />Crear</button></div>}{source === 'sponsor' && <select className={field} value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}><option value="">Seleccionar patrocinante</option>{sponsors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button disabled={!name.trim() || (source === 'provider' && !providerId) || (source === 'sponsor' && !sponsorId)} className="inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><UserPlus className="h-4 w-4" />Registrar personal</button></form><section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Personal registrado</h2><div className="mt-4 space-y-2">{people.map((person) => <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 text-sm"><span><strong>{person.full_name}</strong><span className="ml-2 text-zinc-600">{person.role}</span>{person.email && <span className="ml-2 text-zinc-500">{person.email}</span>}</span><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-600">{person.source_type === 'organizer' ? 'Organizador' : person.source_type === 'provider' ? 'Proveedor' : 'Patrocinante'}</span></div>)}{!people.length && <p className="text-sm text-zinc-500">Aún no hay personal registrado.</p>}</div></section></main></div>
}
