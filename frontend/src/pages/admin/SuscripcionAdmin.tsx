import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CreditCard, UploadCloud } from 'lucide-react'
import { resolveActiveOrg, setActiveOrg } from '../../lib/activeOrg'
import { supabase } from '../../lib/supabase'

type Plan = {
  plan: string
  name: string
  price_usd: number
  max_events: number | null
  max_regs_per_event: number | null
  capabilities?: Record<string, boolean>
  limits?: Record<string, number>
  sort_order: number
}
type PayMethod = { id: string; name: string; details: Record<string, string> }
type SubPayment = {
  id: string
  plan: string
  amount_usd: number
  status: string
  note: string | null
  created_at: string
}

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

const STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: 'En revisión', cls: 'bg-amber-100 text-amber-700' },
  approved: { text: 'Aprobado', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { text: 'Rechazado', cls: 'bg-red-100 text-red-700' },
}

function limitText(p: Plan): string {
  const ev = p.max_events == null ? 'Eventos ilimitados' : `${p.max_events} evento${p.max_events > 1 ? 's' : ''}`
  const rg = p.max_regs_per_event == null ? 'registros ilimitados' : `${p.max_regs_per_event} registros/evento`
  return `${ev} · ${rg}`
}

export default function SuscripcionAdmin() {
  const [organizations,setOrganizations]=useState<{id:string;name:string}[]>([])
  const [account, setAccount] = useState<{state:string; ends_at:string|null; limits:Record<string,number>; usage:Record<string,number>; events_used:number; plan:string; event_contracts:{event_id:string;ends_at:string}[]} | null>(null)
  const [notices, setNotices] = useState<{id:string;message:string}[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [currentPlan, setCurrentPlan] = useState<string>('arranque')
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [eventsUsed, setEventsUsed] = useState(0)
  const [plans, setPlans] = useState<Plan[]>([])
  const [methods, setMethods] = useState<PayMethod[]>([])
  const [payments, setPayments] = useState<SubPayment[]>([])
  const [selected, setSelected] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const {data:{user}}=await supabase.auth.getUser()
    if(user){const memberships=await supabase.from('memberships').select('organization_id,organizations(name)').eq('user_id',user.id);setOrganizations((memberships.data??[]).map(m=>({id:m.organization_id,name:(Array.isArray(m.organizations)?m.organizations[0]:m.organizations)?.name??m.organization_id})))}
    const active = await resolveActiveOrg()
    if (!active) { setError('Sin organización asociada.'); setLoading(false); return }
    const m = {organization_id: active.organization_id}
    setOrgId(m.organization_id)
    const [{data: accountData, error: accountError}, {data: noticeData}] = await Promise.all([
      supabase.rpc('commercial_account',{p_org:m.organization_id}),
      supabase.from('commercial_notifications').select('id,message').eq('organization_id',m.organization_id).order('created_at',{ascending:false}).limit(5),
    ])
    if(accountError) {setError(accountError.message);setLoading(false);return}
    setAccount(accountData)
    setCurrentPlan(accountData.plan)
    setNotices(noticeData??[])
    const [{ data: plansData }, { data: sub }, { count }, { data: pm }, { data: pays }] = await Promise.all([
      supabase.from('offer_versions').select('*').eq('modality','monthly').eq('active',true).order('price_usd'),
      supabase
        .from('subscriptions')
        .select('current_period_end')
        .eq('organization_id', m.organization_id)
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', m.organization_id)
        .neq('status', 'archived'),
      supabase.from('platform_payment_methods').select('id, name, details').eq('is_active', true),
      supabase
        .from('subscription_payments')
        .select('id, plan, amount_usd, status, note, created_at')
        .eq('organization_id', m.organization_id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    const activeCodes=await supabase.from('plans').select('plan').eq('is_active',true)
    setPlans((plansData ?? []).filter(p=>(activeCodes.data??[]).some(a=>a.plan===p.plan)).map(p=>({...p,max_events:p.limits.events,max_regs_per_event:p.limits.participants_event})) as Plan[])
    setPeriodEnd(accountData.ends_at ?? (sub?.current_period_end as string | null) ?? null)
    setEventsUsed(count ?? 0)
    setMethods((pm ?? []) as PayMethod[])
    setPayments((pays ?? []) as SubPayment[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(()=>void load(),30000)
    return ()=>window.clearInterval(timer)
  }, [load])

  const currentOffer=plans.find(p=>p.plan===currentPlan)
  const activePlan=currentOffer?{...currentOffer,max_events:account?.limits.events??null,max_regs_per_event:account?.limits.participants_event??null}:undefined
  const pending = payments.find((p) => p.status === 'pending')

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" />
            Registros
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            Suscripción
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        {organizations.length>1 && <label className="mb-5 block text-sm">Organización de facturación<select className={inputCls} value={orgId??''} onChange={e=>{setSelected(null);setActiveOrg(e.target.value);void load()}}>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
        {error && <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-white" />
        ) : (
          <>
            <div className="mb-5 rounded-xl border bg-white p-4 text-sm"><b>Estado: {account?.state === 'trial' ? 'Prueba de 14 días' : account?.state === 'read_only' ? 'Sólo lectura: renueva para operar' : account?.state === 'legacy' ? 'Condiciones anteriores preservadas' : account?.state === 'suspended' ? 'Suspendida' : 'Contrato activo'}</b><p className="mt-2">Cuotas y módulos según contrato. Equipos, consumibles y operación presencial se cotizan por separado. Consulta y exportación se conservan al vencer.</p>{account?.event_contracts?.map(c=><p key={c.event_id}>Contrato por evento {c.event_id.slice(0,8)}: hasta {new Date(c.ends_at).toLocaleDateString('es-VE')}</p>)}</div>
            {notices.map(n=><p key={n.id} className="mb-3 rounded-lg bg-sky-50 p-3 text-sm">{n.message}</p>)}
            <div className="mb-5 grid gap-2 sm:grid-cols-3">{Object.entries(account?.usage??{}).map(([key,used])=>{const max=account?.limits?.[key];const ratio=max?used/max:0;return <p key={key} className={ratio>=.8?'rounded-lg bg-amber-50 p-3 text-sm text-amber-800':'rounded-lg border bg-white p-3 text-sm'}>{{events:'Eventos',users:'Usuarios',stations:'Estaciones (8 h)',access_points:'Puntos de acceso',companies:'Expositores',participants_month:'Participantes del mes'}[key]??key}: {used} / {max??'Condiciones previas'} {ratio>=.95?'· Cuota al 95% o más: solicita ampliación':ratio>=.8?'· Cuota al 80% o más':''}</p>})}</div>
            {/* Plan actual */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-500">Plan actual</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{account?.state==='event_only'?'Evento Acompañado':activePlan?.name ?? currentPlan}</p>
                  {activePlan && account?.state!=='read_only' && <p className="mt-1 text-sm text-zinc-600">{limitText(activePlan)}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm text-zinc-500">Vigente hasta</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">
                    {periodEnd ? new Date(periodEnd).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>
              {activePlan?.max_events != null && (
                <div className="mt-5">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Eventos usados</span>
                    <span>
                      {eventsUsed} / {activePlan.max_events}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (eventsUsed / activePlan.max_events) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {pending && (
              <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Tienes un pago <strong>en revisión</strong> para el plan{' '}
                {plans.find((p) => p.plan === pending.plan)?.name ?? pending.plan}. Consulta aquí la resolución. Plazo objetivo de revisión: un día laboral.
              </p>
            )}

            {/* Planes disponibles */}
            <h2 className="mt-10 text-lg font-semibold text-zinc-900">Planes</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {plans.map((p) => {
                const isCurrent = p.plan === currentPlan
                return (
                  <div key={p.plan} className={`rounded-xl border p-5 ${isCurrent ? 'border-emerald-400 bg-emerald-50/40' : 'border-zinc-200 bg-white'}`}>
                    <p className="font-semibold text-zinc-900">{p.name}</p>
                    <p className="mt-2 text-2xl font-bold text-zinc-900">
                      ${Number(p.price_usd).toFixed(0)}
                      <span className="text-sm font-normal text-zinc-500">/mes</span>
                    </p>
                    <p className="mt-2 text-xs text-zinc-600">{limitText(p)}</p><p className="mt-2 text-xs">{Object.entries(p.capabilities??{}).filter(([,enabled])=>enabled).map(([key])=>({core:'Registro y acreditación',programs:'Programas',exposure:'Exposición',leads:'Visitas con permiso',sponsorship:'Patrocinio',campaigns:'Campañas',print_batches:'Lotes'}[key]??key)).join(' · ')}</p><p className="mt-2 text-xs">{p.limits?.users} usuarios · {p.limits?.stations} estaciones · {p.limits?.participants_month} participantes nuevos/mes</p>
                    <button
                      type="button"
                      disabled={!!pending || methods.length === 0 || account?.state === 'suspended'}
                      onClick={() => setSelected(p)}
                      className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:bg-zinc-200 disabled:text-zinc-500"
                    >
                      {isCurrent ? (account?.state==='active' ? 'Renovar' : 'Contratar') : 'Cambiar plan'}
                    </button>
                  </div>
                )
              })}
            </div>

            {methods.length===0 && <p className="mt-4 text-sm text-amber-800">Contratación temporalmente no disponible: faltan medios de pago activos. <Link to="/demo" className="underline">Solicita atención comercial</Link>.</p>}
            <p className="mt-5 text-sm">Para una edición con acompañamiento, <Link to="/demo" className="text-emerald-700 underline">solicita Evento Acompañado</Link>. El contrato indica fechas, soporte y exclusiones.</p>
            {/* Historial */}
            {payments.length > 0 && (
              <>
                <h2 className="mt-10 text-lg font-semibold text-zinc-900">Historial de pagos</h2>
                <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-zinc-100">
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-5 py-3 font-medium text-zinc-900">{plans.find((x) => x.plan === p.plan)?.name ?? p.plan}</td>
                          <td className="px-5 py-3 text-zinc-600">${Number(p.amount_usd).toFixed(2)}{p.status==='approved' && <button className="ml-2 underline" onClick={()=>{const blob=new Blob([`Recibo no fiscal — EventosFácil\nPago: ${p.id}\nPlan: ${p.plan}\nMonto USD: ${p.amount_usd}\nEstado: aprobado`],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`recibo-${p.id}.txt`;a.click();URL.revokeObjectURL(url)}}>Recibo</button>}</td>
                          <td className="px-5 py-3 text-zinc-500">{new Date(p.created_at).toLocaleDateString('es-VE')}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[p.status]?.cls ?? ''}`}>
                              {STATUS[p.status]?.text ?? p.status}{p.note && <span className="ml-2">{p.note}</span>}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {selected && orgId && (
        <PaymentModal
          plan={selected}
          orgId={orgId}
          methods={methods}
          onClose={() => setSelected(null)}
          onDone={async () => {
            setSelected(null)
            await load()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de pago: muestra los datos de pago de la plataforma y sube el comprobante.
// ---------------------------------------------------------------------------
function PaymentModal({
  plan,
  orgId,
  methods,
  onClose,
  onDone,
  onError,
}: {
  plan: Plan
  orgId: string
  methods: PayMethod[]
  onClose: () => void
  onDone: () => void
  onError: (m: string) => void
}) {
  const [accepted,setAccepted]=useState(false)
  const [months, setMonths] = useState(1)
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState(methods[0]?.id ?? '')
  const [quote, setQuote] = useState<{id:string;amount_usd:number;starts_at:string;ends_at:string;action:string;expires_at:string}|null>(null)
  const [quoteError, setQuoteError] = useState('')
  useEffect(()=>{let active=true;setQuote(null);setQuoteError('');void supabase.rpc('quote_subscription',{p_org:orgId,p_plan:plan.plan,p_months:months}).then(({data,error})=>{if(!active)return;if(error)setQuoteError(error.message);else setQuote(data)});return()=>{active=false}},[orgId,plan.plan,months])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const total = Number(quote?.amount_usd ?? 0)

  async function submit() {
    if(!accepted)return onError('Acepta las condiciones vigentes de contratación.')
    if (!quote || new Date(quote.expires_at).getTime()<Date.now()) return onError('La cotización expiró. Cierra y vuelve a cotizar.')
    if (!methods.some(m=>m.id===method) || reference.trim().length<3) return onError('Selecciona un medio activo e indica la referencia.')
    if (!file || file.size>5242880 || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) return onError('Adjunta una imagen o PDF de hasta 5 MB.')
    setBusy(true)
    try {
      const ext = file.name.split('.').pop() ?? 'dat'
      const path = `${orgId}/${Date.now()}.${ext}`
      const up = await supabase.storage.from('subs').upload(path, file, { upsert: false })
      if (up.error) throw new Error(up.error.message)

      const terms=await supabase.rpc('accept_commercial_terms',{p_org:orgId,p_version:'2026-10-14'})
      if(terms.error)throw new Error(terms.error.message)
      const { error } = await supabase.rpc('submit_subscription_quote', {
        p_quote:quote.id,p_method_id:method,p_reference:reference,p_receipt_path:path,
      })
      if (error) throw new Error(error.message)
      await onDone()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo enviar el pago.')
    } finally {setBusy(false)}
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-5 py-8" onClick={()=>{if(!busy)onClose()}}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-900">Pagar plan {plan.name}</h2>
        <p className="mt-1 text-sm text-zinc-600">Transfiere el monto y sube el comprobante. Activamos el plan tras verificarlo.</p>

        {quoteError && <p role="alert" className="mt-4 text-red-700">{quoteError}</p>}{quote && <p className="mt-3 text-sm">Vigencia prevista: {new Date(quote.starts_at).toLocaleDateString('es-VE')} — {new Date(quote.ends_at).toLocaleDateString('es-VE')}. {quote.action==='upgrade'?'Incluye diferencia proporcional del período vigente.':quote.action==='downgrade'?'Cambio al terminar el período pagado.':''} Cotización válida durante 30 minutos.</p>}
        <label className="mt-5 flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-800">Período</span>
          <select disabled={busy} value={months} onChange={(e) => setMonths(Number(e.target.value))} className={inputCls}>
            <option value={1}>1 mes</option>
            <option value={3}>3 meses</option>
            <option value={12}>12 meses</option>
          </select>
        </label>

        <div className="mt-4 rounded-lg bg-zinc-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">Cotización del servidor (USD)</span>
            <span className="text-xl font-bold text-zinc-900">${total.toFixed(2)}</span>
          </div>
          {methods.length === 0 ? (
            <p className="mt-3 text-sm text-amber-700">Aún no hay datos de pago configurados. Contáctanos.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {methods.map((mm) => (
                <div key={mm.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                  <p className="text-sm font-semibold text-zinc-900">{mm.name}</p>
                  <dl className="mt-1 grid gap-0.5 text-xs text-zinc-600">
                    {Object.entries(mm.details ?? {}).map(([k, v]) => (
                      <div key={k} className="flex gap-1.5">
                        <dt className="capitalize text-zinc-400">{k}:</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-800">Método usado</span>
          <select disabled={busy} value={method} onChange={(e)=>setMethod(e.target.value)} className={inputCls}>{methods.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </label>
        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-800">Referencia obligatoria</span>
          <input disabled={busy} value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} placeholder="N.º de operación / correo" />
        </label>
        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-800">Comprobante</span>
          <input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
        </label>

        <label className="mt-4 flex gap-2 text-sm"><input required type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Acepto las <Link target="_blank" to="/terminos" className="underline">condiciones</Link> y <Link target="_blank" to="/privacidad" className="underline">privacidad</Link>, versión 2026-10-14.</span></label>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={submit} disabled={busy || !quote || !methods.length} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60">
            {busy ? 'Enviando…' : 'Enviar pago'}
            {!busy && <UploadCloud className="h-4 w-4" />}
          </button>
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
