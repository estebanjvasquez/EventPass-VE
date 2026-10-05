import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ExternalLink, PackagePlus, Ticket, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Event = { id: string; name: string }
type Session = { id: string; name: string; event_id: string; capacity: number | null }
type Zone = { id: string; name: string; event_id: string }
type Entitlement = { event_id: string | null; session_id: string | null; zone_id: string | null; events?: { name: string } | null; event_sessions?: { name: string } | null; event_zones?: { name: string } | null }
type RegistrationItem = { id: string; name: string; description: string | null; item_type: string; selection_type: 'required' | 'optional'; price: number; currency: string; capacity: number | null; active: boolean; program_registration_entitlements: Entitlement[] }
type Order = { id: string; participation_id: string; status: string; total: number; currency: string; comprobante_path: string | null; created_at: string; people: { first_name: string; last_name: string | null; email: string | null } | null; program_registration_order_items: { name_snapshot: string }[] }

const field = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
const money = (amount: number, currency: string) => amount === 0 ? 'Gratis' : new Intl.NumberFormat('es-VE', { style: 'currency', currency }).format(amount)

export default function ProgramaAccesosAdmin() {
  const { programId } = useParams()
  const [title, setTitle] = useState('')
  const [events, setEvents] = useState<Event[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [items, setItems] = useState<RegistrationItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectionType, setSelectionType] = useState<'required' | 'optional'>('optional')
  const [price, setPrice] = useState('0')
  const [currency, setCurrency] = useState('USD')
  const [capacity, setCapacity] = useState('')
  const [eventIds, setEventIds] = useState<string[]>([])
  const [sessionIds, setSessionIds] = useState<string[]>([])
  const [zoneIds, setZoneIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!programId) return
    setLoading(true); setError(null)
    const programResult = await supabase.from('event_programs').select('name').eq('id', programId).maybeSingle()
    if (programResult.error || !programResult.data) { setError(programResult.error?.message ?? 'Programa no encontrado.'); setLoading(false); return }
    setTitle(programResult.data.name)
    const links = await supabase.from('program_events').select('events(id,name)').eq('program_id', programId)
    const linked = (links.data ?? []).flatMap(row => row.events ? [row.events] : []) as unknown as Event[]
    const eventList = linked.sort((a, b) => a.name.localeCompare(b.name))
    setEvents(eventList)
    const ids = eventList.map(event => event.id)
    if (!ids.length) { setSessions([]); setZones([]); setItems([]); setOrders([]); setLoading(false); return }
    const [sessionResult, zoneResult, itemResult, orderResult] = await Promise.all([
      supabase.from('event_sessions').select('id,name,event_id,capacity').in('event_id', ids).order('starts_at'),
      supabase.from('event_zones').select('id,name,event_id').in('event_id', ids).order('name'),
      supabase.from('program_registration_items').select('id,name,description,item_type,selection_type,price,currency,capacity,active,program_registration_entitlements(event_id,session_id,zone_id,events(name),event_sessions(name),event_zones(name))').eq('program_id', programId).order('sort_order').order('created_at'),
      supabase.from('program_registration_orders').select('id,participation_id,status,total,currency,comprobante_path,created_at,people(first_name,last_name,email),program_registration_order_items(name_snapshot)').eq('program_id', programId).order('created_at', { ascending: false }).limit(100),
    ])
    const problem = sessionResult.error ?? zoneResult.error ?? itemResult.error ?? orderResult.error
    if (problem) setError(problem.message)
    setSessions((sessionResult.data ?? []) as Session[])
    setZones((zoneResult.data ?? []) as Zone[])
    setItems((itemResult.data ?? []) as unknown as RegistrationItem[])
    setOrders((orderResult.data ?? []) as unknown as Order[])
    setLoading(false)
  }, [programId])

  useEffect(() => { void load() }, [load])

  const selectedCount = eventIds.length + sessionIds.length + zoneIds.length
  const toggle = (id: string, current: string[], setter: (value: string[]) => void) => setter(current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const eventName = (id: string) => events.find(event => event.id === id)?.name ?? 'Evento'

  async function createItem(event: FormEvent) {
    event.preventDefault()
    if (!programId || !name.trim() || !selectedCount) { setError('Indica el nombre y al menos un derecho de acceso.'); return }
    setBusy(true); setError(null); setMessage(null)
    const itemType = selectedCount > 1 ? 'bundle' : sessionIds.length ? 'session' : zoneIds.length ? 'zone' : 'event'
    const inserted = await supabase.from('program_registration_items').insert({ program_id: programId, name: name.trim(), description: description.trim() || null, item_type: itemType, selection_type: selectionType, price: Number(price || 0), currency: currency.trim().toUpperCase() || 'USD', capacity: capacity === '' ? null : Number(capacity), is_public: true, active: true }).select('id').single()
    if (inserted.error || !inserted.data) { setBusy(false); setError(inserted.error?.message ?? 'No se pudo crear la oferta.'); return }
    const entitlements = [...eventIds.map(event_id => ({ item_id: inserted.data.id, event_id })), ...sessionIds.map(session_id => ({ item_id: inserted.data.id, session_id })), ...zoneIds.map(zone_id => ({ item_id: inserted.data.id, zone_id }))]
    const entitlementResult = await supabase.from('program_registration_entitlements').insert(entitlements)
    if (entitlementResult.error) { await supabase.from('program_registration_items').delete().eq('id', inserted.data.id); setError(entitlementResult.error.message) }
    else { setName(''); setDescription(''); setPrice('0'); setCapacity(''); setEventIds([]); setSessionIds([]); setZoneIds([]); setMessage('Acceso creado.'); await load() }
    setBusy(false)
  }

  async function updateCapacity(item: RegistrationItem, value: string) {
    const next = value === '' ? null : Number(value)
    if (next !== null && (!Number.isInteger(next) || next < 0)) { setError('El cupo debe ser un entero mayor o igual a cero.'); return }
    setBusy(true); setError(null)
    const result = await supabase.from('program_registration_items').update({ capacity: next }).eq('id', item.id).select('id').single()
    setBusy(false)
    if (result.error) setError(result.error.message); else { setMessage('Cupo actualizado.'); await load() }
  }

  async function toggleItem(item: RegistrationItem) {
    setBusy(true); setError(null)
    const result = await supabase.from('program_registration_items').update({ active: !item.active, is_public: !item.active }).eq('id', item.id).select('id').single()
    setBusy(false)
    if (result.error) setError(result.error.message); else await load()
  }

  async function review(order: Order, approve: boolean) {
    const reason = approve ? null : window.prompt('Motivo del rechazo:', 'Comprobante no válido')
    if (!approve && reason === null) return
    setBusy(true); setError(null)
    const result = await supabase.rpc('review_program_order', { p_order_id: order.id, p_approve: approve, p_reason: reason })
    setBusy(false)
    if (result.error) setError(result.error.message); else {
      if (approve && import.meta.env.VITE_API_URL) void fetch(`${import.meta.env.VITE_API_URL}/api/program-participations/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participation_id: order.participation_id }) }).catch(() => undefined)
      setMessage(approve ? 'Pago confirmado y credencial activada.' : 'Pago rechazado.'); await load()
    }
  }

  async function openProof(order: Order) {
    if (!order.comprobante_path) return
    const result = await supabase.storage.from('comprobantes').createSignedUrl(order.comprobante_path, 60)
    if (result.error) setError(result.error.message); else window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const pending = useMemo(() => orders.filter(order => order.status === 'payment_submitted'), [orders])

  if (loading) return <div className="grid min-h-[70dvh] place-items-center"><div className="h-40 w-full max-w-5xl animate-pulse rounded-2xl bg-zinc-100" /></div>
  return <div className="min-h-[100dvh] bg-zinc-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4"><Link to="/admin/programas" className="rounded-lg p-2 text-zinc-600"><ArrowLeft className="h-4 w-4" /></Link><Ticket className="h-5 w-5 text-emerald-700" /><span className="font-semibold">Centro de registro · {title}</span><Link className="ml-auto text-sm font-semibold text-emerald-700" to={`/admin/programas/${programId}/configuracion`}>Configuración</Link></div></header>
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-3xl font-bold">Pases, paquetes y actividades</h1>
      <p className="mt-2 max-w-3xl text-zinc-600">Cada oferta puede incluir uno o varios eventos, talleres o zonas. El precio puede ser cero; el cupo se controla de la misma forma y puede ampliarse posteriormente.</p>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      <form onSubmit={createItem} className="mt-6 rounded-2xl border bg-white p-5">
        <h2 className="flex items-center gap-2 font-bold"><PackagePlus className="h-5 w-5 text-emerald-700" />Nueva oferta</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium">Nombre<input required className={`${field} mt-1`} value={name} onChange={event => setName(event.target.value)} placeholder="Pase Expo + Workshop A" /></label><label className="text-sm font-medium">Tipo<select className={`${field} mt-1`} value={selectionType} onChange={event => setSelectionType(event.target.value as 'required' | 'optional')}><option value="optional">Opcional</option><option value="required">Incluido obligatoriamente</option></select></label><label className="text-sm font-medium">Precio<input className={`${field} mt-1`} type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label><label className="text-sm font-medium">Moneda<input className={`${field} mt-1`} maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} /></label><label className="text-sm font-medium">Cupo<input className={`${field} mt-1`} type="number" min="0" placeholder="Sin límite" value={capacity} onChange={event => setCapacity(event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Descripción<input className={`${field} mt-1`} value={description} onChange={event => setDescription(event.target.value)} /></label></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3"><ChoiceGroup title="Eventos" items={events} selected={eventIds} toggle={id => toggle(id, eventIds, setEventIds)} /><ChoiceGroup title="Sesiones y talleres" items={sessions.map(session => ({ id: session.id, name: `${session.name} · ${eventName(session.event_id)}${session.capacity == null ? '' : ` · cupo ${session.capacity}`}` }))} selected={sessionIds} toggle={id => toggle(id, sessionIds, setSessionIds)} /><ChoiceGroup title="Zonas" items={zones.map(zone => ({ id: zone.id, name: `${zone.name} · ${eventName(zone.event_id)}` }))} selected={zoneIds} toggle={id => toggle(id, zoneIds, setZoneIds)} /></div>
        <button disabled={busy || !selectedCount} className="mt-5 rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Crear oferta'}</button>
      </form>
      <section className="mt-8"><h2 className="text-xl font-bold">Ofertas configuradas ({items.length})</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{items.map(item => <article key={item.id} className={`rounded-2xl border bg-white p-5 ${item.active ? '' : 'opacity-60'}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-sm text-zinc-600">{money(Number(item.price), item.currency)} · {item.selection_type === 'required' ? 'Incluido' : 'Opcional'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>{item.active ? 'Activo' : 'Oculto'}</span></div>{item.description && <p className="mt-3 text-sm text-zinc-600">{item.description}</p>}<ul className="mt-3 flex flex-wrap gap-2 text-xs">{item.program_registration_entitlements.map((entitlement, index) => <li key={`${item.id}-${index}`} className="rounded-full bg-zinc-100 px-2.5 py-1">{entitlement.events?.name ?? entitlement.event_sessions?.name ?? entitlement.event_zones?.name ?? 'Acceso'}</li>)}</ul><div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-xs font-medium">Cupo<input className={`${field} mt-1 w-28`} type="number" min="0" defaultValue={item.capacity ?? ''} placeholder="Sin límite" onBlur={event => { const current = item.capacity == null ? '' : String(item.capacity); if (event.target.value !== current) void updateCapacity(item, event.target.value) }} /></label><button type="button" disabled={busy} onClick={() => void toggleItem(item)} className="rounded-lg border px-3 py-2 text-sm font-semibold">{item.active ? 'Ocultar' : 'Activar'}</button></div></article>)}{!items.length && <p className="text-sm text-zinc-500">Configura los componentes del programa o crea una oferta personalizada.</p>}</div></section>
      <section className="mt-8 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Pagos por revisar</h2><p className="text-sm text-zinc-600">{pending.length} comprobantes pendientes.</p><div className="mt-4 space-y-3">{pending.map(order => <article key={order.id} className="flex flex-col gap-3 rounded-xl bg-amber-50 p-4 sm:flex-row sm:items-center"><div className="flex-1"><strong>{order.people?.first_name} {order.people?.last_name}</strong><p className="text-sm text-zinc-600">{order.people?.email} · {order.program_registration_order_items.map(item => item.name_snapshot).join(', ')}</p><p className="mt-1 font-semibold">{money(Number(order.total), order.currency)}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void openProof(order)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><ExternalLink className="h-4 w-4" />Comprobante</button><button type="button" disabled={busy} onClick={() => void review(order, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><Check className="h-4 w-4" />Confirmar</button><button type="button" disabled={busy} onClick={() => void review(order, false)} className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white"><X className="h-4 w-4" />Rechazar</button></div></article>)}{!pending.length && <p className="text-sm text-zinc-500">No hay comprobantes pendientes.</p>}</div></section>
      <section className="mt-8"><h2 className="text-xl font-bold">Pedidos recientes</h2><div className="mt-3 overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-zinc-50"><tr><th className="p-3">Participante</th><th className="p-3">Accesos</th><th className="p-3">Total</th><th className="p-3">Estado</th><th className="p-3">Fecha</th></tr></thead><tbody>{orders.map(order => <tr key={order.id} className="border-t"><td className="p-3">{order.people?.first_name} {order.people?.last_name}<small className="block text-zinc-500">{order.people?.email}</small></td><td className="p-3">{order.program_registration_order_items.map(item => item.name_snapshot).join(', ')}</td><td className="p-3">{money(Number(order.total), order.currency)}</td><td className="p-3">{order.status}</td><td className="p-3">{new Date(order.created_at).toLocaleString('es-VE')}</td></tr>)}</tbody></table></div></section>
    </main>
  </div>
}

function ChoiceGroup({ title, items, selected, toggle }: { title: string; items: { id: string; name: string }[]; selected: string[]; toggle: (id: string) => void }) {
  return <fieldset className="rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">{title}</legend><div className="mt-1 max-h-52 space-y-2 overflow-auto">{items.map(item => <label key={item.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><span>{item.name}</span></label>)}{!items.length && <p className="text-xs text-zinc-500">Sin elementos disponibles.</p>}</div></fieldset>
}
