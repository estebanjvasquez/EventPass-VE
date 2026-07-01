import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Armchair, ArrowLeft, CalendarCog, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

type EventType = 'forum' | 'workshop' | 'social'
type EventStatus = 'draft' | 'published' | 'closed' | 'archived'

type EventRow = {
  id: string
  name: string
  description: string | null
  event_type: EventType
  status: EventStatus
  start_date: string | null
  end_date: string | null
  registration_deadline: string | null
  payment_timeout_days: number
  total_slots: number
}

const TYPE_LABEL: Record<EventType, string> = {
  forum: 'Foro',
  workshop: 'Taller',
  social: 'Social',
}
const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  closed: 'Cerrado',
  archived: 'Archivado',
}
const STATUS_STYLE: Record<EventStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  published: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-amber-100 text-amber-700',
  archived: 'bg-zinc-100 text-zinc-400',
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null
}

export default function EventosAdmin() {
  const { user } = useAuth()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string>('')
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EventRow | 'new' | null>(null)

  const loadEvents = useCallback(async (org: string) => {
    const { data, error } = await supabase
      .from('events')
      .select(
        'id, name, description, event_type, status, start_date, end_date, registration_deadline, payment_timeout_days, total_slots',
      )
      .eq('organization_id', org)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setEvents((data ?? []) as EventRow[])
  }, [])

  useEffect(() => {
    let active = true
    async function init() {
      setLoading(true)
      setError(null)
      const { data: mem, error: memErr } = await supabase
        .from('memberships')
        .select('organization_id, organizations(name)')
        .limit(1)
        .maybeSingle()
      if (!active) return
      if (memErr || !mem) {
        setError(memErr?.message ?? 'Sin organización asociada.')
        setLoading(false)
        return
      }
      const m = mem as {
        organization_id: string
        organizations: { name: string | null } | { name: string | null }[] | null
      }
      const orgs = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
      setOrgId(m.organization_id)
      setOrgName(orgs?.name ?? 'Mi organización')
      await loadEvents(m.organization_id)
      if (active) setLoading(false)
    }
    init()
    return () => {
      active = false
    }
  }, [loadEvents])

  async function changeStatus(ev: EventRow, status: EventStatus) {
    if (!orgId) return
    const { error } = await supabase.from('events').update({ status }).eq('id', ev.id)
    if (error) setError(error.message)
    else await loadEvents(orgId)
  }

  async function remove(ev: EventRow) {
    if (!orgId) return
    if (!window.confirm(`¿Eliminar el evento "${ev.name}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('events').delete().eq('id', ev.id)
    if (error) setError(error.message)
    else await loadEvents(orgId)
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" />
            Registros
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <CalendarCog className="h-4 w-4 text-emerald-600" />
            Eventos
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Eventos</h1>
            <p className="mt-1 text-sm text-zinc-600">{orgName}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            disabled={!orgId}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Nuevo evento
          </button>
        </div>

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        {editing && orgId && (
          <EventForm
            orgId={orgId}
            userId={user?.id ?? null}
            event={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null)
              await loadEvents(orgId)
            }}
          />
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {loading ? (
            <div className="divide-y divide-zinc-100">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse bg-white" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">
              Aún no has creado eventos. Empieza con “Nuevo evento”.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-400">
                  <th className="px-5 py-3 font-medium">Evento</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {events.map((ev) => (
                  <tr key={ev.id} className="transition-colors hover:bg-zinc-50">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-zinc-900">{ev.name}</p>
                      <p className="text-xs text-zinc-500">
                        {TYPE_LABEL[ev.event_type]} · {ev.total_slots || '∞'} cupos
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-600">
                      {ev.start_date
                        ? new Date(ev.start_date).toLocaleDateString('es-VE', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[ev.status]}`}>
                        {STATUS_LABEL[ev.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {ev.status !== 'published' ? (
                          <button
                            type="button"
                            onClick={() => changeStatus(ev, 'published')}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-transform active:scale-[0.98]"
                          >
                            Publicar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => changeStatus(ev, 'closed')}
                            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-amber-300 hover:text-amber-700"
                          >
                            Cerrar
                          </button>
                        )}
                        <Link
                          to={`/admin/asientos/${ev.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-400"
                        >
                          <Armchair className="h-3.5 w-3.5" />
                          Asientos
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditing(ev)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-400"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(ev)}
                          aria-label="Eliminar evento"
                          className="rounded-lg border border-zinc-300 p-1.5 text-zinc-500 transition-colors hover:border-red-300 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {orgId && <PaymentMethodsSection orgId={orgId} onError={setError} />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formulario de creación / edición de evento
// ---------------------------------------------------------------------------
function EventForm({
  orgId,
  userId,
  event,
  onClose,
  onSaved,
}: {
  orgId: string
  userId: string | null
  event: EventRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: event?.name ?? '',
    description: event?.description ?? '',
    event_type: event?.event_type ?? ('forum' as EventType),
    status: event?.status ?? ('draft' as EventStatus),
    start_date: toLocalInput(event?.start_date ?? null),
    end_date: toLocalInput(event?.end_date ?? null),
    registration_deadline: toLocalInput(event?.registration_deadline ?? null),
    payment_timeout_days: event?.payment_timeout_days ?? 10,
    total_slots: event?.total_slots ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      event_type: form.event_type,
      status: form.status,
      start_date: fromLocalInput(form.start_date),
      end_date: fromLocalInput(form.end_date),
      registration_deadline: fromLocalInput(form.registration_deadline),
      payment_timeout_days: Number(form.payment_timeout_days) || 10,
      total_slots: Number(form.total_slots) || 0,
    }
    const { error } = event
      ? await supabase.from('events').update(payload).eq('id', event.id)
      : await supabase.from('events').insert({ ...payload, organization_id: orgId, created_by: userId })
    setSaving(false)
    if (error) setFormError(error.message)
    else onSaved()
  }

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-zinc-900">{event ? 'Editar evento' : 'Nuevo evento'}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={inputCls} />
        </Field>
        <Field label="Tipo">
          <select value={form.event_type} onChange={(e) => set('event_type', e.target.value as EventType)} className={inputCls}>
            <option value="forum">Foro</option>
            <option value="workshop">Taller</option>
            <option value="social">Social</option>
          </select>
        </Field>
        <Field label="Estado">
          <select value={form.status} onChange={(e) => set('status', e.target.value as EventStatus)} className={inputCls}>
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
            <option value="closed">Cerrado</option>
            <option value="archived">Archivado</option>
          </select>
        </Field>
        <Field label="Inicio">
          <input type="datetime-local" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Fin">
          <input type="datetime-local" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Cierre de inscripción">
          <input type="datetime-local" value={form.registration_deadline} onChange={(e) => set('registration_deadline', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Plazo de pago (días)">
          <input type="number" min={1} value={form.payment_timeout_days} onChange={(e) => set('payment_timeout_days', Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Cupos (0 = ilimitado)">
          <input type="number" min={0} value={form.total_slots} onChange={(e) => set('total_slots', Number(e.target.value))} className={inputCls} />
        </Field>
      </div>

      {formError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}

      <div className="mt-6 flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Métodos de pago de la organización
// ---------------------------------------------------------------------------
type PMRow = { id: string; name: string; details: Record<string, string>; is_active: boolean }

function PaymentMethodsSection({ orgId, onError }: { orgId: string; onError: (m: string) => void }) {
  const [methods, setMethods] = useState<PMRow[]>([])
  const [name, setName] = useState('')
  const [rows, setRows] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('id, name, details, is_active')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
    if (error) onError(error.message)
    else setMethods((data ?? []) as PMRow[])
  }, [orgId, onError])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    if (!name.trim()) return
    setSaving(true)
    const details: Record<string, string> = {}
    for (const r of rows) if (r.key.trim() && r.value.trim()) details[r.key.trim()] = r.value.trim()
    const { error } = await supabase.from('payment_methods').insert({
      organization_id: orgId,
      name: name.trim(),
      details,
      is_active: true,
    })
    setSaving(false)
    if (error) return onError(error.message)
    setName('')
    setRows([{ key: '', value: '' }])
    await load()
  }

  async function toggle(m: PMRow) {
    const { error } = await supabase.from('payment_methods').update({ is_active: !m.is_active }).eq('id', m.id)
    if (error) onError(error.message)
    else await load()
  }

  async function remove(m: PMRow) {
    const { error } = await supabase.from('payment_methods').delete().eq('id', m.id)
    if (error) onError(error.message)
    else await load()
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-900">Métodos de pago</h2>
      <p className="mt-1 text-sm text-zinc-600">Se muestran al asistente en la página de carga de comprobante.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {methods.map((m) => (
          <div key={m.id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <p className="font-medium text-zinc-900">{m.name}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(m)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${m.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}
                >
                  {m.is_active ? 'Activo' : 'Inactivo'}
                </button>
                <button type="button" onClick={() => remove(m)} aria-label="Eliminar método" className="text-zinc-400 hover:text-red-600">
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
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (Zelle, Pago Móvil, Binance…)"
          className={`${inputCls} mt-3`}
        />
        <div className="mt-3 grid gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={r.key}
                onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                placeholder="Dato (Banco, Cuenta, Titular…)"
                className={`${inputCls} flex-1`}
              />
              <input
                value={r.value}
                onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                placeholder="Valor"
                className={`${inputCls} flex-1`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { key: '', value: '' }])}
            className="justify-self-start text-xs font-medium text-emerald-700 hover:underline"
          >
            + Otro dato
          </button>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={saving || !name.trim()}
          className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Agregar método'}
        </button>
      </div>
    </section>
  )
}

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-2 ${className ?? ''}`}>
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      {children}
    </label>
  )
}
