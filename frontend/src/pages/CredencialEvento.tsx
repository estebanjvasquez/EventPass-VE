import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CalendarDays, Clock3, MapPin, Printer, Ticket } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Credential = {
  first_name: string
  last_name: string | null
  status: 'pending_payment' | 'payment_submitted' | 'confirmed' | 'rejected'
  event_name: string
  event_start: string | null
  org_name: string
  seat_label: string | null
  credential_token: string
}

export default function CredencialEvento() {
  const { token } = useParams()
  const [cred, setCred] = useState<Credential | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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
      const { data, error } = await supabase.rpc('get_credential_by_token', {
        p_token: token,
      })
      if (!active) return
      if (error) setLoadError(error.message)
      else setCred((data as Credential[] | null)?.[0] ?? null)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [token])

  const fullName = cred ? `${cred.first_name} ${cred.last_name ?? ''}`.trim() : ''

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] print:bg-white">
      <header className="border-b border-zinc-200/70 bg-white print:hidden">
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
          <Notice title="No pudimos cargar tu credencial" body={loadError} />
        )}

        {!loading && !loadError && !cred && (
          <Notice
            title="Credencial no encontrada"
            body="No hay un registro asociado a este enlace. Revisa el correo que te enviamos."
          />
        )}

        {!loading && cred && cred.status !== 'confirmed' && (
          <Notice
            title="Tu credencial aún no está disponible"
            body={
              cred.status === 'rejected'
                ? 'Este registro fue rechazado o su plazo de pago venció.'
                : 'Tu credencial se activa cuando confirmemos tu pago. Te avisaremos por correo.'
            }
          />
        )}

        {!loading && cred && cred.status === 'confirmed' && (
          <div className="animate-float-up">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="bg-zinc-900 px-6 py-5 text-white">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">
                  {cred.org_name}
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight">{cred.event_name}</h1>
              </div>

              <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Asistente
                  </p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{fullName}</p>

                  <dl className="mt-5 grid gap-2.5 text-sm">
                    {cred.event_start && (
                      <div className="flex items-center gap-2 text-zinc-600">
                        <CalendarDays className="h-4 w-4 text-zinc-400" />
                        {new Date(cred.event_start).toLocaleDateString('es-VE', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </div>
                    )}
                    {cred.event_start && (
                      <div className="flex items-center gap-2 text-zinc-600">
                        <Clock3 className="h-4 w-4 text-zinc-400" />
                        {new Date(cred.event_start).toLocaleTimeString('es-VE', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    )}
                    {cred.seat_label && (
                      <div className="flex items-center gap-2 text-zinc-600">
                        <MapPin className="h-4 w-4 text-zinc-400" />
                        Asiento {cred.seat_label}
                      </div>
                    )}
                  </dl>

                  <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    Confirmado
                  </span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-xl border border-zinc-200 bg-white p-3">
                    <QRCodeSVG
                      value={cred.credential_token}
                      size={148}
                      level="M"
                      marginSize={0}
                    />
                  </div>
                  <p className="text-center text-[11px] leading-tight text-zinc-400">
                    Presenta este código<br />en el ingreso
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 print:hidden"
            >
              <Printer className="h-4 w-4" />
              Guardar / imprimir
            </button>
          </div>
        )}
      </main>
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
    <div className="animate-pulse overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="h-20 bg-zinc-200" />
      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="h-8 w-2/3 rounded bg-zinc-200" />
          <div className="h-4 w-1/2 rounded bg-zinc-200" />
          <div className="h-4 w-1/3 rounded bg-zinc-200" />
        </div>
        <div className="h-40 w-40 rounded-xl bg-zinc-200" />
      </div>
    </div>
  )
}
