import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Copy, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolveActiveOrg } from '../../lib/activeOrg'

type Event = { id: string; name: string; event_type: string; status: string }
type Program = { id: string; name: string; venue_name: string | null; starts_at: string | null; status: string }
const input = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500'

export default function ProgramasAdmin() {
  const [orgId, setOrgId] = useState<string | null>(null), [events, setEvents] = useState<Event[]>([]), [programs, setPrograms] = useState<Program[]>([])
  const [name, setName] = useState(''), [venue, setVenue] = useState(''), [date, setDate] = useState('2026-10-15T09:00'), [selected, setSelected] = useState<string[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const load = useCallback(async (org: string) => {
    const [p, e] = await Promise.all([supabase.from('event_programs').select('id,name,venue_name,starts_at,status').eq('organization_id', org).order('created_at', { ascending: false }), supabase.from('events').select('id,name,event_type,status').eq('organization_id', org).neq('status','archived')])
    if (p.error || e.error) setError(p.error?.message ?? e.error?.message ?? 'No se pudo cargar')
    setPrograms((p.data ?? []) as Program[]); setEvents((e.data ?? []) as Event[])
  }, [])
  useEffect(() => { resolveActiveOrg().then((m) => { if (m) { setOrgId(m.organization_id); void load(m.organization_id) } }) }, [load])
  async function create(e: React.FormEvent) {
    e.preventDefault(); if (!orgId || !name.trim()) return
    setBusy(true); setError(null)
    const { data, error } = await supabase.from('event_programs').insert({ organization_id: orgId, name: name.trim(), venue_name: venue.trim() || null, starts_at: date ? new Date(date).toISOString() : null, status: 'draft', registration_config: { public_profiles: ['attendee','guest','vip','speaker','exhibitor'] } }).select('id').single()
    if (error || !data) setError(error?.message ?? 'No se pudo crear')
    else if (selected.length) { const { error: linkError } = await supabase.from('program_events').insert(selected.map((event_id) => ({ program_id: data.id, event_id, component_type: events.find((x) => x.id === event_id)?.event_type === 'forum' ? 'forum' : 'exhibition' }))); if (linkError) setError(linkError.message) }
    setBusy(false); setName(''); setSelected([]); await load(orgId)
  }
  return <div className="min-h-[100dvh] bg-zinc-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-4"><Link to="/admin/eventos" className="text-zinc-600"><ArrowLeft className="h-4 w-4" /></Link><h1 className="font-semibold">Programas de evento</h1></div></header><main className="mx-auto max-w-4xl px-5 py-8"><p className="text-sm text-zinc-600">Vincula un foro y una exposición para compartir participantes, pases y operación onsite.</p><form onSubmit={create} className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Nuevo programa</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><input required className={input} placeholder="Foro + Expo 2026" value={name} onChange={(e) => setName(e.target.value)} /><input className={input} placeholder="Sede" value={venue} onChange={(e) => setVenue(e.target.value)} /><input className={input} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /><div className="rounded-lg border border-zinc-200 p-3 text-sm"><p className="font-medium">Eventos vinculados</p>{events.map((ev) => <label key={ev.id} className="mt-2 flex gap-2"><input type="checkbox" checked={selected.includes(ev.id)} onChange={() => setSelected((v) => v.includes(ev.id) ? v.filter((id) => id !== ev.id) : [...v, ev.id])} />{ev.name} <span className="text-zinc-400">({ev.event_type})</span></label>)}</div></div>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{busy ? 'Creando…' : 'Crear programa'}</button></form><section className="mt-8 space-y-3">{programs.map((p) => <article key={p.id} className="rounded-xl border bg-white p-4"><p className="font-semibold">{p.name}</p><p className="mt-1 text-sm text-zinc-500">{p.venue_name ?? 'Sin sede'} · {p.status}</p><div className="mt-3 flex gap-3 text-sm"><Link className="text-emerald-700" to={`/p/${p.id}/registro`} target="_blank">Abrir registro público</Link><button type="button" onClick={() => navigator.clipboard.writeText(`${location.origin}/p/${p.id}/registro`)} className="inline-flex items-center gap-1 text-zinc-600"><Copy className="h-3.5 w-3.5" />Copiar enlace</button></div></article>)}</section></main></div>
}
