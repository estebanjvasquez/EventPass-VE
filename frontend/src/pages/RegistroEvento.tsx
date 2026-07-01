import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, CalendarDays, CheckCircle2, Ticket } from 'lucide-react'
import { supabase } from '../lib/supabase'

type EventRow = {
  id: string
  organization_id: string
  name: string
  description: string | null
  start_date: string | null
  organizations: { name: string | null } | null
}

const schema = z.object({
  first_name: z.string().min(2, 'Ingresa tu nombre'),
  last_name: z.string().optional(),
  email: z.string().email('Correo inválido'),
  phone: z.string().min(7, 'Teléfono inválido'),
  cedula: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function RegistroEvento() {
  const { eventId } = useParams()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError(null)
      let query = supabase
        .from('events')
        .select('id, organization_id, name, description, start_date, organizations(name)')
        .eq('status', 'published')
      query = eventId
        ? query.eq('id', eventId)
        : query.order('created_at', { ascending: false })
      const { data, error } = await query.limit(1).maybeSingle()
      if (!active) return
      if (error) setLoadError(error.message)
      else setEvent(data as unknown as EventRow)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [eventId])

  async function onSubmit(values: FormValues) {
    if (!event) return
    setSubmitError(null)
    const { error } = await supabase.from('registrations').insert({
      organization_id: event.organization_id,
      event_id: event.id,
      first_name: values.first_name,
      last_name: values.last_name || null,
      email: values.email,
      phone: values.phone,
      cedula: values.cedula || null,
    })
    if (error) {
      setSubmitError(
        error.code === '23505'
          ? 'Ya existe un registro con ese correo para este evento.'
          : error.message,
      )
      return
    }

    // Dispara el correo con el enlace de carga de comprobante (Worker en
    // Cloudflare). Best-effort: un fallo de correo no bloquea el registro.
    const apiUrl = import.meta.env.VITE_API_URL
    if (apiUrl) {
      try {
        await fetch(`${apiUrl}/api/registrations/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: event.id, email: values.email }),
        })
      } catch {
        // El correo también puede reintentarse desde el panel admin.
      }
    }

    setDone(true)
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-emerald-400">
            <Ticket className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            EventPass <span className="text-emerald-600">VE</span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        {loading && <SkeletonForm />}

        {!loading && loadError && (
          <Notice
            title="No pudimos cargar el evento"
            body={loadError}
          />
        )}

        {!loading && !loadError && !event && (
          <Notice
            title="No hay un evento disponible"
            body="Aún no hay un evento publicado para registro. Vuelve más tarde."
          />
        )}

        {!loading && event && !done && (
          <div className="animate-float-up">
            <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
              {event.organizations?.name ?? 'Registro'}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              {event.name}
            </h1>
            {event.start_date && (
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-600">
                <CalendarDays className="h-4 w-4 text-zinc-400" />
                {new Date(event.start_date).toLocaleDateString('es-VE', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
            {event.description && (
              <p className="mt-4 max-w-xl leading-relaxed text-zinc-600">{event.description}</p>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-10 grid gap-5 sm:grid-cols-2">
              <FieldText label="Nombre" error={errors.first_name?.message} {...register('first_name')} />
              <FieldText label="Apellido" error={errors.last_name?.message} {...register('last_name')} />
              <FieldText label="Correo electrónico" type="email" error={errors.email?.message} {...register('email')} />
              <FieldText label="Teléfono" error={errors.phone?.message} {...register('phone')} />
              <div className="sm:col-span-2">
                <FieldText label="Cédula o pasaporte (opcional)" error={errors.cedula?.message} {...register('cedula')} />
              </div>

              {submitError && (
                <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </p>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {isSubmitting ? 'Enviando…' : 'Reservar mi plaza'}
                  {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                </button>
                <p className="mt-3 text-xs text-zinc-500">
                  Recibirás un correo con los datos de pago y el plazo para completar tu registro.
                </p>
              </div>
            </form>
          </div>
        )}

        {done && (
          <div className="animate-float-up rounded-2xl border border-emerald-200 bg-white p-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h2 className="mt-5 text-2xl font-bold text-zinc-900">¡Plaza reservada!</h2>
            <p className="mx-auto mt-3 max-w-md text-zinc-600">
              Te enviaremos un correo con los métodos de pago y el enlace para
              cargar tu comprobante. Tu plaza queda reservada mientras completas el pago.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

function FieldText({ label, error, ...props }: FieldProps) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
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

function SkeletonForm() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-32 rounded bg-zinc-200" />
      <div className="mt-3 h-9 w-2/3 rounded bg-zinc-200" />
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-zinc-200" />
        ))}
      </div>
    </div>
  )
}
