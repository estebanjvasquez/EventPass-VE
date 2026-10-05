import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Ticket } from 'lucide-react'
import ParticipantAccessLink from '../components/ParticipantAccessLink'
import PurchaseSummary from '../components/PurchaseSummary'
import { registrationCampaignUrl, trackVisit } from '../lib/campaignAttribution'
import { supabase } from '../lib/supabase'
import { useTenant } from '../lib/useTenant'

type CatalogEvent = { id: string; name: string; event_type: string; policy: string; price: number; currency: string; capacity: number | null }
type Entitlement = { label: string; event_id: string | null; session_id: string | null; session_event_id: string | null; session_type: string | null; starts_at: string | null; ends_at: string | null; stage_name: string | null; allow_overlap: boolean }
type CatalogItem = { id: string; parent_item_id: string | null; source_event_id: string | null; name: string; description: string | null; item_type: string; selection_type: 'required' | 'optional'; price: number; currency: string; capacity: number | null; reserved: number; sales_start: string | null; sales_end: string | null; entitlements: Entitlement[] }
type Catalog = { program: { id: string; name: string; description: string | null; venue_name: string | null; starts_at: string | null; ends_at: string | null; mode: 'separate' | 'unified' | 'modular' | 'hybrid'; timezone: string; brand_name?: string; primary_color?: string }; events: CatalogEvent[]; items: CatalogItem[] }
type Result = { participation_id: string; credential_token: string; participation_status: string; order_id: string; order_token: string; order_status: string; total: number; currency: string }

const PROFILE_LABEL: Record<string, string> = { attendee: 'Asistente', guest: 'Invitado', vip: 'Invitado VIP', speaker: 'Ponente', exhibitor: 'Expositor' }
const money = (amount: number, currency: string) => amount === 0 ? 'Gratis' : new Intl.NumberFormat('es-VE', { style: 'currency', currency }).format(amount)

export default function RegistroPrograma() {
  const { programId } = useParams()
  const { tenant, loading: tenantLoading } = useTenant()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', cedula: '', company: '', job_title: '', city: '', country: 'Venezuela', participation_type: 'attendee' })

  useEffect(() => {
    if (!programId || tenantLoading) return
    let active = true
    setLoading(true); setError(null)
    void supabase.rpc('get_public_program_registration_catalog', { p_program_id: programId }).then(response => {
      if (!active) return
      if (response.error || !response.data) setError(response.error?.message ?? 'Este programa no está disponible.')
      else { const value = response.data as Catalog; setCatalog(value); const parents=value.items.filter(item=>!item.parent_item_id&&item.selection_type==='required').map(item=>item.id); const children=value.items.filter(item=>item.parent_item_id&&parents.includes(item.parent_item_id)&&item.selection_type==='required').map(item=>item.id); setSelected([...parents,...children]) }
      setLoading(false)
    })
    return () => { active = false }
  }, [programId, tenant, tenantLoading])

  const topItems = useMemo(() => catalog?.items.filter(item => !item.parent_item_id) ?? [], [catalog])
  const required = useMemo(() => topItems.filter(item => item.selection_type === 'required'), [topItems])
  const chosen = useMemo(() => catalog?.items.filter(item => selected.includes(item.id)) ?? [], [catalog, selected])
  const total = chosen.reduce((sum, item) => sum + Number(item.price), 0)
  const currency = chosen.find(item => Number(item.price) > 0)?.currency ?? chosen[0]?.currency ?? 'USD'
  const selectionComplete = topItems.filter(item=>selected.includes(item.id)).every(parent=>{const children=catalog?.items.filter(item=>item.parent_item_id===parent.id)??[];return children.length===0||children.some(child=>selected.includes(child.id))})
  const trackingEventId = catalog?.events[0]?.id
  useEffect(() => { if (programId && trackingEventId) void trackVisit(trackingEventId, programId, 'form') }, [programId, trackingEventId])

  function change(key: keyof typeof form, value: string) { setForm(current => ({ ...current, [key]: value })) }
  function toggle(item: CatalogItem) {
    if (item.selection_type === 'required' || (item.capacity !== null && item.reserved >= item.capacity)) return
    const children=catalog?.items.filter(child=>child.parent_item_id===item.id)??[]
    if (!item.parent_item_id && !selected.includes(item.id) && children.some(child=>child.selection_type==='required'&&child.capacity!==null&&child.reserved>=child.capacity)) return
    if (!item.parent_item_id) {
      setSelected(current=>current.includes(item.id)?current.filter(id=>id!==item.id&&!children.some(child=>child.id===id)):[...current,item.id,...children.filter(child=>child.selection_type==='required').map(child=>child.id)])
      return
    }
    if (!selected.includes(item.parent_item_id)) return
    const schedule=item.entitlements.find(value=>value.session_id)
    const conflict=catalog?.items.find(other=>selected.includes(other.id)&&other.id!==item.id&&other.item_type==='session'&&schedule?.starts_at&&schedule.ends_at&&other.entitlements.some(value=>value.session_id&&value.starts_at&&value.ends_at&&!schedule.allow_overlap&&!value.allow_overlap&&new Date(schedule.starts_at!)<new Date(value.ends_at!)&&new Date(value.starts_at!)<new Date(schedule.ends_at!)))
    if (!selected.includes(item.id)&&conflict){setError(`“${item.name}” se cruza con “${conflict.name}”. Elige solo una.`);return}
    setError(null); setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!programId || !form.first_name.trim() || !form.email.trim() || !chosen.length) return
    if (!selectionComplete) { setError('Selecciona al menos una sesión de cada taller elegido.'); return }
    setSaving(true); setError(null)
    const visitId = trackingEventId ? await trackVisit(trackingEventId, programId, 'form') : null
    const response = await supabase.rpc('register_program_selection', {
      p_program_id: programId, p_item_ids: selected, p_first_name: form.first_name, p_last_name: form.last_name, p_email: form.email, p_phone: form.phone,
      p_cedula: form.cedula || null, p_company: form.company || null, p_job_title: form.job_title || null, p_city: form.city || null, p_country: form.country || null,
      p_participation_type: form.participation_type, p_profile_data: {}, p_visit_id: visitId,
    })
    setSaving(false)
    if (response.error) { setError(response.error.message); return }
    const value = (Array.isArray(response.data) ? response.data[0] : response.data) as Result | undefined
    if (!value) { setError('No pudimos completar el registro.'); return }
    setResult(value)
    const apiUrl = import.meta.env.VITE_API_URL
    if (apiUrl) void fetch(`${apiUrl}/api/program-participations/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participation_id: value.participation_id }) }).catch(() => undefined)
  }

  if (tenantLoading || loading) return <div className="grid min-h-[100dvh] place-items-center text-sm text-zinc-500">Cargando…</div>
  if (error && !catalog) return <div className="grid min-h-[100dvh] place-items-center px-5 text-center text-sm text-red-700">{error}</div>
  if (!catalog) return null
  const accent = catalog.program.primary_color ?? '#047857'
  const programName = catalog.program.brand_name ?? catalog.program.name

  return <main className="min-h-[100dvh] bg-zinc-50 px-5 py-10">
    <section className="mx-auto max-w-4xl rounded-3xl border bg-white p-6 shadow-sm sm:p-10">
      <p className="text-sm font-semibold" style={{ color: accent }}>{programName} · registro</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{catalog.program.name}</h1>
      {catalog.program.description && <p className="mt-3 text-zinc-600">{catalog.program.description}</p>}
      <p className="mt-3 text-sm text-zinc-500">{catalog.program.venue_name ?? 'Sede por confirmar'}{catalog.program.starts_at ? ` · ${new Date(catalog.program.starts_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</p>
      <ParticipantAccessLink token={result?.credential_token ?? null} programId={catalog.program.id} />

      {result ? <Success result={result} accent={accent} /> : catalog.program.mode === 'separate' ? <SeparateRegistration events={catalog.events} programId={programId!} /> : !catalog.items.length ? <Notice title="Registro en configuración" body="El organizador todavía no ha publicado accesos para este programa." /> : <form className="mt-8" onSubmit={submit}>
        <section><h2 className="text-xl font-bold">1. Elige tus accesos</h2><p className="mt-1 text-sm text-zinc-600">Selecciona los eventos y, dentro de cada taller, reserva las sesiones que quieres cursar. Cada sesión conserva su propio precio y cupo.</p><div className="mt-4 space-y-4">{topItems.map(item => <ProgramAccess key={item.id} item={item} childrenItems={catalog.items.filter(child=>child.parent_item_id===item.id)} selected={selected} onToggle={toggle}/>)}</div></section>

        <section className="mt-8"><h2 className="text-xl font-bold">2. Datos del participante</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Perfil"><select value={form.participation_type} onChange={event => change('participation_type', event.target.value)}>{Object.entries(PROFILE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Nombre"><input required value={form.first_name} onChange={event => change('first_name', event.target.value)} /></Field><Field label="Apellido"><input value={form.last_name} onChange={event => change('last_name', event.target.value)} /></Field><Field label="Correo"><input required type="email" value={form.email} onChange={event => change('email', event.target.value)} /></Field><Field label="Teléfono"><input required value={form.phone} onChange={event => change('phone', event.target.value)} /></Field><Field label="Cédula / documento"><input value={form.cedula} onChange={event => change('cedula', event.target.value)} /></Field><Field label="Empresa / organización"><input value={form.company} onChange={event => change('company', event.target.value)} /></Field><Field label="Cargo"><input value={form.job_title} onChange={event => change('job_title', event.target.value)} /></Field><Field label="Ciudad"><input value={form.city} onChange={event => change('city', event.target.value)} /></Field><Field label="País"><input value={form.country} onChange={event => change('country', event.target.value)} /></Field></div></section>

        <section className="mt-8"><h2 className="text-xl font-bold">3. Revisa y confirma</h2><div className="mt-4"><PurchaseSummary snapshot={{ event_name: catalog.program.name, starts_at: catalog.program.starts_at, venue: catalog.program.venue_name, timezone: catalog.program.timezone, amount: total, currency, benefits: chosen.map(item => item.name) }} /></div>{error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={saving || selected.length < required.length || !chosen.length || !selectionComplete} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50" style={{ backgroundColor: accent }}><Ticket className="h-4 w-4" />{saving ? 'Procesando…' : total > 0 ? `Continuar · ${money(total, currency)}` : 'Confirmar registro gratuito'}</button>{!selectionComplete&&<p className="mt-2 text-sm text-amber-700">Selecciona al menos una sesión dentro de cada taller elegido.</p>}</section>
      </form>}
    </section>
  </main>
}

function ProgramAccess({item,childrenItems,selected,onToggle}:{item:CatalogItem;childrenItems:CatalogItem[];selected:string[];onToggle:(item:CatalogItem)=>void}) {
  const checked=selected.includes(item.id)
  const requiredChildSoldOut=childrenItems.some(child=>child.selection_type==='required'&&child.capacity!==null&&child.reserved>=child.capacity)
  const soldOut=(item.capacity!==null&&item.reserved>=item.capacity)||requiredChildSoldOut
  return <article className={`rounded-2xl border ${checked?'border-emerald-600 bg-emerald-50/60':'border-zinc-200'} ${soldOut?'opacity-60':''}`}>
    <label className="flex cursor-pointer items-start gap-3 p-4"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-700" checked={checked} disabled={item.selection_type==='required'||soldOut} onChange={()=>onToggle(item)}/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><strong>{item.name}</strong><span className="whitespace-nowrap font-bold text-emerald-800">{money(Number(item.price),item.currency)}</span></div>{item.description&&<p className="mt-1 text-sm text-zinc-600">{item.description}</p>}<p className="mt-2 text-xs text-zinc-500">{item.entitlements.map(value=>value.label).join(' · ')}</p><p className="mt-2 text-xs font-semibold">{item.selection_type==='required'?'Incluido obligatoriamente':soldOut?'Agotado':item.capacity==null?'Sin límite':`${Math.max(item.capacity-item.reserved,0)} plazas disponibles`}</p></div></label>
    {childrenItems.length>0&&<div className="border-t border-emerald-200 bg-white/80 p-4"><h3 className="font-semibold">Sesiones de {item.name}</h3><p className="mt-1 text-xs text-zinc-600">{checked?'Elige al menos una. Los cupos y precios se calculan por sesión.':'Selecciona primero el taller para habilitar sus sesiones.'}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{childrenItems.map(child=>{const childChecked=selected.includes(child.id);const childSoldOut=child.capacity!==null&&child.reserved>=child.capacity;const schedule=child.entitlements.find(value=>value.session_id);return <label key={child.id} className={`rounded-xl border p-3 ${childChecked?'border-emerald-500 bg-emerald-50':'border-zinc-200'} ${!checked||childSoldOut?'opacity-55':'cursor-pointer'}`}><div className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={childChecked} disabled={!checked||child.selection_type==='required'||childSoldOut} onChange={()=>onToggle(child)}/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><strong className="text-sm">{child.name}</strong><span className="text-sm font-bold text-emerald-800">{money(Number(child.price),child.currency)}</span></div>{schedule?.starts_at&&<p className="mt-1 text-xs text-zinc-600">{new Date(schedule.starts_at).toLocaleString('es-VE',{dateStyle:'medium',timeStyle:'short'})}{schedule.stage_name?` · ${schedule.stage_name}`:''}</p>}<p className="mt-2 text-xs font-semibold">{child.selection_type==='required'?'Incluida':childSoldOut?'Agotada':child.capacity==null?'Cupo disponible':`${Math.max(child.capacity-child.reserved,0)} plazas`}</p></div></div></label>})}</div></div>}
  </article>
}

function Success({ result, accent }: { result: Result; accent: string }) {
  const paid = Number(result.total) > 0
  return <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-900"><CheckCircle2 className="mx-auto h-10 w-10" /><h2 className="mt-3 text-xl font-bold">{paid ? 'Reserva creada' : 'Registro confirmado'}</h2><p className="mt-2 text-sm">{paid ? 'Tus plazas están reservadas. Realiza el pago y carga el comprobante antes del vencimiento.' : 'Tu credencial única ya está disponible para todos los accesos seleccionados.'}</p><div className="mt-5 flex flex-wrap justify-center gap-3">{paid ? <Link to={`/programa/comprobante/${result.order_token}`} className="rounded-lg px-4 py-2.5 font-semibold text-white" style={{ backgroundColor: accent }}>Cargar comprobante</Link> : <Link to={`/credencial/${result.credential_token}`} className="rounded-lg px-4 py-2.5 font-semibold text-white" style={{ backgroundColor: accent }}>Ver mi credencial</Link>}</div></div>
}

function SeparateRegistration({ events, programId }: { events: CatalogEvent[]; programId: string }) {
  const available = events.filter(event => event.policy !== 'invite_only')
  return <section className="mt-8 rounded-2xl border bg-zinc-50 p-5"><h2 className="text-xl font-bold">Registros independientes</h2><p className="mt-2 text-zinc-600">El organizador configuró cada componente con su propio registro.</p><div className="mt-4 grid gap-3">{available.map(event => <Link key={event.id} className="flex items-center justify-between rounded-xl border bg-white p-4 font-semibold text-emerald-700" to={registrationCampaignUrl(`/e/${event.id}`, event.id, programId)}><span>{event.name}</span><span>Registrarme →</span></Link>)}{!available.length && <p className="text-sm text-zinc-500">No hay registros públicos disponibles.</p>}</div></section>
}
function Notice({ title, body }: { title: string; body: string }) { return <section className="mt-8 rounded-xl border bg-zinc-50 p-5"><h2 className="text-xl font-bold">{title}</h2><p className="mt-2 text-zinc-600">{body}</p></section> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800">{label}<span className="[&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-zinc-300 [&>input]:px-3 [&>input]:py-2.5 [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-zinc-300 [&>select]:bg-white [&>select]:px-3 [&>select]:py-2.5">{children}</span></label> }
