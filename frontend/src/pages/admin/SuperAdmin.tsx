import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Trash2, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type OrgRef = { name: string; slug: string } | { name: string; slug: string }[] | null
type Payment = {
  id: string
  organization_id: string
  plan: string
  amount_usd: number
  method: string | null
  reference: string | null
  receipt_path: string | null
  period_months: number
  status: string
  created_at: string
  organizations: OrgRef
}
type PayMethod = { id: string; name: string; details: Record<string, string>; is_active: boolean }

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

function orgName(o: OrgRef): string {
  const row = Array.isArray(o) ? o[0] : o
  return row?.name ?? '—'
}

export default function SuperAdmin() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadPayments = useCallback(async () => {
    const { data, error } = await supabase
      .from('subscription_payments')
      .select('id, organization_id, plan, amount_usd, method, reference, receipt_path, period_months, status, created_at, organizations(name, slug)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setPayments((data ?? []) as Payment[])
  }, [])

  useEffect(() => {
    supabase.rpc('is_platform_admin').then(async ({ data }) => {
      if (data === true) {
        setAllowed(true)
        await loadPayments()
      } else {
        setAllowed(false)
      }
    })
  }, [loadPayments])

  async function openReceipt(path: string | null) {
    if (!path) return
    const { data, error } = await supabase.storage.from('subs').createSignedUrl(path, 300)
    if (error) return setError(error.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function approve(p: Payment) {
    setBusyId(p.id)
    const { error } = await supabase.rpc('approve_subscription_payment', { p_payment_id: p.id })
    setBusyId(null)
    if (error) setError(error.message)
    else await loadPayments()
  }

  async function reject(p: Payment) {
    const note = window.prompt('Motivo del rechazo (opcional):') ?? ''
    setBusyId(p.id)
    const { error } = await supabase.rpc('reject_subscription_payment', { p_payment_id: p.id, p_note: note })
    setBusyId(null)
    if (error) setError(error.message)
    else await loadPayments()
  }

  if (allowed === null) return <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa]"><span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600" /></div>
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

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
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

      <main className="mx-auto max-w-5xl px-5 py-8">
        {error && <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Pagos por aprobar</h1>
        <p className="mt-1 text-sm text-zinc-600">Verifica el comprobante y activa la suscripción.</p>

        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
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
                      <p className="font-medium text-zinc-900">{orgName(p.organizations)}</p>
                      <p className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleDateString('es-VE')}</p>
                    </td>
                    <td className="px-5 py-3.5 capitalize text-zinc-700">
                      {p.plan}
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
                        <button type="button" disabled={busyId === p.id} onClick={() => approve(p)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50">
                          Aprobar
                        </button>
                        <button type="button" disabled={busyId === p.id} onClick={() => reject(p)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
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

        <PlatformMethods onError={setError} />
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Datos de pago de la plataforma (donde las organizaciones transfieren).
// ---------------------------------------------------------------------------
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
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-900">Datos de pago de la plataforma</h2>
      <p className="mt-1 text-sm text-zinc-600">Los verán las organizaciones al pagar su plan.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
