import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, FileUp, Ticket, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'

type RegistrationByToken = {
  registration_id: string
  organization_id: string
  event_id: string
  first_name: string
  status: 'pending_payment' | 'payment_submitted' | 'confirmed' | 'rejected'
  has_comprobante: boolean
  payment_deadline: string | null
  event_name: string
}

type PaymentMethod = {
  id: string
  name: string
  details: Record<string, unknown>
}

const MAX_SIZE = 5 * 1024 * 1024 // 5 MiB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export default function CargarComprobante() {
  const { token } = useParams()
  const [reg, setReg] = useState<RegistrationByToken | null>(null)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [method, setMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError(null)
      if (!token) {
        setLoadError('Enlace inválido.')
        setLoading(false)
        return
      }
      const { data, error } = await supabase.rpc('get_registration_by_token', {
        p_token: token,
      })
      if (!active) return
      if (error) {
        setLoadError(error.message)
        setLoading(false)
        return
      }
      const row = (data as RegistrationByToken[] | null)?.[0] ?? null
      setReg(row)
      if (row) {
        const { data: pm } = await supabase
          .from('payment_methods')
          .select('id, name, details')
          .eq('organization_id', row.organization_id)
          .eq('is_active', true)
        if (active && pm) {
          const list = pm as PaymentMethod[]
          setMethods(list)
          if (list.length === 1) setMethod(list[0].name)
        }
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [token])

  function pickFile(f: File | null) {
    setSubmitError(null)
    if (!f) return setFile(null)
    if (!ACCEPTED.includes(f.type)) {
      setSubmitError('Formato no admitido. Usa JPG, PNG, WEBP o PDF.')
      return
    }
    if (f.size > MAX_SIZE) {
      setSubmitError('El archivo supera el límite de 5 MB.')
      return
    }
    setFile(f)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reg || !file || !token) return
    setSubmitError(null)
    setSubmitting(true)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const path = `${reg.organization_id}/${reg.registration_id}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('comprobantes')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (upErr) {
      setSubmitError(`No pudimos subir el archivo: ${upErr.message}`)
      setSubmitting(false)
      return
    }

    const { error: rpcErr } = await supabase.rpc('submit_comprobante', {
      p_token: token,
      p_path: path,
      p_method: method || null,
      p_amount: amount ? Number(amount) : null,
      p_currency: 'USD',
    })
    if (rpcErr) {
      setSubmitError(rpcErr.message)
      setSubmitting(false)
      return
    }
    setDone(true)
    setSubmitting(false)
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-emerald-400">
            <Ticket className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            EventPass <span className="text-emerald-600">VE</span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-12">
        {loading && <Skeleton />}

        {!loading && loadError && (
          <Notice title="No pudimos cargar tu registro" body={loadError} />
        )}

        {!loading && !loadError && !reg && (
          <Notice
            title="Enlace no válido"
            body="No encontramos un registro asociado a este enlace. Revisa el correo que te enviamos."
          />
        )}

        {!loading && reg && reg.status === 'confirmed' && !done && (
          <div className="animate-float-up rounded-2xl border border-emerald-200 bg-white p-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h2 className="mt-5 text-2xl font-bold text-zinc-900">Pago confirmado</h2>
            <p className="mx-auto mt-3 max-w-md text-zinc-600">
              Tu inscripción ya está confirmada. Ya puedes ver tu credencial con
              el código QR de ingreso.
            </p>
            <a
              href={`/credencial/${token}`}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
            >
              Ver mi credencial
            </a>
          </div>
        )}

        {!loading && reg && reg.status !== 'confirmed' && !done && (
          <div className="animate-float-up">
            <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
              {reg.event_name}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Hola, {reg.first_name}
            </h1>
            <p className="mt-3 max-w-xl leading-relaxed text-zinc-600">
              Carga tu comprobante de pago para que verifiquemos tu inscripción.
              {reg.payment_deadline && (
                <>
                  {' '}Tienes plazo hasta el{' '}
                  <span className="font-medium text-zinc-800">
                    {new Date(reg.payment_deadline).toLocaleDateString('es-VE', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  .
                </>
              )}
            </p>

            {reg.status === 'payment_submitted' && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Ya recibimos un comprobante y está en revisión. Si necesitas
                reemplazarlo, puedes cargar otro aquí.
              </p>
            )}

            {methods.length > 0 && (
              <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-sm font-semibold text-zinc-900">Datos de pago</p>
                <ul className="mt-3 grid gap-3">
                  {methods.map((m) => (
                    <li key={m.id} className="rounded-lg bg-zinc-50 px-4 py-3">
                      <p className="text-sm font-medium text-zinc-800">{m.name}</p>
                      <dl className="mt-1 grid gap-0.5 text-xs text-zinc-600">
                        {Object.entries(m.details ?? {}).map(([k, v]) => (
                          <div key={k} className="flex gap-1.5">
                            <dt className="capitalize text-zinc-400">{k}:</dt>
                            <dd className="text-zinc-700">{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-8 grid gap-5">
              {methods.length > 0 && (
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-zinc-800">Método utilizado</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Selecciona…</option>
                    {methods.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-800">Monto pagado (USD, opcional)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>

              <div>
                <span className="text-sm font-medium text-zinc-800">Comprobante</span>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-2 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white px-4 py-8 text-center transition-colors hover:border-emerald-400"
                >
                  {file ? (
                    <>
                      <FileUp className="h-6 w-6 text-emerald-600" />
                      <span className="text-sm font-medium text-zinc-800">{file.name}</span>
                      <span className="text-xs text-zinc-500">Toca para cambiar</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-6 w-6 text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-700">
                        Toca para seleccionar tu comprobante
                      </span>
                      <span className="text-xs text-zinc-500">JPG, PNG, WEBP o PDF · máx. 5 MB</span>
                    </>
                  )}
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  aria-label="Comprobante de pago"
                  accept={ACCEPTED.join(',')}
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {submitError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={!file || submitting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? 'Enviando…' : 'Enviar comprobante'}
              </button>
            </form>
          </div>
        )}

        {done && (
          <SuccessCard
            title="¡Comprobante recibido!"
            body="Lo revisaremos y te avisaremos por correo cuando tu inscripción quede confirmada."
          />
        )}
      </main>
    </div>
  )
}

function SuccessCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="animate-float-up rounded-2xl border border-emerald-200 bg-white p-8 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-8 w-8" />
      </span>
      <h2 className="mt-5 text-2xl font-bold text-zinc-900">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-zinc-600">{body}</p>
    </div>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8">
      <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
      <p className="mt-2 text-sm text-zinc-600">{body}</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-32 rounded bg-zinc-200" />
      <div className="mt-3 h-9 w-2/3 rounded bg-zinc-200" />
      <div className="mt-8 h-32 rounded-2xl bg-zinc-200" />
      <div className="mt-6 h-40 rounded-xl bg-zinc-200" />
    </div>
  )
}
