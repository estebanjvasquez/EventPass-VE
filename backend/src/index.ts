import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendUploadLinkEmail, type EmailSendBinding } from './email'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ENVIRONMENT: string
  EMAIL: EmailSendBinding // binding `send_email` de Cloudflare Email Sending
  EMAIL_FROM: string
  APP_BASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'eventpass-backend', env: c.env.ENVIRONMENT }),
)

// Ejemplo: cliente admin de Supabase (service role) por request.
// El aislamiento multi-tenant se aplica vía organization_id + RLS.
app.get('/api/events', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase.from('events').select('*').limit(20)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ events: data })
})

// ---------------------------------------------------------------------------
// Notificación post-registro: envía el correo con el enlace para cargar el
// comprobante. El frontend la invoca tras crear el registro (no dispone del
// credential_token por privacidad), así que el Worker lo resuelve con
// service-role y envía el correo a la dirección guardada en el registro.
// ---------------------------------------------------------------------------
const notifySchema = z.object({
  event_id: z.string().uuid(),
  email: z.string().email(),
})

app.post('/api/registrations/notify', async (c) => {
  const parsed = notifySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400)
  const { event_id, email } = parsed.data

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: reg, error } = await supabase
    .from('registrations')
    .select('id, first_name, credential_token, status, organization_id, events(name)')
    .eq('event_id', event_id)
    .eq('email', email)
    .maybeSingle()

  // Respuesta genérica: no revelamos si el correo existe o no.
  if (error || !reg) return c.json({ ok: true })
  // Si ya está confirmado, no reenviamos el enlace de carga.
  if (reg.status === 'confirmed') return c.json({ ok: true })

  const { data: methods } = await supabase
    .from('payment_methods')
    .select('name, details')
    .eq('organization_id', reg.organization_id)
    .eq('is_active', true)

  const eventName =
    (reg.events as { name?: string } | { name?: string }[] | null) == null
      ? 'Tu evento'
      : Array.isArray(reg.events)
        ? (reg.events[0]?.name ?? 'Tu evento')
        : ((reg.events as { name?: string }).name ?? 'Tu evento')

  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const sendError = await sendUploadLinkEmail({
    email: c.env.EMAIL,
    from: c.env.EMAIL_FROM,
    to: email,
    firstName: reg.first_name,
    eventName,
    uploadUrl: `${base}/comprobante/${reg.credential_token}`,
    paymentMethods: methods ?? [],
  })

  await supabase.from('email_log').insert({
    organization_id: reg.organization_id,
    registration_id: reg.id,
    email_type: 'upload_link',
    status: sendError ? 'failed' : 'sent',
    sent_at: sendError ? null : new Date().toISOString(),
  })

  if (sendError) {
    console.error('[notify] envío fallido:', sendError)
    return c.json({ ok: false }, 502)
  }
  return c.json({ ok: true })
})

export default {
  fetch: app.fetch,

  // Cron Trigger: recordatorios de pago + liberación de plazas vencidas.
  async scheduled(_event: ScheduledController, env: Bindings) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    // TODO: enviar recordatorios (días 3/7/9) y liberar plazas con paymentDeadline vencido.
    void supabase
  },
}
