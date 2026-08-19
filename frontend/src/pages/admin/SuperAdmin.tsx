import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2, ExternalLink, LogIn, ShieldCheck, Trash2, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { setImpersonatedOrg } from '../../lib/activeOrg'
import { slugAvailable, slugify } from '../../lib/onboarding'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init?.headers,
    },
  })
}

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

const PLAN_LABEL: Record<string, string> = { arranque: 'Arranque', profesional: 'Profesional', asociacion: 'Asociación' }
const ORG_STATUS: Record<string, { text: string; cls: string }> = {
  trial: { text: 'Prueba', cls: 'bg-sky-100 text-sky-700' },
  active: { text: 'Activo', cls: 'bg-emerald-100 text-emerald-700' },
  suspended: { text: 'Suspendido', cls: 'bg-red-100 text-red-700' },
}
const ROOT_DOMAIN = 'eventosfacil.net'

type Tab = 'clientes' | 'pagos' | 'supers' | 'pagos_plataforma'

export default function SuperAdmin() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('clientes')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('is_platform_admin').then(({ data }) => setAllowed(data === true))
  }, [])

  if (allowed === null)
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa]">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600" />
      </div>
    )
  if (!allowed)
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa] px-5 text-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Acceso restringido</h1>
          <p className="mt-2 text-sm text-zinc-600">Esta sección es solo para administradores de la plataforma.</p>
          <Link to="/admin" className="mt-6 inline-block text-sm font-medium text-emerald-700 hover:underline">Ir al panel</Link>
        </div>
      </div>
    )

  const tabs: { id: Tab; label: string }[] = [
    { id: 'clientes', label: 'Clientes' },
    { id: 'pagos', label: 'Pagos' },
    { id: 'supers', label: 'Superadmins' },
    { id: 'pagos_plataforma', label: 'Datos de pago' },
  ]

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" />
            Panel
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Superadmin
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <nav className="mb-6 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-zinc-900 text-white' : 'border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {error && <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {tab === 'clientes' && <ClientsTab onError={setError} />}
        {tab === 'pagos' && <PaymentsTab onError={setError} />}
        {tab === 'supers' && <SuperadminsTab onError={setError} />}
        {tab === 'pagos_plataforma' && <PlatformMethods onError={setError} />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CLIENTES: lista de organizaciones + detalle (equipo, eventos, plan/estado).
// ---------------------------------------------------------------------------
type Org = {
  id: string
  name: string
  slug: string
  custom_hostname: string | null
  plan: string
  status: string
  created_at: string
  event_count: number
  member_count: number
  registration_count: number
  period_end: string | null
}

function ClientsTab({ onError }: { onError: (m: string) => void }) {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [selected, setSelected] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_organizations')
    if (error) onError(error.message)
    else setOrgs((data ?? []) as Org[])
    setLoading(false)
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-white" />

  return (
    <>
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-xl font-bold tracking-tight text-zinc-900">Clientes</h1>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
      >
        <Building2 className="h-4 w-4" />
        Nuevo cliente
      </button>
    </div>
    {creating && (
      <NewClientModal
        onClose={() => setCreating(false)}
        onDone={async () => {
          setCreating(false)
          await load()
        }}
        onError={onError}
      />
    )}
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {orgs.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">Aún no hay clientes.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-400">
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Eventos</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {orgs.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className={`cursor-pointer transition-colors hover:bg-zinc-50 ${selected?.id === o.id ? 'bg-emerald-50/50' : ''}`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-zinc-900">{o.name}</p>
                      <p className="text-xs text-zinc-500">{o.slug}.{ROOT_DOMAIN}</p>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-700">{PLAN_LABEL[o.plan] ?? o.plan}</td>
                    <td className="px-5 py-3.5 text-zinc-600">
                      {Number(o.event_count)} · {Number(o.registration_count)} reg.
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ORG_STATUS[o.status]?.cls ?? ''}`}>
                        {ORG_STATUS[o.status]?.text ?? o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {selected ? (
          <OrgDetail org={selected} onError={onError} onChanged={load} />
        ) : (
          <div className="grid h-full min-h-40 place-items-center rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            <span>
              <Building2 className="mx-auto mb-2 h-6 w-6 text-zinc-300" />
              Selecciona un cliente para ver su detalle.
            </span>
          </div>
        )}
      </div>
    </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Alta manual de un cliente: crea la organización e invita administradores.
// ---------------------------------------------------------------------------
function NewClientModal({ onClose, onDone, onError }: { onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [plan, setPlan] = useState('arranque')
  const [emails, setEmails] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ email: string; status: string; error?: string }[] | null>(null)

  const effSlug = slugEdited ? slug : slugify(name)

  useEffect(() => {
    setAvailable(null)
    if (effSlug.length < 3) return
    const t = setTimeout(async () => setAvailable(await slugAvailable(effSlug)), 400)
    return () => clearTimeout(t)
  }, [effSlug])

  async function submit() {
    const list = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    if (!name.trim()) return onError('Escribe el nombre del cliente.')
    if (effSlug.length < 3) return onError('El subdominio debe tener al menos 3 caracteres.')
    if (list.length === 0) return onError('Agrega al menos un correo de administrador.')

    setBusy(true)
    try {
      const res = await authFetch('/api/admin/clients', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), slug: effSlug, plan, admin_emails: list }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; admins?: { email: string; status: string; error?: string }[] }
      if (!res.ok) {
        onError(j.error ?? 'No se pudo crear el cliente.')
        setBusy(false)
        return
      }
      setResult(j.admins ?? [])
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error de red.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-5 py-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <>
            <h2 className="text-lg font-semibold text-zinc-900">Cliente creado</h2>
            <p className="mt-1 text-sm text-zinc-600">Estado de los administradores:</p>
            <ul className="mt-4 space-y-2">
              {result.map((r) => (
                <li key={r.email} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <span className="text-zinc-800">{r.email}</span>
                  <span className={r.status === 'error' ? 'text-red-600' : 'text-emerald-700'}>
                    {r.status === 'invited' ? 'Invitado ✉️' : r.status === 'linked' ? 'Enlazado ✓' : `Error: ${r.error ?? ''}`}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onDone} className="mt-6 w-full rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white">
              Listo
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-zinc-900">Nuevo cliente</h2>
            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-800">Nombre de la organización</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Asociación de Vecinos…" />
            </label>
            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-800">Subdominio</span>
              <div className="flex items-stretch overflow-hidden rounded-lg border border-zinc-300 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                <input
                  value={effSlug}
                  onChange={(e) => {
                    setSlugEdited(true)
                    setSlug(slugify(e.target.value))
                  }}
                  className="min-w-0 flex-1 px-3.5 py-2.5 text-sm text-zinc-900 outline-none"
                  placeholder="mi-cliente"
                />
                <span className="flex items-center whitespace-nowrap bg-zinc-50 px-3 text-sm text-zinc-500">.{ROOT_DOMAIN}</span>
              </div>
              {effSlug.length >= 3 && (
                <span className={`text-xs ${available === false ? 'text-red-600' : available ? 'text-emerald-700' : 'text-zinc-400'}`}>
                  {available === false ? 'No disponible' : available ? 'Disponible ✓' : 'Comprobando…'}
                </span>
              )}
            </label>
            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-800">Plan</span>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}>
                <option value="arranque">Arranque</option>
                <option value="profesional">Profesional</option>
                <option value="asociacion">Asociación</option>
              </select>
            </label>
            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-800">Correos de administradores</span>
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={3}
                className={inputCls}
                placeholder="Uno o varios correos separados por coma o salto de línea"
              />
              <span className="text-xs text-zinc-500">Los que no tengan cuenta recibirán una invitación para definir su clave.</span>
            </label>

            <div className="mt-6 flex gap-2">
              <button type="button" onClick={submit} disabled={busy || available === false} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60">
                {busy ? 'Creando…' : 'Crear cliente'}
              </button>
              <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

type Member = { user_id: string; email: string; role: string; created_at: string }
type OrgEvent = { id: string; name: string; status: string; start_date: string | null; total_slots: number; registration_count: number }

function OrgDetail({ org, onError, onChanged }: { org: Org; onError: (m: string) => void; onChanged: () => void }) {
  const navigate = useNavigate()
  const [members, setMembers] = useState<Member[]>([])
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [plan, setPlan] = useState(org.plan)
  const [status, setStatus] = useState(org.status)
  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(org.slug)
  const [hostname, setHostname] = useState(org.custom_hostname ?? '')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [domainStatus, setDomainStatus] = useState<string>('...')
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    setDomainStatus('...')
    authFetch(`/api/tenants/domain-status?organization_id=${org.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDomainStatus((j as { status?: string } | null)?.status ?? 'none'))
      .catch(() => setDomainStatus('none'))
  }, [org.id])

  function manageAsClient() {
    setImpersonatedOrg(org.id)
    navigate('/admin')
  }

  async function activateDomain() {
    setActivating(true)
    try {
      const res = await authFetch('/api/tenants/provision-domain', {
        method: 'POST',
        body: JSON.stringify({ organization_id: org.id }),
      })
      const j = (await res.json().catch(() => ({}))) as { status?: string; error?: string }
      if (!res.ok) onError(j.error ?? 'No se pudo activar el subdominio.')
      else setDomainStatus(j.status ?? 'initializing')
    } finally {
      setActivating(false)
    }
  }

  useEffect(() => {
    setPlan(org.plan)
    setStatus(org.status)
    setName(org.name); setSlug(org.slug); setHostname(org.custom_hostname ?? '')
    Promise.all([
      supabase.rpc('admin_org_members', { p_org: org.id }),
      supabase.rpc('admin_org_events', { p_org: org.id }),
    ]).then(([m, e]) => {
      if (m.error) onError(m.error.message)
      else setMembers((m.data ?? []) as Member[])
      if (e.error) onError(e.error.message)
      else setEvents((e.data ?? []) as OrgEvent[])
    })
  }, [org.id, org.plan, org.status, org.name, org.slug, org.custom_hostname, onError])

  async function save() {
    setSaving(true)
    const { error } = await supabase.rpc('admin_update_client', {
      p_org: org.id,
      p_name: name,
      p_slug: slugify(slug),
      p_custom_hostname: hostname,
      p_plan: plan,
      p_status: status,
    })
    setSaving(false)
    if (error) onError(error.message)
    else onChanged()
  }

  async function addOwner() {
    const email=ownerEmail.trim().toLowerCase(); if (!email) return
    const res=await authFetch(`/api/admin/clients/${org.id}/owners`, {method:'POST',body:JSON.stringify({email})})
    const data=await res.json().catch(()=>({})) as {error?:string}; if (!res.ok) onError(data.error ?? 'No se pudo agregar el propietario.'); else { setOwnerEmail(''); const m=await supabase.rpc('admin_org_members',{p_org:org.id}); if (!m.error) setMembers((m.data??[]) as Member[]) }
  }
  async function removeOwner(member: Member) {
    if (member.role !== 'owner' || !window.confirm(`¿Quitar a ${member.email} como propietario?`)) return
    const res=await authFetch(`/api/admin/clients/${org.id}/owners/${member.user_id}`,{method:'DELETE'}); const data=await res.json().catch(()=>({})) as {error?:string}
    if (!res.ok) onError(data.error ?? 'No se pudo quitar el propietario.'); else setMembers(current=>current.filter(item=>item.user_id!==member.user_id))
  }
  const dirty = plan !== org.plan || status !== org.status || name !== org.name || slug !== org.slug || hostname !== (org.custom_hostname ?? '')

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h3 className="text-lg font-bold text-zinc-900">{org.name}</h3>
      <a href={`https://${org.slug}.${ROOT_DOMAIN}`} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
        {org.slug}.{ROOT_DOMAIN} <ExternalLink className="h-3 w-3" />
      </a>
      {org.custom_hostname && <p className="text-xs text-zinc-500">Dominio propio: {org.custom_hostname}</p>}
      <p className="mt-1 text-xs text-zinc-500">
        Suscripción hasta: {org.period_end ? new Date(org.period_end).toLocaleDateString('es-VE') : '—'}
      </p>

      <button
        type="button"
        onClick={manageAsClient}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
      >
        <LogIn className="h-4 w-4" />
        Gestionar como cliente
      </button>

      {/* Subdominio */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2">
        <span className="text-xs text-zinc-600">
          Subdominio:{' '}
          <span className={domainStatus === 'active' ? 'font-medium text-emerald-700' : 'text-zinc-500'}>
            {domainStatus === 'active'
              ? 'Activo'
              : domainStatus === 'pending' || domainStatus === 'initializing'
                ? 'Validando…'
                : domainStatus === '...'
                  ? '…'
                  : 'Sin activar'}
          </span>
        </span>
        {domainStatus !== 'active' && domainStatus !== '...' && (
          <button
            type="button"
            onClick={activateDomain}
            disabled={activating}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {activating ? 'Activando…' : 'Activar subdominio'}
          </button>
        )}
      </div>

      {/* Datos editables del cliente */}
      <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-4">
        <label className="flex flex-col gap-1.5"><span className="text-xs font-medium text-zinc-700">Nombre</span><input value={name} onChange={e=>setName(e.target.value)} className={inputCls}/></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs font-medium text-zinc-700">Subdominio</span><input value={slug} onChange={e=>setSlug(slugify(e.target.value))} className={inputCls}/></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs font-medium text-zinc-700">Dominio propio (opcional)</span><input value={hostname} onChange={e=>setHostname(e.target.value)} className={inputCls} placeholder="eventos.cliente.com"/></label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-700">Plan</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}>
            <option value="arranque">Arranque</option>
            <option value="profesional">Profesional</option>
            <option value="asociacion">Asociación</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-700">Estado</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="trial">Prueba</option>
            <option value="active">Activo</option>
            <option value="suspended">Suspendido</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving || !dirty}
        className="mt-3 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>

      {/* Equipo */}
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Users className="h-3.5 w-3.5" /> Equipo
        </p>
        <ul className="mt-2 space-y-1">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between text-sm">
              <span className="text-zinc-700">{m.email}</span>
              <span className="flex items-center gap-2 text-xs capitalize text-zinc-500">{m.role}{m.role==='owner' && <button type="button" onClick={()=>removeOwner(m)} className="text-red-600 hover:underline">Quitar</button>}</span>
            </li>
          ))}
          {members.length === 0 && <li className="text-sm text-zinc-400">Sin miembros.</li>}
        </ul>
        <div className="mt-3 flex gap-2"><input value={ownerEmail} onChange={e=>setOwnerEmail(e.target.value)} className={inputCls} placeholder="nuevo.propietario@cliente.com"/><button type="button" onClick={addOwner} className="shrink-0 rounded-lg border border-zinc-300 px-3 text-xs font-semibold">Agregar</button></div>
      </div>

      {/* Eventos */}
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Eventos</p>
        <ul className="mt-2 space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-sm">
              <span className="text-zinc-700">{e.name}</span>
              <span className="text-xs text-zinc-500">
                {Number(e.registration_count)} reg. · {e.status}
              </span>
            </li>
          ))}
          {events.length === 0 && <li className="text-sm text-zinc-400">Sin eventos.</li>}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PAGOS: comprobantes de suscripción por aprobar.
// ---------------------------------------------------------------------------
type OrgRef = { name: string } | { name: string }[] | null
type Payment = {
  id: string
  plan: string
  amount_usd: number
  method: string | null
  reference: string | null
  receipt_path: string | null
  period_months: number
  created_at: string
  organizations: OrgRef
}

function orgLabel(o: OrgRef): string {
  const row = Array.isArray(o) ? o[0] : o
  return row?.name ?? '—'
}

function PaymentsTab({ onError }: { onError: (m: string) => void }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('subscription_payments')
      .select('id, plan, amount_usd, method, reference, receipt_path, period_months, created_at, organizations(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (error) onError(error.message)
    else setPayments((data ?? []) as Payment[])
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  async function openReceipt(path: string | null) {
    if (!path) return
    const { data, error } = await supabase.storage.from('subs').createSignedUrl(path, 300)
    if (error) return onError(error.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function approve(id: string) {
    setBusyId(id)
    const { error } = await supabase.rpc('approve_subscription_payment', { p_payment_id: id })
    setBusyId(null)
    if (error) onError(error.message)
    else await load()
  }

  async function reject(id: string) {
    const note = window.prompt('Motivo del rechazo (opcional):') ?? ''
    setBusyId(id)
    const { error } = await supabase.rpc('reject_subscription_payment', { p_payment_id: id, p_note: note })
    setBusyId(null)
    if (error) onError(error.message)
    else await load()
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {payments.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-zinc-500">No hay pagos pendientes.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-400">
              <th className="px-5 py-3 font-medium">Organización</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 font-medium">Monto</th>
              <th className="px-5 py-3 font-medium">Método / Ref.</th>
              <th className="px-5 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {payments.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-zinc-900">{orgLabel(p.organizations)}</p>
                  <p className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleDateString('es-VE')}</p>
                </td>
                <td className="px-5 py-3.5 capitalize text-zinc-700">
                  {PLAN_LABEL[p.plan] ?? p.plan}
                  <span className="text-xs text-zinc-500"> · {p.period_months} mes(es)</span>
                </td>
                <td className="px-5 py-3.5 font-semibold text-zinc-900">${Number(p.amount_usd).toFixed(0)}</td>
                <td className="px-5 py-3.5 text-zinc-600">
                  <p>{p.method ?? '—'}</p>
                  {p.reference && <p className="text-xs text-zinc-500">{p.reference}</p>}
                  {p.receipt_path && (
                    <button type="button" onClick={() => openReceipt(p.receipt_path)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
                      Ver comprobante <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" disabled={busyId === p.id} onClick={() => approve(p.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50">
                      Aprobar
                    </button>
                    <button type="button" disabled={busyId === p.id} onClick={() => reject(p.id)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                      Rechazar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SUPERADMINS: dueños de la plataforma.
// ---------------------------------------------------------------------------
type PlatformAdmin = { user_id: string; email: string; created_at: string }

function SuperadminsTab({ onError }: { onError: (m: string) => void }) {
  const [admins, setAdmins] = useState<PlatformAdmin[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_platform_admins')
    if (error) onError(error.message)
    else setAdmins((data ?? []) as PlatformAdmin[])
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    if (!email.trim()) return
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('add_platform_admin', { p_email: email.trim() })
    setBusy(false)
    if (error) return onError(error.message)
    if (data === false) {
      setMsg('No existe un usuario con ese correo. Debe registrarse primero.')
      return
    }
    setEmail('')
    await load()
  }

  async function remove(a: PlatformAdmin) {
    if (!window.confirm(`¿Quitar a ${a.email} como superadmin?`)) return
    const { error } = await supabase.rpc('remove_platform_admin', { p_user: a.user_id })
    if (error) onError(error.message)
    else await load()
  }

  return (
    <div className="max-w-2xl">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-zinc-100">
            {admins.map((a) => (
              <tr key={a.user_id}>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-zinc-900">{a.email}</p>
                  <p className="text-xs text-zinc-500">Desde {new Date(a.created_at).toLocaleDateString('es-VE')}</p>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button type="button" onClick={() => remove(a)} aria-label="Quitar superadmin" className="text-zinc-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-4">
        <p className="text-sm font-medium text-zinc-800">Agregar superadmin</p>
        <p className="mt-1 text-xs text-zinc-500">El usuario debe tener ya una cuenta (correo registrado).</p>
        <div className="mt-3 flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="correo@ejemplo.com" className={`${inputCls} flex-1`} />
          <button type="button" onClick={add} disabled={busy || !email.trim()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50">
            {busy ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-amber-700">{msg}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DATOS DE PAGO DE LA PLATAFORMA (donde las organizaciones transfieren).
// ---------------------------------------------------------------------------
type PayMethod = { id: string; name: string; details: Record<string, string>; is_active: boolean }

function PlatformMethods({ onError }: { onError: (m: string) => void }) {
  const [methods, setMethods] = useState<PayMethod[]>([])
  const [name, setName] = useState('')
  const [rows, setRows] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('platform_payment_methods').select('id, name, details, is_active').order('created_at')
    if (error) onError(error.message)
    else setMethods((data ?? []) as PayMethod[])
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    if (!name.trim()) return
    setSaving(true)
    const details: Record<string, string> = {}
    for (const r of rows) if (r.key.trim() && r.value.trim()) details[r.key.trim()] = r.value.trim()
    const { error } = await supabase.from('platform_payment_methods').insert({ name: name.trim(), details, is_active: true })
    setSaving(false)
    if (error) return onError(error.message)
    setName('')
    setRows([{ key: '', value: '' }])
    await load()
  }

  async function toggle(m: PayMethod) {
    const { error } = await supabase.from('platform_payment_methods').update({ is_active: !m.is_active }).eq('id', m.id)
    if (error) onError(error.message)
    else await load()
  }

  async function remove(m: PayMethod) {
    const { error } = await supabase.from('platform_payment_methods').delete().eq('id', m.id)
    if (error) onError(error.message)
    else await load()
  }

  return (
    <section className="max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-2">
        {methods.map((m) => (
          <div key={m.id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <p className="font-medium text-zinc-900">{m.name}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggle(m)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${m.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {m.is_active ? 'Activo' : 'Inactivo'}
                </button>
                <button type="button" onClick={() => remove(m)} aria-label="Eliminar" className="text-zinc-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <dl className="mt-2 grid gap-0.5 text-xs text-zinc-600">
              {Object.entries(m.details ?? {}).map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                  <dt className="capitalize text-zinc-400">{k}:</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-4">
        <p className="text-sm font-medium text-zinc-800">Agregar método</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (Zelle, Binance…)" className={`${inputCls} mt-3`} />
        <div className="mt-3 grid gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input value={r.key} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="Dato (Correo, Titular…)" className={`${inputCls} flex-1`} />
              <input value={r.value} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Valor" className={`${inputCls} flex-1`} />
            </div>
          ))}
          <button type="button" onClick={() => setRows((rs) => [...rs, { key: '', value: '' }])} className="justify-self-start text-xs font-medium text-emerald-700 hover:underline">
            + Otro dato
          </button>
        </div>
        <button type="button" onClick={add} disabled={saving || !name.trim()} className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50">
          {saving ? 'Guardando…' : 'Agregar método'}
        </button>
      </div>
    </section>
  )
}
