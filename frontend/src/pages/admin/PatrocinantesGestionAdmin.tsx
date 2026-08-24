import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Handshake, Pencil, Plus, Receipt, Save, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolveActiveOrg, type ActiveOrg } from '../../lib/activeOrg'
import ImpersonationBanner from '../../components/ImpersonationBanner'

type Org = ActiveOrg
type Option = { id: string; name: string }
type PackageRow = { id: string; name: string; description: string | null; price: number | null; currency: string; inventory: number | null; benefits: unknown; is_active: boolean }
type SponsorRow = { id: string; event_id: string; company_id: string; package_id: string | null; status: string; agreed_amount: number | null; currency: string; payment_status: string; payment_notes: string | null; additional_amount: number; agreement_details: string | null; advertising_contribution: string | null; print_requirements: string | null; fulfillment_notes: string | null }
type Payment = { id: string; amount: number; currency: string; payment_date: string; reference: string | null; status: string; notes: string | null }
type Deliverable = { id: string; name: string; deliverable_type: string; status: string; details: string | null; quantity: number | null; requires_print: boolean; asset_url: string | null; due_at: string | null }

const field = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500'
const statuses = ['prospect', 'proposed', 'confirmed', 'active', 'fulfilled', 'cancelled']
const paymentStatuses = ['unpaid', 'partial', 'paid', 'overdue', 'waived']
const benefitsValue = (value: unknown) => Array.isArray(value) ? value.map(String).join('\n') : typeof value === 'string' ? value : ''

export default function PatrocinantesGestionAdmin() {
  const [org, setOrg] = useState<Org | null>(null)
  const [events, setEvents] = useState<Option[]>([])
  const [companies, setCompanies] = useState<Option[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [sponsors, setSponsors] = useState<SponsorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'sponsors' | 'packages'>('sponsors')
  const [sponsorDraft, setSponsorDraft] = useState<SponsorRow | null>(null)
  const [packageDraft, setPackageDraft] = useState<PackageRow | null>(null)
  const [newCompany, setNewCompany] = useState('')
  const [payments, setPayments] = useState<Payment[]>([])
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])

  const load = useCallback(async () => {
    const membership = await resolveActiveOrg()
    setOrg(membership)
    if (!membership) { setLoading(false); return }
    const orgId = membership.organization_id
    const [eventsResult, companiesResult, packagesResult, sponsorsResult] = await Promise.all([
      supabase.from('events').select('id,name').eq('organization_id', orgId).order('created_at', { ascending: false }),
      supabase.from('companies').select('id,name').eq('organization_id', orgId).in('kind', ['sponsor', 'partner']).order('name'),
      supabase.from('sponsorship_packages').select('id,name,description,price,currency,inventory,benefits,is_active').eq('organization_id', orgId).order('name'),
      supabase.from('event_sponsorships').select('id,event_id,company_id,package_id,status,agreed_amount,currency,payment_status,payment_notes,additional_amount,agreement_details,advertising_contribution,print_requirements,fulfillment_notes').eq('organization_id', orgId).order('created_at', { ascending: false }),
    ])
    const firstError = eventsResult.error ?? companiesResult.error ?? packagesResult.error ?? sponsorsResult.error
    if (firstError) setError(firstError.message)
    setEvents((eventsResult.data ?? []) as Option[])
    setCompanies((companiesResult.data ?? []) as Option[])
    setPackages((packagesResult.data ?? []) as PackageRow[])
    setSponsors((sponsorsResult.data ?? []) as SponsorRow[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const eventName = (id: string) => events.find((event) => event.id === id)?.name ?? 'Evento'
  const companyName = (id: string) => companies.find((company) => company.id === id)?.name ?? 'Empresa'
  const packageName = (id: string | null) => id ? packages.find((item) => item.id === id)?.name ?? 'Paquete eliminado' : 'Sin paquete'
  async function createCompany(event: FormEvent) {
    event.preventDefault()
    if (!org || !newCompany.trim()) return
    setBusy(true); setError(null)
    const result = await supabase.from('companies').insert({ organization_id: org.organization_id, name: newCompany.trim(), kind: 'sponsor' }).select('id,name').single()
    setBusy(false)
    if (result.error) setError(result.error.message)
    else { setNewCompany(''); await load() }
  }

  function newSponsor() {
    setSponsorDraft({ id: '', event_id: events[0]?.id ?? '', company_id: companies[0]?.id ?? '', package_id: null, status: 'prospect', agreed_amount: null, currency: 'USD', payment_status: 'unpaid', payment_notes: null, additional_amount: 0, agreement_details: null, advertising_contribution: null, print_requirements: null, fulfillment_notes: null })
  }

  async function saveSponsor(event: FormEvent) {
    event.preventDefault()
    if (!org || !sponsorDraft?.event_id || !sponsorDraft.company_id) return
    setBusy(true); setError(null)
    const payload = { organization_id: org.organization_id, event_id: sponsorDraft.event_id, company_id: sponsorDraft.company_id, package_id: sponsorDraft.package_id || null, status: sponsorDraft.status, agreed_amount: sponsorDraft.agreed_amount || null, currency: sponsorDraft.currency || 'USD', payment_status: sponsorDraft.payment_status, payment_notes: sponsorDraft.payment_notes || null, additional_amount: sponsorDraft.additional_amount || 0, agreement_details: sponsorDraft.agreement_details || null, advertising_contribution: sponsorDraft.advertising_contribution || null, print_requirements: sponsorDraft.print_requirements || null, fulfillment_notes: sponsorDraft.fulfillment_notes || null }
    const result = await supabase.from('event_sponsorships').upsert(payload, { onConflict: 'event_id,company_id' }).select('id,event_id,company_id,package_id,status,agreed_amount,currency,payment_status,payment_notes,additional_amount,agreement_details,advertising_contribution,print_requirements,fulfillment_notes').single()
    setBusy(false)
    if (result.error) setError(result.error.message)
    else { setSponsorDraft(null); await load() }
  }

  function newPackage() { setPackageDraft({ id: '', name: '', description: '', price: null, currency: 'USD', inventory: null, benefits: [], is_active: true }) }
  async function savePackage(event: FormEvent) {
    event.preventDefault()
    if (!org || !packageDraft?.name.trim()) return
    setBusy(true); setError(null)
    const payload = { organization_id: org.organization_id, name: packageDraft.name.trim(), description: packageDraft.description || null, price: packageDraft.price || null, currency: packageDraft.currency || 'USD', inventory: packageDraft.inventory || null, benefits: benefitsValue(packageDraft.benefits).split('\n').map((item) => item.trim()).filter(Boolean), is_active: packageDraft.is_active }
    const result = packageDraft.id ? await supabase.from('sponsorship_packages').update(payload).eq('id', packageDraft.id) : await supabase.from('sponsorship_packages').insert(payload)
    setBusy(false)
    if (result.error) setError(result.error.message)
    else { setPackageDraft(null); await load() }
  }

  async function deletePackage(item: PackageRow) {
    if (!window.confirm(`¿Desactivar el paquete ${item.name}?`)) return
    const result = await supabase.from('sponsorship_packages').update({ is_active: false }).eq('id', item.id)
    if (result.error) setError(result.error.message); else await load()
  }

  async function openSponsorDetails(item: SponsorRow) {
    setSponsorDraft(item)
    const [paymentsResult, deliverablesResult] = await Promise.all([
      supabase.from('sponsorship_payments').select('id,amount,currency,payment_date,reference,status,notes').eq('event_sponsorship_id', item.id).order('payment_date', { ascending: false }),
      supabase.from('sponsorship_deliverables').select('id,name,deliverable_type,status,details,quantity,requires_print,asset_url,due_at').eq('event_sponsorship_id', item.id).order('due_at'),
    ])
    setPayments((paymentsResult.data ?? []) as Payment[]); setDeliverables((deliverablesResult.data ?? []) as Deliverable[])
    setError(paymentsResult.error?.message ?? deliverablesResult.error?.message ?? null)
  }

  async function addPayment() {
    if (!sponsorDraft?.id) return
    const amount = Number(window.prompt('Monto recibido (USD):', '0'))
    if (!amount || amount <= 0) return
    const reference = window.prompt('Referencia o comprobante (opcional):', '')
    const result = await supabase.from('sponsorship_payments').insert({ event_sponsorship_id: sponsorDraft.id, amount, reference: reference || null, status: 'confirmed' })
    if (result.error) setError(result.error.message); else { await openSponsorDetails(sponsorDraft); await load() }
  }

  async function addDeliverable() {
    if (!sponsorDraft?.id) return
    const name = window.prompt('Qué se debe entregar o imprimir:', '')?.trim()
    if (!name) return
    const details = window.prompt('Detalle, medidas, cantidad o especificaciones:', '')
    const result = await supabase.from('sponsorship_deliverables').insert({ event_sponsorship_id: sponsorDraft.id, name, details: details || null, deliverable_type: name.toLowerCase().includes('imprim') ? 'print' : 'branding', requires_print: name.toLowerCase().includes('imprim') })
    if (result.error) setError(result.error.message); else await openSponsorDetails(sponsorDraft)
  }

  return <div className="min-h-[100dvh] bg-zinc-50"><ImpersonationBanner /><header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4"><Link to="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600"><ArrowLeft className="h-4 w-4" />Panel</Link><span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900"><Handshake className="h-4 w-4 text-emerald-600" />Administración de patrocinantes</span></div></header><main className="mx-auto max-w-7xl px-5 py-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold text-zinc-900">Patrocinantes y paquetes</h1><p className="mt-1 text-sm text-zinc-600">Gestiona acuerdos, pagos, activaciones, publicidad y entregables de {org?.organizations?.name ?? 'tu organización'}.</p></div><form onSubmit={createCompany} className="flex flex-wrap gap-2"><input className={`${field} w-64`} value={newCompany} onChange={(event) => setNewCompany(event.target.value)} placeholder="Nueva empresa patrocinante" /><button disabled={busy || !newCompany.trim()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Crear empresa</button></form></div>{error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="mt-7 flex flex-wrap gap-2 border-b border-zinc-200"><button type="button" onClick={() => setActiveTab('sponsors')} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${activeTab === 'sponsors' ? 'border-b-2 border-emerald-600 text-zinc-900' : 'text-zinc-500'}`}>Acuerdos y patrocinantes ({sponsors.length})</button><button type="button" onClick={() => setActiveTab('packages')} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${activeTab === 'packages' ? 'border-b-2 border-emerald-600 text-zinc-900' : 'text-zinc-500'}`}>Paquetes ({packages.length})</button></div>{loading ? <p className="mt-6 text-sm text-zinc-500">Cargando administración comercial…</p> : activeTab === 'packages' ? <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-3">{packages.map((item) => <article key={item.id} className="rounded-2xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-zinc-900">{item.name}</h2><p className="mt-1 text-sm text-zinc-600">{item.description || 'Sin descripción'} · {item.price ?? 'Precio a definir'} {item.currency}</p><p className="mt-2 text-xs text-zinc-500">{benefitsValue(item.benefits).split('\n').filter(Boolean).length} beneficios · inventario {item.inventory ?? 'ilimitado'} · {item.is_active ? 'Activo' : 'Inactivo'}</p></div><div className="flex gap-2"><button type="button" onClick={() => setPackageDraft(item)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"><Pencil className="h-3.5 w-3.5" />Editar</button>{item.is_active && <button type="button" onClick={() => void deletePackage(item)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"><Trash2 className="h-3.5 w-3.5" />Desactivar</button>}</div></div></article>)}{!packages.length && <p className="rounded-xl border bg-white p-5 text-sm text-zinc-500">Aún no hay paquetes. Crea Oro, Plata o una propuesta a medida.</p>}</div><div className="rounded-2xl border bg-white p-5">{packageDraft ? <form onSubmit={savePackage} className="space-y-3"><h2 className="font-semibold">{packageDraft.id ? 'Editar paquete' : 'Nuevo paquete'}</h2><input className={field} value={packageDraft.name} onChange={(event) => setPackageDraft({ ...packageDraft, name: event.target.value })} placeholder="Nombre: Oro, Plata…" required /><textarea className={field} rows={3} value={packageDraft.description ?? ''} onChange={(event) => setPackageDraft({ ...packageDraft, description: event.target.value })} placeholder="Descripción comercial" /><div className="grid grid-cols-2 gap-2"><input className={field} type="number" min="0" value={packageDraft.price ?? ''} onChange={(event) => setPackageDraft({ ...packageDraft, price: Number(event.target.value) || null })} placeholder="Precio" /><input className={field} value={packageDraft.currency} onChange={(event) => setPackageDraft({ ...packageDraft, currency: event.target.value.toUpperCase() })} placeholder="USD" /></div><input className={field} type="number" min="1" value={packageDraft.inventory ?? ''} onChange={(event) => setPackageDraft({ ...packageDraft, inventory: Number(event.target.value) || null })} placeholder="Cupos disponibles (opcional)" /><label className="grid gap-1 text-sm font-medium">Beneficios incluidos<textarea className={field} rows={6} value={benefitsValue(packageDraft.benefits)} onChange={(event) => setPackageDraft({ ...packageDraft, benefits: event.target.value.split('\n') })} placeholder={'Logo en escenario\nMención en agenda\nCoffee break'} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={packageDraft.is_active} onChange={(event) => setPackageDraft({ ...packageDraft, is_active: event.target.checked })} />Disponible para nuevas asignaciones</label><div className="flex gap-2"><button className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><Save className="h-4 w-4" />Guardar paquete</button><button type="button" onClick={() => setPackageDraft(null)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Cancelar</button></div></form> : <button type="button" onClick={newPackage} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Nuevo paquete</button>}</div></section> : <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]"><div className="space-y-3">{sponsors.map((item) => <article key={item.id} className="rounded-2xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{companyName(item.company_id)}</h2><p className="text-sm text-zinc-600">{eventName(item.event_id)} · {packageName(item.package_id)}</p><p className="mt-2 text-xs text-zinc-500">Acuerdo: {item.agreed_amount ?? 'A definir'} {item.currency} · Pago: {item.payment_status} · Estado: {item.status}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void openSponsorDetails(item)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"><Pencil className="h-3.5 w-3.5" />Administrar</button><Link to={`/admin/patrocinantes/${item.event_id}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"><ClipboardList className="h-3.5 w-3.5" />Actividades</Link></div></div></article>)}{!sponsors.length && <p className="rounded-xl border bg-white p-5 text-sm text-zinc-500">No hay acuerdos todavía. Crea el primero en el panel de la derecha.</p>}</div><div className="rounded-2xl border bg-white p-5">{!sponsorDraft ? <button type="button" onClick={newSponsor} disabled={!events.length || !companies.length} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Nuevo acuerdo</button> : <form onSubmit={saveSponsor} className="space-y-3"><h2 className="font-semibold">{sponsorDraft.id ? `Administrar · ${companyName(sponsorDraft.company_id)}` : 'Nuevo acuerdo'}</h2><select className={field} value={sponsorDraft.event_id} onChange={(event) => setSponsorDraft({ ...sponsorDraft, event_id: event.target.value })}>{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={field} value={sponsorDraft.company_id} onChange={(event) => setSponsorDraft({ ...sponsorDraft, company_id: event.target.value })}>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={field} value={sponsorDraft.package_id ?? ''} onChange={(event) => setSponsorDraft({ ...sponsorDraft, package_id: event.target.value || null })}><option value="">Sin paquete</option>{packages.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.price ?? 'A definir'} {item.currency}</option>)}</select><div className="grid grid-cols-2 gap-2"><select className={field} value={sponsorDraft.status} onChange={(event) => setSponsorDraft({ ...sponsorDraft, status: event.target.value })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select><select className={field} value={sponsorDraft.payment_status} onChange={(event) => setSponsorDraft({ ...sponsorDraft, payment_status: event.target.value })}>{paymentStatuses.map((item) => <option key={item}>{item}</option>)}</select></div><div className="grid grid-cols-2 gap-2"><input className={field} type="number" min="0" value={sponsorDraft.agreed_amount ?? ''} onChange={(event) => setSponsorDraft({ ...sponsorDraft, agreed_amount: Number(event.target.value) || null })} placeholder="Monto acordado" /><input className={field} type="number" min="0" value={sponsorDraft.additional_amount || ''} onChange={(event) => setSponsorDraft({ ...sponsorDraft, additional_amount: Number(event.target.value) || 0 })} placeholder="Adicionales" /></div><textarea className={field} rows={3} value={sponsorDraft.agreement_details ?? ''} onChange={(event) => setSponsorDraft({ ...sponsorDraft, agreement_details: event.target.value })} placeholder="Detalle del acuerdo y lo incluido" /><textarea className={field} rows={2} value={sponsorDraft.advertising_contribution ?? ''} onChange={(event) => setSponsorDraft({ ...sponsorDraft, advertising_contribution: event.target.value })} placeholder="Aporte adicional de publicidad" /><textarea className={field} rows={2} value={sponsorDraft.print_requirements ?? ''} onChange={(event) => setSponsorDraft({ ...sponsorDraft, print_requirements: event.target.value })} placeholder="Qué se debe imprimir: medidas, cantidades, fechas" /><textarea className={field} rows={2} value={sponsorDraft.payment_notes ?? ''} onChange={(event) => setSponsorDraft({ ...sponsorDraft, payment_notes: event.target.value })} placeholder="Notas de pago, cuotas o comprobantes" /><textarea className={field} rows={2} value={sponsorDraft.fulfillment_notes ?? ''} onChange={(event) => setSponsorDraft({ ...sponsorDraft, fulfillment_notes: event.target.value })} placeholder="Notas de cumplimiento" /><div className="flex flex-wrap gap-2"><button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Guardar acuerdo</button>{sponsorDraft.id && <><button type="button" onClick={() => void addPayment()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><Receipt className="h-4 w-4" />Registrar pago</button><button type="button" onClick={() => void addDeliverable()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><Plus className="h-4 w-4" />Añadir entregable</button></>}</div>{sponsorDraft.id && <div className="border-t pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pagos registrados</p>{payments.map((payment) => <p key={payment.id} className="mt-1 text-xs text-zinc-600">{payment.amount} {payment.currency} · {payment.status} · {payment.reference || 'sin referencia'}</p>)}{!payments.length && <p className="mt-1 text-xs text-zinc-500">Sin pagos registrados.</p>}<p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Entregables y publicidad</p>{deliverables.map((item) => <p key={item.id} className="mt-1 text-xs text-zinc-600">{item.name} · {item.status}{item.requires_print ? ' · imprimir' : ''}{item.details ? ` · ${item.details}` : ''}</p>)}{!deliverables.length && <p className="mt-1 text-xs text-zinc-500">Sin entregables detallados.</p>}</div>}</form>}</div></section>}</main></div>
}
