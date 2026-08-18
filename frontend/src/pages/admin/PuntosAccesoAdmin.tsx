import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, ScanLine } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolveActiveOrg } from '../../lib/activeOrg'

type Row = { id: string; name: string }

export default function PuntosAccesoAdmin() {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [events, setEvents] = useState<Row[]>([])
  const [zones, setZones] = useState<Row[]>([])
  const [points, setPoints] = useState<Row[]>([])
  const [eventId, setEventId] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load(organizationId: string) {
    const [eventResult, zoneResult, pointResult] = await Promise.all([
      supabase.from('events').select('id,name').eq('organization_id', organizationId).neq('status', 'archived').order('name'),
      supabase.from('event_zones').select('id,name').eq('organization_id', organizationId).order('name'),
      supabase.from('access_points').select('id,name').eq('organization_id', organizationId).order('name'),
    ])
    setEvents((eventResult.data ?? []) as Row[]); setZones((zoneResult.data ?? []) as Row[]); setPoints((pointResult.data ?? []) as Row[])
    if (eventResult.data?.[0]) setEventId((current) => current || eventResult.data![0].id)
    if (eventResult.error || zoneResult.error || pointResult.error) setError(eventResult.error?.message ?? zoneResult.error?.message ?? pointResult.error?.message ?? 'No se pudo cargar.')
  }

  useEffect(() => { void resolveActiveOrg().then((membership) => { if (membership) { setOrgId(membership.organization_id); void load(membership.organization_id) } }) }, [])
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!orgId || !eventId || !name.trim()) return
    const { error: insertError } = await supabase.from('access_points').insert({ organization_id: orgId, event_id: eventId, zone_id: zoneId || null, name: name.trim() })
    if (insertError) setError(insertError.message); else { setName(''); await load(orgId) }
  }

  return <div className="min-h-[100dvh] bg-zinc-50"><header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4"><Link to="/admin" className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100"><ArrowLeft className="h-4 w-4" /></Link><ScanLine className="h-5 w-5 text-emerald-700" /><span className="font-semibold">Puntos de acceso</span></div></header><main className="mx-auto max-w-3xl px-5 py-8"><h1 className="text-2xl font-bold">Accesos onsite</h1><p className="mt-1 text-sm text-zinc-600">Crea cada puerta o zona que el personal podrá seleccionar antes de escanear.</p>{error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<form onSubmit={create} className="mt-6 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5"><input value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Ej.: Entrada principal" /><select value={eventId} onChange={(event) => setEventId(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"><option value="">Acceso general</option>{zones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Crear punto</button></form><ul className="mt-6 space-y-2">{points.map((point) => <li key={point.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium">{point.name}</li>)}</ul></main></div>
}
