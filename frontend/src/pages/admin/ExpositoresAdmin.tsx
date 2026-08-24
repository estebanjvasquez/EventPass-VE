import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, Download, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

type Company = { id: string; name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null }
type Stand = { id: string; label: string; status: string }
type Assignment = { element_id: string; company_id: string }
type EventConfig = Record<string, unknown>

export default function ExpositoresAdmin() {
  const { eventId } = useParams()
  const { session } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [stands, setStands] = useState<Stand[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [eventName, setEventName] = useState('')
  const [eventConfig, setEventConfig] = useState<EventConfig>({})
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [inviteCompany, setInviteCompany] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const manualPath = typeof eventConfig.exhibitor_manual_path === 'string' ? eventConfig.exhibitor_manual_path : null

  const load = useCallback(async () => {
    if (!eventId) return
    setError(null)
    const { data: event, error: eventError } = await supabase.from('events').select('organization_id,name,config').eq('id', eventId).maybeSingle()
    if (eventError) { setError(eventError.message); return }
    if (!event) { setError('No se encontró el evento.'); return }
    setOrgId(event.organization_id)
    setEventName(event.name ?? '')
    setEventConfig((event.config as EventConfig | null) ?? {})
    const { data: map } = await supabase.from('venue_maps').select('id').eq('event_id', eventId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const [firmResult, standResult] = await Promise.all([
      supabase.from('companies').select('id,name,contact_name,contact_email,contact_phone').eq('organization_id', event.organization_id).eq('kind', 'exhibitor').order('name'),
      map ? supabase.from('venue_map_elements').select('id,label,status').eq('map_id', map.id).eq('element_type', 'stand').order('label') : Promise.resolve({ data: [], error: null }),
    ])
    const boothResult = await supabase.from('booth_assignments').select('element_id,company_id').neq('status', 'cancelled')
    setCompanies((firmResult.data ?? []) as Company[])
    setStands((standResult.data ?? []) as Stand[])
    setAssignments(((boothResult.data ?? []) as Assignment[]).filter((item) => (standResult.data ?? []).some((stand) => stand.id === item.element_id)))
    if (firmResult.error || standResult.error || boothResult.error) setError(firmResult.error?.message ?? standResult.error?.message ?? boothResult.error?.message ?? 'No se pudo cargar.')
  }, [eventId])

  useEffect(() => { void load() }, [load])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!orgId || !name.trim()) return
    const { error: insertError } = await supabase.from('companies').insert({ organization_id: orgId, name: name.trim(), kind: 'exhibitor' })
    if (insertError) setError(insertError.message)
    else { setName(''); await load() }
  }

  async function assign(companyId: string, standId: string) {
    const { error: assignmentError } = await supabase.from('booth_assignments').upsert({ element_id: standId, company_id: companyId, status: 'confirmed' }, { onConflict: 'element_id' })
    if (!assignmentError) await supabase.from('venue_map_elements').update({ status: 'assigned' }).eq('id', standId)
    if (assignmentError) setError(assignmentError.message)
    else await load()
  }

  async function uploadManual(file: File | undefined) {
    if (!file || !eventId || !orgId) return
    if (file.type !== 'application/pdf') { setError('El manual debe estar en formato PDF.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('El manual no puede superar 10 MB.'); return }
    setUploading(true); setError(null)
    const path = `${orgId}/${eventId}/exhibitor-manual-${Date.now()}.pdf`
    const { error: uploadError } = await supabase.storage.from('agenda-attachments').upload(path, file, { contentType: 'application/pdf', upsert: false })
    if (uploadError) { setError(uploadError.message); setUploading(false); return }
    const config = { ...eventConfig, exhibitor_manual_path: path }
    const { error: updateError } = await supabase.from('events').update({ config }).eq('id', eventId)
    if (updateError) setError(updateError.message)
    else setEventConfig(config)
    setUploading(false)
  }

  async function downloadManual() {
    if (!manualPath) return
    const { data, error: signedError } = await supabase.storage.from('agenda-attachments').createSignedUrl(manualPath, 300)
    if (signedError) setError(signedError.message)
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function inviteStaff(event: React.FormEvent) {
    event.preventDefault()
    if (!eventId || !inviteCompany || !inviteEmail || !session?.access_token) return
    setInviting(true); setError(null)
    const api = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
    const response = await fetch(`${api}/api/exhibitor-portal/invite`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, company_id: inviteCompany, email: inviteEmail, role: 'staff' }) })
    const body = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) setError(body.error ?? 'No se pudo enviar la invitación.')
    else { setInviteEmail(''); setError('Invitación enviada. El usuario podrá entrar al portal con el enlace recibido.') }
    setInviting(false)
  }

  const assigned = new Map(assignments.map((item) => [item.company_id, item.element_id]))
  return <div className="min-h-[100dvh] bg-zinc-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4"><Link to={`/admin/stands/${eventId}`} aria-label="Volver al plano"><ArrowLeft className="h-4 w-4" /></Link><Building2 className="h-5 w-5 text-emerald-700" /><span className="font-semibold">Expositores y plano</span></div></header>
    <main className="mx-auto max-w-5xl px-5 py-8"><h1 className="text-2xl font-bold">Expositores{eventName ? ` · ${eventName}` : ''}</h1><p className="mt-1 text-sm text-zinc-600">Gestiona empresas y asigna uno o varios espacios desde una vista comercial separada del diseño.</p>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <section className="mt-5 grid gap-4 md:grid-cols-2">
        <form onSubmit={create} className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Nueva empresa expositora</h2><div className="mt-3 flex gap-2"><input value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-lg border p-2 text-sm" placeholder="Nombre de la empresa" /><button className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Crear</button></div></form>
        <div className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Manual del expositor</h2><p className="mt-1 text-xs text-zinc-600">PDF privado para que los expositores lo descarguen desde su portal (máximo 10 MB).</p><div className="mt-3 flex flex-wrap items-center gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Upload className="h-4 w-4" />{uploading ? 'Subiendo…' : 'Cargar PDF'}<input type="file" accept="application/pdf" className="hidden" disabled={uploading} onChange={(event) => { void uploadManual(event.target.files?.[0]) }} /></label>{manualPath && <button type="button" onClick={() => { void downloadManual() }} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Download className="h-4 w-4" />Descargar manual</button>}</div></div>
        <form onSubmit={inviteStaff} className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Invitar personal al portal</h2><p className="mt-1 text-xs text-zinc-600">El personal sólo verá la empresa y el evento asignados.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><select required value={inviteCompany} onChange={(event) => setInviteCompany(event.target.value)} className="rounded-lg border p-2 text-sm"><option value="">Empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="correo@empresa.com" className="rounded-lg border p-2 text-sm" /></div><button disabled={inviting} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{inviting ? 'Enviando…' : 'Invitar personal'}</button></form>
      </section>
      <div className="mt-6 overflow-hidden rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-xs text-zinc-600"><tr><th className="p-3">Empresa</th><th className="p-3">Contacto</th><th className="p-3">Espacio</th><th className="p-3">Portal</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id} className="border-t"><td className="p-3 font-medium">{company.name}</td><td className="p-3 text-zinc-600">{company.contact_name ?? company.contact_email ?? 'Pendiente'}</td><td className="p-3"><select value={assigned.get(company.id) ?? ''} onChange={(event) => event.target.value && assign(company.id, event.target.value)} className="rounded border p-2 text-sm"><option value="">Sin espacio</option>{stands.filter((stand) => stand.status !== 'assigned' || assigned.get(company.id) === stand.id).map((stand) => <option key={stand.id} value={stand.id}>{stand.label}</option>)}</select></td><td className="p-3"><Link to={`/portal/expositor/${eventId}`} className="text-xs font-semibold text-emerald-700">Abrir portal</Link></td></tr>)}</tbody></table></div>
    </main>
  </div>
}
