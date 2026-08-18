import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Copy, Plus, Settings2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolveActiveOrg } from '../../lib/activeOrg'

type Event = { id: string; name: string; event_type: string }
type Program = { id: string; name: string; venue_name: string | null; starts_at: string | null; status: string }
const input = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'

export default function ProgramasAdmin() {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [name, setName] = useState('')
  const [venue, setVenue] = useState('')
  const [date, setDate] = useState('2026-10-15T09:00')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (organizationId: string) => {
    const [programResult, eventResult] = await Promise.all([
      supabase.from('event_programs').select('id,name,venue_name,starts_at,status').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      supabase.from('events').select('id,name,event_type').eq('organization_id', organizationId).neq('status', 'archived').order('name'),
    ])
    if (programResult.error || eventResult.error) setError(programResult.error?.message ?? eventResult.error?.message ?? 'No se pudo cargar la información.')
    setPrograms((programResult.data ?? []) as Program[])
    setEvents((eventResult.data ?? []) as Event[])
  }, [])

  useEffect(() => {
    void resolveActiveOrg().then((membership) => {
      if (!membership) return
      setOrgId(membership.organization_id)
      void load(membership.organization_id)
    })
  }, [load])

  async function createProgram(event: React.FormEvent) {
    event.preventDefault()
    if (!orgId || !name.trim()) return
    setBusy(true); setError(null)
    const { data, error: createError } = await supabase.from('event_programs').insert({ organization_id: orgId, name: name.trim(), venue_name: venue.trim() || null, starts_at: date ? new Date(date).toISOString() : null, status: 'draft', registration_config: { public_profiles: ['attendee', 'guest', 'vip', 'speaker', 'exhibitor'] } }).select('id').single()
    if (createError || !data) setError(createError?.message ?? 'No se pudo crear el programa.')
    else if (selected.length) {
      const { error: linkError } = await supabase.from('program_events').insert(selected.map((eventId) => ({ program_id: data.id, event_id: eventId, component_type: events.find((item) => item.id === eventId)?.event_type === 'forum' ? 'forum' : 'exhibition' })))
      if (linkError) setError(linkError.message)
    }
    setBusy(false); setName(''); setVenue(''); setSelected([])
    await load(orgId)
  }

  return <div className="min-h-[100dvh] bg-zinc-50"><header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4"><Link to="/admin/eventos" aria-label="Volver a eventos" className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100"><ArrowLeft className="h-4 w-4" /></Link><h1 className="font-semibold">Programas de evento</h1></div></header><main className="mx-auto max-w-5xl px-5 py-8"><p className="text-sm text-zinc-600">Agrupa foro y exposición. Después configura sesiones, zonas y pases de acceso.</p>{error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<form onSubmit={createProgram} className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">Nuevo programa</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><input required className={input} placeholder="Foro + Expo 2026" value={name} onChange={(event) => setName(event.target.value)} /><input className={input} placeholder="Sede" value={venue} onChange={(event) => setVenue(event.target.value)} /><input className={input} type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} /><fieldset className="rounded-lg border border-zinc-200 p-3 text-sm"><legend className="px-1 font-medium">Eventos vinculados</legend>{events.map((item) => <label key={item.id} className="mt-2 flex items-center gap-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.name}<span className="text-zinc-500">({item.event_type})</span></label>)}</fieldset></div><button disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus className="h-4 w-4" />{busy ? 'Creando…' : 'Crear programa'}</button></form><section className="mt-8 grid gap-3">{programs.map((program) => <article key={program.id} className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">{program.name}</h2><p className="mt-1 text-sm text-zinc-600">{program.venue_name ?? 'Sin sede'} · {program.status}</p><div className="mt-4 flex flex-wrap gap-4 text-sm"><Link className="inline-flex items-center gap-1 font-medium text-emerald-700" to={`/admin/programas/${program.id}/accesos`}><Settings2 className="h-4 w-4" />Configurar accesos</Link><Link className="font-medium text-emerald-700" to={`/p/${program.id}/registro`} target="_blank">Abrir registro público</Link><button type="button" onClick={() => void navigator.clipboard.writeText(`${location.origin}/p/${program.id}/registro`)} className="inline-flex items-center gap-1 text-zinc-600"><Copy className="h-3.5 w-3.5" />Copiar enlace</button></div></article>)}</section></main></div>
}
