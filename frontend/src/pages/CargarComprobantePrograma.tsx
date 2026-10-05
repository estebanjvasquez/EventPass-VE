import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, FileUp, Ticket, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Order = { order_id: string; organization_id: string; program_id: string; program_name: string; first_name: string; status: string; total: number; currency: string; payment_deadline: string | null; has_comprobante: boolean; items: { name: string; price: number; currency: string }[] }
type PaymentMethod = { id: string; name: string; details: Record<string, unknown> }
const accepted = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const maxSize = 5 * 1024 * 1024

export default function CargarComprobantePrograma() {
  const { token } = useParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [method, setMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!token) { setError('Enlace inválido.'); setLoading(false); return }
      const response = await supabase.rpc('get_program_order_by_token', { p_token: token })
      if (!active) return
      if (response.error || !response.data) { setError(response.error?.message ?? 'No encontramos esta reserva.'); setLoading(false); return }
      const value = response.data as Order
      setOrder(value); setAmount(String(value.total))
      const paymentResult = await supabase.from('payment_methods').select('id,name,details').eq('organization_id', value.organization_id).eq('is_active', true)
      if (active) { setMethods((paymentResult.data ?? []) as PaymentMethod[]); if (paymentResult.data?.length === 1) setMethod(paymentResult.data[0].name); setLoading(false) }
    }
    void load(); return () => { active = false }
  }, [token])

  function pick(value: File | null) {
    setError(null)
    if (!value) { setFile(null); return }
    if (!accepted.includes(value.type)) { setError('Formato no admitido. Usa JPG, PNG, WEBP o PDF.'); return }
    if (value.size > maxSize) { setError('El archivo supera el límite de 5 MB.'); return }
    setFile(value)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!order || !file || !token) return
    setSubmitting(true); setError(null)
    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const path = `${order.organization_id}/${order.order_id}/${Date.now()}.${extension}`
    const upload = await supabase.storage.from('comprobantes').upload(path, file, { contentType: file.type, upsert: true })
    if (upload.error) { setError(`No pudimos subir el archivo: ${upload.error.message}`); setSubmitting(false); return }
    const response = await supabase.rpc('submit_program_comprobante', { p_token: token, p_path: path, p_method: method || null, p_amount: amount ? Number(amount) : null, p_currency: order.currency })
    setSubmitting(false)
    if (response.error) setError(response.error.message); else setDone(true)
  }

  if (loading) return <main className="grid min-h-[100dvh] place-items-center text-zinc-500">Cargando…</main>
  return <main className="min-h-[100dvh] bg-zinc-50 px-5 py-12"><section className="mx-auto max-w-2xl rounded-3xl border bg-white p-6 shadow-sm sm:p-10"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-900 text-emerald-400"><Ticket className="h-5 w-5" /></span><strong>EventosFácil</strong></div>
    {error && !order && <Notice title="No pudimos cargar la reserva" body={error} />}
    {order && done && <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-7 text-center text-emerald-900"><CheckCircle2 className="mx-auto h-10 w-10" /><h1 className="mt-3 text-2xl font-bold">Comprobante recibido</h1><p className="mt-2">El organizador revisará el pago y activará tu credencial única.</p><Link className="mt-5 inline-block font-semibold underline" to={`/p/${order.program_id}/registro`}>Volver al programa</Link></div>}
    {order && !done && order.status === 'confirmed' && <Notice title="Pago confirmado" body="Tu credencial ya está activa. Consulta el correo de confirmación o recupera tu registro." />}
    {order && !done && ['rejected', 'cancelled', 'expired'].includes(order.status) && <Notice title="Reserva no disponible" body={order.status === 'rejected' ? 'El comprobante fue rechazado. Contacta al organizador para conocer el motivo.' : 'Esta reserva ya no admite comprobantes.'} />}
    {order && !done && !['confirmed', 'rejected', 'cancelled', 'expired'].includes(order.status) && <><p className="mt-8 text-sm font-semibold uppercase tracking-wide text-emerald-700">{order.program_name}</p><h1 className="mt-2 text-3xl font-bold">Hola, {order.first_name}</h1><p className="mt-3 text-zinc-600">Carga el comprobante para completar los accesos seleccionados.{order.payment_deadline ? ` Plazo: ${new Date(order.payment_deadline).toLocaleString('es-VE')}.` : ''}</p>
      <div className="mt-6 rounded-xl bg-zinc-50 p-4"><ul className="space-y-2 text-sm">{order.items.map((item, index) => <li key={`${item.name}-${index}`} className="flex justify-between gap-3"><span>{item.name}</span><strong>{Number(item.price) === 0 ? 'Gratis' : new Intl.NumberFormat('es-VE', { style: 'currency', currency: item.currency }).format(item.price)}</strong></li>)}</ul><div className="mt-3 flex justify-between border-t pt-3 text-lg font-bold"><span>Total</span><span>{new Intl.NumberFormat('es-VE', { style: 'currency', currency: order.currency }).format(order.total)}</span></div></div>
      {methods.length > 0 && <div className="mt-6 rounded-xl border p-4"><h2 className="font-bold">Datos de pago</h2>{methods.map(item => <div key={item.id} className="mt-3 rounded-lg bg-zinc-50 p-3"><strong>{item.name}</strong>{Object.entries(item.details ?? {}).map(([key, value]) => <p key={key} className="text-sm text-zinc-600"><span className="capitalize">{key}</span>: {String(value)}</p>)}</div>)}</div>}
      <form className="mt-6 space-y-4" onSubmit={submit}>{methods.length > 0 && <label className="block text-sm font-medium">Método utilizado<select className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5" value={method} onChange={event => setMethod(event.target.value)}><option value="">Selecciona…</option>{methods.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>}<label className="block text-sm font-medium">Monto pagado<input className="mt-1 w-full rounded-lg border px-3 py-2.5" type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label><div><span className="text-sm font-medium">Comprobante</span><button type="button" onClick={() => inputRef.current?.click()} className="mt-2 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-7">{file ? <><FileUp className="h-6 w-6 text-emerald-700" /><strong>{file.name}</strong></> : <><UploadCloud className="h-6 w-6 text-zinc-400" /><span>Seleccionar JPG, PNG, WEBP o PDF</span></>}</button><input ref={inputRef} type="file" className="hidden" accept={accepted.join(',')} onChange={event => pick(event.target.files?.[0] ?? null)} /></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={!file || submitting} className="w-full rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{submitting ? 'Enviando…' : order.has_comprobante ? 'Reemplazar comprobante' : 'Enviar comprobante'}</button></form>
    </>}
  </section></main>
}

function Notice({ title, body }: { title: string; body: string }) { return <div className="mt-8 rounded-2xl border p-6"><h1 className="text-xl font-bold">{title}</h1><p className="mt-2 text-zinc-600">{body}</p></div> }
