import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, Image, Pencil, Plus, Save, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type Company = {
  id: string; name: string; kind: string; event_id: string | null
  contact_name: string | null; contact_email: string | null; contact_phone: string | null
  legal_name: string | null; tax_id: string | null; fiscal_address: string | null
  billing_email: string | null; billing_phone: string | null; billing_contact: string | null
  website: string | null; profile_notes: string | null; public_logo_url: string | null
}
type EventName = { id: string; name: string }
type Props = { organizationId: string; onChanged: () => Promise<void> }
const field = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500'
const emptyDraft = (): Partial<Company> => ({ name: '', kind: 'sponsor', contact_name: '', contact_email: '', contact_phone: '', legal_name: '', tax_id: '', fiscal_address: '', billing_email: '', billing_phone: '', billing_contact: '', website: '', profile_notes: '', public_logo_url: '' })
const blankToNull = (value: string | null | undefined) => value?.trim() || null
function validUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' } catch { return false } }

export default function SponsorCompaniesAdmin({ organizationId, onChanged }: Props) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [events, setEvents] = useState<EventName[]>([])
  const [draft, setDraft] = useState<Partial<Company> | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const load = useCallback(async () => {
    const [companyResult, eventResult] = await Promise.all([
      supabase.from('companies').select('id,name,kind,event_id,contact_name,contact_email,contact_phone,legal_name,tax_id,fiscal_address,billing_email,billing_phone,billing_contact,website,profile_notes,public_logo_url').eq('organization_id', organizationId).order('name'),
      supabase.from('events').select('id,name').eq('organization_id', organizationId).order('name'),
    ])
    setError(companyResult.error?.message ?? eventResult.error?.message ?? null)
    setCompanies((companyResult.data ?? []) as Company[])
    setEvents((eventResult.data ?? []) as EventName[])
  }, [organizationId])
  useEffect(() => { void load() }, [load])
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return needle ? companies.filter(company => `${company.name} ${company.legal_name ?? ''} ${company.contact_name ?? ''}`.toLocaleLowerCase().includes(needle)) : companies
  }, [companies, query])
  const eventName = (eventId: string | null) => events.find(event => event.id === eventId)?.name ?? 'Sin evento específico'
  function set<K extends keyof Company>(key: K, value: Company[K]) { setDraft(current => ({ ...current, [key]: value })) }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft?.name?.trim()) return
    const logo = blankToNull(draft.public_logo_url)
    if (logo && !validUrl(logo)) { setError('El logo debe ser una URL http:// o https:// válida.'); return }
    setBusy(true); setError(null); setNotice(null)
    const payload = {
      name: draft.name.trim(), kind: draft.kind === 'exhibitor' ? 'exhibitor' : draft.kind === 'partner' ? 'partner' : 'sponsor',
      contact_name: blankToNull(draft.contact_name), contact_email: blankToNull(draft.contact_email), contact_phone: blankToNull(draft.contact_phone),
      legal_name: blankToNull(draft.legal_name), tax_id: blankToNull(draft.tax_id), fiscal_address: blankToNull(draft.fiscal_address),
      billing_email: blankToNull(draft.billing_email), billing_phone: blankToNull(draft.billing_phone), billing_contact: blankToNull(draft.billing_contact),
      website: blankToNull(draft.website), profile_notes: blankToNull(draft.profile_notes), public_logo_url: logo,
    }
    const result = draft.id
      ? await supabase.from('companies').update(payload).eq('id', draft.id).select('id,name').maybeSingle()
      : await supabase.from('companies').insert({ ...payload, organization_id: organizationId }).select('id,name').single()
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    if (!result.data) { setError('No se guardó la empresa. Verifica tus permisos e intenta de nuevo.'); return }
    setDraft(null); setNotice(`Empresa “${result.data.name}” guardada.`)
    await Promise.all([load(), onChanged()])
  }
  return <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_480px]">
    <div className="space-y-3 rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Empresas patrocinantes</h2><p className="mt-1 text-sm text-zinc-600">Un expositor del mismo evento también puede recibir un acuerdo de patrocinio.</p></div><button type="button" onClick={() => setDraft(emptyDraft())} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Nueva empresa</button></div>
      <input className={field} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por empresa, razón social o contacto" />
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="divide-y rounded-xl border">{visible.map(company => <article key={company.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="flex min-w-0 items-center gap-3">{company.public_logo_url ? <img src={company.public_logo_url} alt="" className="h-10 w-16 rounded border bg-white object-contain p-1" onError={event => { event.currentTarget.style.display = 'none' }} /> : <Building2 className="h-6 w-6 shrink-0 text-zinc-400" />}<div className="min-w-0"><h3 className="truncate font-semibold">{company.name}</h3><p className="text-xs text-zinc-500">{company.kind === 'exhibitor' ? `Expositor · ${eventName(company.event_id)}` : 'Patrocinante'}{company.contact_name ? ` · ${company.contact_name}` : ''}</p></div></div><button type="button" onClick={() => setDraft(company)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"><Pencil className="h-3.5 w-3.5" />Editar</button></article>)}{!visible.length && <p className="p-5 text-sm text-zinc-500">No hay empresas que coincidan.</p>}</div>
    </div>
    <aside className="rounded-2xl border bg-white p-5 lg:sticky lg:top-5 lg:self-start">{draft ? <form onSubmit={save} className="space-y-4"><div className="flex items-center justify-between"><h2 className="font-semibold">{draft.id ? 'Editar empresa' : 'Nueva empresa patrocinante'}</h2><button type="button" onClick={() => setDraft(null)} className="rounded p-1 text-zinc-500" aria-label="Cerrar edición"><X className="h-4 w-4" /></button></div><label className="block text-sm font-medium">Nombre comercial<input className={`${field} mt-1`} required value={draft.name ?? ''} onChange={event => set('name', event.target.value)} /></label><label className="block text-sm font-medium">URL del logo<input className={`${field} mt-1`} type="url" placeholder="https://empresa.com/logo.png" value={draft.public_logo_url ?? ''} onChange={event => set('public_logo_url', event.target.value)} /></label>{draft.public_logo_url && validUrl(draft.public_logo_url) && <div className="rounded-lg border bg-zinc-50 p-3"><img src={draft.public_logo_url} alt="Vista previa del logo" className="h-16 max-w-full object-contain" /></div>}<div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Razón social<input className={`${field} mt-1`} value={draft.legal_name ?? ''} onChange={event => set('legal_name', event.target.value)} /></label><label className="block text-sm font-medium">RIF / identificación fiscal<input className={`${field} mt-1`} value={draft.tax_id ?? ''} onChange={event => set('tax_id', event.target.value)} /></label></div><label className="block text-sm font-medium">Dirección fiscal<textarea className={`${field} mt-1`} rows={2} value={draft.fiscal_address ?? ''} onChange={event => set('fiscal_address', event.target.value)} /></label><fieldset className="grid gap-3 border-t pt-4 sm:grid-cols-2"><legend className="mb-1 text-sm font-semibold">Contacto principal</legend><label className="block text-sm">Nombre<input className={`${field} mt-1`} value={draft.contact_name ?? ''} onChange={event => set('contact_name', event.target.value)} /></label><label className="block text-sm">Teléfono<input className={`${field} mt-1`} value={draft.contact_phone ?? ''} onChange={event => set('contact_phone', event.target.value)} /></label><label className="block text-sm sm:col-span-2">Correo<input className={`${field} mt-1`} type="email" value={draft.contact_email ?? ''} onChange={event => set('contact_email', event.target.value)} /></label></fieldset><fieldset className="grid gap-3 border-t pt-4 sm:grid-cols-2"><legend className="mb-1 text-sm font-semibold">Facturación</legend><label className="block text-sm">Contacto<input className={`${field} mt-1`} value={draft.billing_contact ?? ''} onChange={event => set('billing_contact', event.target.value)} /></label><label className="block text-sm">Teléfono<input className={`${field} mt-1`} value={draft.billing_phone ?? ''} onChange={event => set('billing_phone', event.target.value)} /></label><label className="block text-sm sm:col-span-2">Correo de facturación<input className={`${field} mt-1`} type="email" value={draft.billing_email ?? ''} onChange={event => set('billing_email', event.target.value)} /></label></fieldset><label className="block text-sm font-medium">Sitio web<input className={`${field} mt-1`} type="url" placeholder="https://empresa.com" value={draft.website ?? ''} onChange={event => set('website', event.target.value)} /></label><label className="block text-sm font-medium">Notas internas<textarea className={`${field} mt-1`} rows={3} value={draft.profile_notes ?? ''} onChange={event => set('profile_notes', event.target.value)} /></label><button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{busy ? 'Guardando…' : 'Guardar empresa'}</button></form> : <div className="py-12 text-center text-sm text-zinc-500"><Image className="mx-auto mb-3 h-8 w-8" />Selecciona una empresa para editar sus datos, contacto, facturación y logo.</div>}</aside>
  </section>
}
