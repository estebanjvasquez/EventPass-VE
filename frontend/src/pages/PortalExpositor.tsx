import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Download, FileText, ImagePlus, LogOut, Upload, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type EventRow = { id: string; organization_id: string; name: string; description: string | null; config: Record<string, unknown> | null }
type CompanyProfile = { name: string; contact_email: string | null; public_logo_url?: string | null; public_description?: string | null; public_category?: string | null; public_social_links?: Record<string, string> | null; public_contact_email?: string | null; public_contact_phone?: string | null; public_profile_status?: string | null }
type Membership = { id: string; company_id: string; role: string; status: string; company: CompanyProfile | null }
type Task = { id: string; title: string; description: string | null; due_at: string | null; status: string }
type Payment = { id: string; amount: number; currency: string; payment_date: string; reference: string | null; status: string; receipt_path: string | null }
type Staff = { id: string; role: string; status: string; user_id: string }
type PublicProfile = { logo_url: string; description: string; category: string; website: string; linkedin: string; instagram: string; contact_email: string; contact_phone: string }

export default function PortalExpositor() {
  const { eventId } = useParams()
  const [searchParams] = useSearchParams()
  const { user, signOut } = useAuth()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [platformPreview, setPlatformPreview] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [profile, setProfile] = useState<PublicProfile>({ logo_url: '', description: '', category: '', website: '', linkedin: '', instagram: '', contact_email: '', contact_phone: '' })
  const [profileStatus, setProfileStatus] = useState('draft')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!eventId || !user) return
    setMessage(null)
    const { data: eventData, error: eventError } = await supabase.from('events').select('id,organization_id,name,description,config').eq('id', eventId).maybeSingle()
    if (eventError || !eventData) { setMessage(eventError?.message ?? 'Evento no encontrado.'); return }
    setEvent(eventData as EventRow)
    const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
    const requestedCompanyId = searchParams.get('companyId')
    let member: Membership | null = null
    setPlatformPreview(Boolean(isPlatformAdmin && requestedCompanyId))
    if (isPlatformAdmin && requestedCompanyId) {
      const { data: company, error: companyError } = await supabase.from('companies').select('id,name,contact_email,public_logo_url,public_description,public_category,public_social_links,public_contact_email,public_contact_phone,public_profile_status').eq('id', requestedCompanyId).maybeSingle()
      if (companyError || !company) { setMessage(companyError?.message ?? 'Expositor no encontrado.'); return }
      member = { id: 'platform-preview', company_id: company.id, role: 'owner', status: 'active', company: company as CompanyProfile }
    } else {
      const { data: portalMember, error: memberError } = await supabase.from('exhibitor_portal_members').select('id,company_id,role,status,company:companies(name,contact_email,public_logo_url,public_description,public_category,public_social_links,public_contact_email,public_contact_phone,public_profile_status)').eq('event_id', eventId).eq('user_id', user.id).eq('status', 'active').maybeSingle()
      if (memberError || !portalMember) { setMessage(memberError?.message ?? 'Tu usuario no tiene acceso a este portal.'); return }
      member = portalMember as unknown as Membership
    }
    setMembership(member)
    const social = member.company?.public_social_links ?? {}
    setProfile({ logo_url: member.company?.public_logo_url ?? '', description: member.company?.public_description ?? '', category: member.company?.public_category ?? '', website: social.website ?? '', linkedin: social.linkedin ?? '', instagram: social.instagram ?? '', contact_email: member.company?.public_contact_email ?? '', contact_phone: member.company?.public_contact_phone ?? '' })
    setProfileStatus(member.company?.public_profile_status ?? 'draft')
    const companyId = member.company_id
    const [taskResult, paymentResult, staffResult] = await Promise.all([
      supabase.from('exhibitor_portal_tasks').select('id,title,description,due_at,status').eq('event_id', eventId).eq('company_id', companyId).order('due_at'),
      supabase.from('exhibitor_portal_payments').select('id,amount,currency,payment_date,reference,status,receipt_path').eq('event_id', eventId).eq('company_id', companyId).order('payment_date', { ascending: false }),
      supabase.from('exhibitor_portal_members').select('id,role,status,user_id').eq('event_id', eventId).eq('company_id', companyId).order('created_at'),
    ])
    if (taskResult.error || paymentResult.error || staffResult.error) setMessage(taskResult.error?.message ?? paymentResult.error?.message ?? staffResult.error?.message ?? 'No se pudo cargar el portal.')
    setTasks((taskResult.data ?? []) as Task[])
    setPayments((paymentResult.data ?? []) as Payment[])
    setStaff((staffResult.data ?? []) as Staff[])
  }, [eventId, searchParams, user])

  useEffect(() => { void load() }, [load])

  async function completeTask(task: Task) {
    const { error } = await supabase.from('exhibitor_portal_tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id)
    if (error) setMessage(error.message); else await load()
  }

  async function submitPayment(eventSubmit: React.FormEvent) {
    eventSubmit.preventDefault()
    const currentEvent = event
    if (!eventId || !membership || !amount || !currentEvent) return
    setBusy(true); setMessage(null)
    let receiptPath: string | null = null
    if (receipt) {
      const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      receiptPath = `${currentEvent.organization_id}/${eventId}/portal/${membership.company_id}/${Date.now()}-${safeName}`
      const upload = await supabase.storage.from('agenda-attachments').upload(receiptPath, receipt, { upsert: false })
      if (upload.error) { setMessage(upload.error.message); setBusy(false); return }
    }
    const { error } = await supabase.from('exhibitor_portal_payments').insert({ event_id: eventId, company_id: membership.company_id, amount: Number(amount), reference: reference.trim() || null, receipt_path: receiptPath, status: 'pending' })
    if (error) setMessage(error.message)
    else { setAmount(''); setReference(''); setReceipt(null); await load() }
    setBusy(false)
  }

  async function download(path: string) {
    const { data, error } = await supabase.storage.from('agenda-attachments').createSignedUrl(path, 300)
    if (error) setMessage(error.message); else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function submitProfile(eventSubmit: React.FormEvent) {
    eventSubmit.preventDefault()
    if (!eventId || !membership) return
    setBusy(true); setMessage(null)
    const rpcName = platformPreview ? 'admin_submit_exhibitor_public_profile' : 'submit_exhibitor_public_profile'
    const { error } = await supabase.rpc(rpcName, { p_event_id: eventId, p_company_id: membership.company_id, p_logo_url: profile.logo_url, p_description: profile.description, p_category: profile.category, p_social_links: { website: profile.website, linkedin: profile.linkedin, instagram: profile.instagram }, p_contact_email: profile.contact_email, p_contact_phone: profile.contact_phone })
    if (error) setMessage(error.message); else { setProfileStatus(platformPreview ? 'approved' : 'pending'); setMessage(platformPreview ? 'Perfil actualizado y aprobado para el plano público.' : 'Perfil enviado para aprobación del organizador.') }
    setBusy(false)
  }

  const config = event?.config ?? {}
  const branding = (config.branding as { logo_url?: string; primary_color?: string } | undefined) ?? {}
  const manualPath = typeof config.exhibitor_manual_path === 'string' ? config.exhibitor_manual_path : null
  const total = useMemo(() => payments.reduce((sum, item) => sum + Number(item.amount), 0), [payments])
  if (!event || !membership) return <main className="grid min-h-[100dvh] place-items-center bg-zinc-50 p-6"><div className="max-w-md rounded-2xl border bg-white p-6 text-center"><h1 className="text-xl font-bold">Portal del expositor</h1><p className="mt-2 text-sm text-zinc-600">{message ?? 'Cargando…'}</p></div></main>

  return <div className="min-h-[100dvh] bg-zinc-50" style={{ ['--portal-primary' as string]: branding.primary_color ?? '#047857' }}>
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4"><div className="flex items-center gap-3">{branding.logo_url && <img src={branding.logo_url} alt="" className="h-9 w-9 rounded object-contain" />}<div><p className="text-xs uppercase tracking-wide text-zinc-500">Portal del expositor</p><h1 className="font-semibold">{event.name}</h1></div></div><button type="button" onClick={() => { void signOut() }} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><LogOut className="h-4 w-4" />Salir</button></div></header>
    <main className="mx-auto max-w-6xl px-5 py-8"><div className="rounded-2xl bg-[var(--portal-primary)] p-6 text-white"><p className="text-sm opacity-80">Empresa</p><h2 className="text-2xl font-bold">{membership.company?.name ?? 'Expositor'}</h2><p className="mt-2 max-w-2xl text-sm opacity-90">{event.description ?? 'Consulta tus tareas, documentos, personal y pagos del evento.'}</p></div>
      {message && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5 lg:col-span-2"><div className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-emerald-700" /><h2 className="font-semibold">Perfil público en el plano</h2><span className={`ml-auto rounded-full px-2 py-1 text-xs font-semibold ${profileStatus === 'approved' ? 'bg-emerald-100 text-emerald-800' : profileStatus === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-600'}`}>{profileStatus === 'approved' ? 'Aprobado' : profileStatus === 'pending' ? 'En revisión' : profileStatus === 'rejected' ? 'Requiere cambios' : 'Borrador'}</span></div><p className="mt-1 text-sm text-zinc-600">Completa cómo debe aparecer tu empresa para visitantes y el organizador aprobará la publicación.</p><form onSubmit={submitProfile} className="mt-4 grid gap-3 sm:grid-cols-2"><input value={profile.logo_url} onChange={(event) => setProfile({ ...profile, logo_url: event.target.value })} placeholder="URL del logo (PNG o SVG)" className="rounded-lg border p-2 text-sm" /><input value={profile.category} onChange={(event) => setProfile({ ...profile, category: event.target.value })} placeholder="Categoría o sector" className="rounded-lg border p-2 text-sm" /><textarea value={profile.description} onChange={(event) => setProfile({ ...profile, description: event.target.value })} placeholder="Descripción pública de la empresa" rows={3} className="rounded-lg border p-2 text-sm sm:col-span-2" /><input type="url" value={profile.website} onChange={(event) => setProfile({ ...profile, website: event.target.value })} placeholder="Sitio web" className="rounded-lg border p-2 text-sm" /><input value={profile.contact_email} onChange={(event) => setProfile({ ...profile, contact_email: event.target.value })} placeholder="Correo público" className="rounded-lg border p-2 text-sm" /><input value={profile.linkedin} onChange={(event) => setProfile({ ...profile, linkedin: event.target.value })} placeholder="LinkedIn" className="rounded-lg border p-2 text-sm" /><input value={profile.instagram} onChange={(event) => setProfile({ ...profile, instagram: event.target.value })} placeholder="Instagram" className="rounded-lg border p-2 text-sm" /><input value={profile.contact_phone} onChange={(event) => setProfile({ ...profile, contact_phone: event.target.value })} placeholder="Teléfono público" className="rounded-lg border p-2 text-sm" /><button disabled={busy} className="w-fit rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar perfil a revisión'}</button></form></section>
        <section className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-700" /><h2 className="font-semibold">Documentos</h2></div><p className="mt-1 text-sm text-zinc-600">Material entregado por el organizador.</p>{manualPath ? <button type="button" onClick={() => { void download(manualPath) }} className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Download className="h-4 w-4" />Descargar manual del expositor</button> : <p className="mt-4 text-sm text-zinc-500">El manual aún no está disponible.</p>}</section>
        <section className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-700" /><h2 className="font-semibold">Personal autorizado</h2></div><p className="mt-1 text-sm text-zinc-600">Usuarios vinculados a esta empresa y evento.</p><ul className="mt-4 space-y-2 text-sm">{staff.map((item) => <li key={item.id} className="flex justify-between rounded-lg bg-zinc-50 p-3"><span>{item.user_id === user?.id ? 'Tú' : 'Miembro del equipo'}</span><span className="text-zinc-500">{item.status === 'active' ? item.role : 'Invitado'}</span></li>)}</ul></section>
        <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Tareas del evento</h2><div className="mt-4 space-y-3">{tasks.length ? tasks.map((task) => <div key={task.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{task.title}</p><p className="text-xs text-zinc-600">{task.description ?? 'Sin instrucciones adicionales'}{task.due_at ? ` · vence ${new Date(task.due_at).toLocaleDateString()}` : ''}</p></div>{task.status === 'completed' ? <span className="text-xs font-semibold text-emerald-700">Completada</span> : <button type="button" onClick={() => { void completeTask(task) }} className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-semibold text-white">Marcar lista</button>}</div>) : <p className="text-sm text-zinc-500">No tienes tareas pendientes.</p>}</div></section>
        <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Pagos y comprobantes</h2><p className="mt-1 text-sm text-zinc-600">Total reportado: {total.toFixed(2)} USD</p><form onSubmit={submitPayment} className="mt-4 grid gap-3"><div className="grid gap-3 sm:grid-cols-2"><input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Monto" className="rounded-lg border p-2 text-sm" /><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Referencia bancaria" className="rounded-lg border p-2 text-sm" /></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm"><Upload className="h-4 w-4" />{receipt ? receipt.name : 'Adjuntar comprobante PDF o imagen'}<input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} /></label><button disabled={busy} className="w-fit rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Enviando…' : 'Registrar pago'}</button></form><div className="mt-4 space-y-2">{payments.map((payment) => <div key={payment.id} className="flex justify-between rounded-lg bg-zinc-50 p-3 text-sm"><span>{payment.amount} {payment.currency} · {payment.payment_date}</span><span className="text-zinc-500">{payment.status}</span></div>)}</div></section>
      </div>
    </main>
  </div>
}
