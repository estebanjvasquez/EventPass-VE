import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendUploadLinkEmail, sendConfirmationEmail, sendPortalInviteEmail, sendProviderNoticeEmail, type EmailSendBinding, type EventEmailContext } from './email'
import { runScheduledJobs } from './jobs'
import { normalizeSlug, provisionDomain, getDomainStatus, type CfEnv } from './tenants'
import { forumLayoutIntentJsonSchema, forumLayoutIntentSchema, generateForumPlan } from './forumFloorplan'
import { arrayBufferToDataUrl, exhibitionDetectionJsonSchema, exhibitionDetectionSchema, normalizeExhibitionDetection } from './exhibitionImport'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ENVIRONMENT: string
  EMAIL: EmailSendBinding // binding `send_email` de Cloudflare Email Sending
  EMAIL_FROM: string
  APP_BASE_URL: string
  CRON_SECRET?: string // habilita el disparo manual de las tareas programadas
  // Aprovisionamiento de subdominios de tenant (Cloudflare Pages API).
  CF_API_TOKEN?: string // secret; token con permiso Cloudflare Pages: Edit (+ Zone DNS: Edit para DNS automático)
  CF_ACCOUNT_ID?: string
  CF_PAGES_PROJECT?: string
  ROOT_DOMAIN?: string
  CF_ZONE_ID?: string // opcional; habilita la creación automática del DNS
  CF_PAGES_HOST?: string // opcional; destino del CNAME (p.ej. eventpass-d7d.pages.dev)
  // Secreto OpenAI. Nunca se expone al navegador ni se declara en [vars].
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  OPENAI_FORUM_MODEL?: string
  OPENAI_VISION_MODEL?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Los portales públicos viven en subdominios por organización. Reflejamos sólo
// orígenes HTTPS de nuestra zona; no usamos un comodín para no exponer los
// endpoints privilegiados del Worker a sitios de terceros.
function allowedAppOrigin(origin: string): string | undefined {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:') return undefined
    const host = url.hostname.toLowerCase()
    if (host === 'eventosfacil.net' || host === 'www.eventosfacil.net' || host.endsWith('.eventosfacil.net')) return origin
    // Previews oficiales de Cloudflare Pages para pruebas de liberación.
    if (host.endsWith('.eventpass-d7d.pages.dev')) return origin
  } catch {
    // Un Origin malformado no debe recibir permisos CORS.
  }
  return undefined
}

app.use('*', cors({
  origin: allowedAppOrigin,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
}))

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
type EventEmailData = {
  name: string
  registrationMode: 'free' | 'paid' | 'invitation'
  context: EventEmailContext
}

async function loadEventEmailData(supabase: SupabaseClient<any>, eventId: string): Promise<EventEmailData> {
  const { data: event } = await supabase
    .from('events')
    .select('name,organization_id,start_date,end_date,config')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return { name: 'Tu evento', registrationMode: 'paid', context: {} }

  const { data: organization } = await supabase
    .from('organizations')
    .select('name,branding')
    .eq('id', event.organization_id)
    .maybeSingle()
  const eventConfig = (event.config ?? {}) as Record<string, unknown>
  const eventBranding = eventConfig.branding && typeof eventConfig.branding === 'object'
    ? eventConfig.branding as Record<string, unknown>
    : {}
  const organizationBranding = organization?.branding && typeof organization.branding === 'object'
    ? organization.branding as Record<string, unknown>
    : {}
  const mode = eventConfig.registration_mode

  return {
    name: event.name,
    registrationMode: mode === 'free' || mode === 'invitation' ? mode : 'paid',
    context: {
      organizerName: String(eventBranding.name ?? organizationBranding.name ?? organization?.name ?? 'EventosFácil'),
      logoUrl: typeof eventBranding.logo_url === 'string' ? eventBranding.logo_url : typeof organizationBranding.logo_url === 'string' ? organizationBranding.logo_url : null,
      accentColor: typeof eventBranding.primary_color === 'string' ? eventBranding.primary_color : typeof eventBranding.color === 'string' ? eventBranding.color : typeof organizationBranding.color === 'string' ? organizationBranding.color : null,
      startsAt: event.start_date,
      endsAt: event.end_date,
      venueName: typeof eventConfig.venue_name === 'string' ? eventConfig.venue_name : typeof eventConfig.location === 'string' ? eventConfig.location : null,
    },
  }
}

async function recordEmailAttempt(
  supabase: SupabaseClient<any>,
  values: {
    organizationId: string
    registrationId: string | null
    recipient: string
    emailType: string
    result: Awaited<ReturnType<typeof sendConfirmationEmail>>
  },
) {
  let attemptNumber = 1
  if (values.registrationId) {
    const { count } = await supabase
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('registration_id', values.registrationId)
      .eq('email_type', values.emailType)
    attemptNumber = (count ?? 0) + 1
  }
  const { error } = await supabase.from('email_log').insert({
    organization_id: values.organizationId,
    registration_id: values.registrationId,
    email_type: values.emailType,
    recipient: values.recipient,
    provider: 'cloudflare_email_service',
    provider_message_id: values.result.providerMessageId,
    provider_status: values.result.providerStatus,
    error_code: values.result.errorCode,
    error_detail: values.result.errorDetail,
    attempt_number: attemptNumber,
    status: values.result.ok ? 'accepted' : 'failed',
    sent_at: values.result.ok ? new Date().toISOString() : null,
  })
  if (error) console.error('[email-log] no se pudo registrar el intento:', error.message)
}

const notifySchema = z.object({
  registration_id: z.string().uuid(),
  credential_token: z.string().min(20),
})

app.post('/api/registrations/notify', async (c) => {
  const parsed = notifySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400)
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: reg, error } = await supabase
    .from('registrations')
    .select('id, event_id, first_name, email, credential_token, status, organization_id')
    .eq('id', parsed.data.registration_id)
    .eq('credential_token', parsed.data.credential_token)
    .maybeSingle()

  // Respuesta genérica: no revelamos si el correo existe o no.
  if (error) {
    console.error('[notify] no se pudo consultar el registro:', error.message)
    return c.json({ ok: false, status: 'lookup_failed', error: 'No se pudo validar el registro para enviar el correo.' }, 503)
  }
  if (!reg) return c.json({ ok: true, status: 'ignored' })
  // Si ya está confirmado, no reenviamos el enlace de carga.
  if (reg.status === 'confirmed') return c.json({ ok: true, status: 'ignored' })

  const { data: methods } = await supabase
    .from('payment_methods')
    .select('name, details')
    .eq('organization_id', reg.organization_id)
    .eq('is_active', true)
    .or(`event_id.eq.${reg.event_id},event_id.is.null`)

  const event = await loadEventEmailData(supabase, reg.event_id)

  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const result = await sendUploadLinkEmail({
    email: c.env.EMAIL,
    from: c.env.EMAIL_FROM,
    to: reg.email,
    firstName: reg.first_name,
    eventName: event.name,
    uploadUrl: `${base}/comprobante/${reg.credential_token}`,
    paymentMethods: methods ?? [],
    context: event.context,
  })

  await recordEmailAttempt(supabase, { organizationId: reg.organization_id, registrationId: reg.id, recipient: reg.email, emailType: 'upload_link', result })

  if (!result.ok) {
    console.error('[notify] envío fallido:', result.errorCode, result.errorDetail)
    return c.json({ ok: false, status: 'failed', code: result.errorCode, error: 'El registro quedó guardado, pero el correo no pudo enviarse.' }, 502)
  }
  return c.json({ ok: true, status: 'accepted', message_id: result.providerMessageId })
})

// ---------------------------------------------------------------------------
// Correo de confirmación de pago: lo invoca el panel admin tras confirmar un
// registro. El Worker solo envía si el registro está realmente confirmado
// (evita falsos "confirmado"). Incluye el enlace a la credencial con QR.
// ---------------------------------------------------------------------------
const confirmSchema = z.object({
  registration_id: z.string().uuid(),
  credential_token: z.string().min(20),
})

app.post('/api/registrations/confirm-notify', async (c) => {
  const parsed = confirmSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400)

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: reg, error } = await supabase
    .from('registrations')
    .select('id, event_id, first_name, email, credential_token, status, organization_id')
    .eq('id', parsed.data.registration_id)
    .eq('credential_token', parsed.data.credential_token)
    .maybeSingle()

  if (error) {
    console.error('[confirm-notify] no se pudo consultar el registro:', error.message)
    return c.json({ ok: false, status: 'lookup_failed', error: 'No se pudo validar el registro para enviar el correo.' }, 503)
  }
  if (!reg) return c.json({ ok: true, status: 'ignored' })
  // Solo se notifica una confirmación real.
  if (reg.status !== 'confirmed') return c.json({ ok: true, status: 'ignored' })

  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const event = await loadEventEmailData(supabase, reg.event_id)
  const kind = event.registrationMode === 'paid' ? 'payment_confirmed' : 'free_registration'
  const result = await sendConfirmationEmail({
    email: c.env.EMAIL,
    from: c.env.EMAIL_FROM,
    to: reg.email,
    firstName: reg.first_name,
    eventName: event.name,
    credentialUrl: `${base}/credencial/${reg.credential_token}`,
    kind,
    context: event.context,
  })

  await recordEmailAttempt(supabase, { organizationId: reg.organization_id, registrationId: reg.id, recipient: reg.email, emailType: kind === 'payment_confirmed' ? 'payment_confirmed' : 'registration_confirmed', result })

  if (!result.ok) {
    console.error('[confirm-notify] envío fallido:', result.errorCode, result.errorDetail)
    return c.json({ ok: false, status: 'failed', code: result.errorCode, error: 'La confirmación quedó guardada, pero el correo no pudo enviarse.' }, 502)
  }
  return c.json({ ok: true, status: 'accepted', message_id: result.providerMessageId })
})

const participationNotifySchema = z.object({ participation_id: z.string().uuid() })

app.post('/api/program-participations/notify', async (c) => {
  const parsed = participationNotifySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400)
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase
    .from('event_participations')
    .select('id,status,credential_token,people(first_name,email),event_programs(name,organization_id,venue_name,starts_at,ends_at)')
    .eq('id', parsed.data.participation_id)
    .maybeSingle()
  if (error || !data || data.status !== 'approved') return c.json({ ok: true })
  const personRaw = Array.isArray(data.people) ? data.people[0] : data.people
  const programRaw = Array.isArray(data.event_programs) ? data.event_programs[0] : data.event_programs
  const person = personRaw as { first_name?: string; email?: string } | null
  const program = programRaw as { name?: string; organization_id?: string; venue_name?: string | null; starts_at?: string | null; ends_at?: string | null } | null
  if (!person?.email || !program?.organization_id) return c.json({ ok: true })
  const { data: organization } = await supabase.from('organizations').select('name,branding').eq('id', program.organization_id).maybeSingle()
  const branding = organization?.branding && typeof organization.branding === 'object' ? organization.branding as Record<string, unknown> : {}
  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const result = await sendConfirmationEmail({
    email: c.env.EMAIL,
    from: c.env.EMAIL_FROM,
    to: person.email,
    firstName: person.first_name ?? 'Participante',
    eventName: program.name ?? 'Tu evento',
    credentialUrl: `${base}/credencial/${data.credential_token}`,
    kind: 'program_approved',
    activityName: program.name,
    context: {
      organizerName: String(branding.name ?? organization?.name ?? 'EventosFácil'),
      logoUrl: typeof branding.logo_url === 'string' ? branding.logo_url : null,
      accentColor: typeof branding.color === 'string' ? branding.color : null,
      startsAt: program.starts_at,
      endsAt: program.ends_at,
      venueName: program.venue_name,
    },
  })
  await recordEmailAttempt(supabase, { organizationId: program.organization_id, registrationId: null, recipient: person.email, emailType: 'program_credential', result })
  if (!result.ok) return c.json({ ok: false, status: 'failed', code: result.errorCode }, 502)
  return c.json({ ok: true, status: 'accepted', message_id: result.providerMessageId })
})

// ---------------------------------------------------------------------------
// Aprovisionamiento de subdominio de tenant.
// El admin de una organización activa su subdominio <slug>.eventosfacil.net.
// El Worker registra el hostname como custom domain del proyecto Pages vía la
// API de Cloudflare (Pages no admite comodines, hay que registrar cada host).
// ---------------------------------------------------------------------------
// Devuelve la config de Cloudflare si está completa, o null si falta algo.
function cfConfig(env: Bindings): CfEnv | null {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return null
  return {
    CF_API_TOKEN: env.CF_API_TOKEN,
    CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    CF_PAGES_PROJECT: env.CF_PAGES_PROJECT || 'eventpass',
    ROOT_DOMAIN: env.ROOT_DOMAIN || 'eventosfacil.net',
    CF_ZONE_ID: env.CF_ZONE_ID,
    CF_PAGES_HOST: env.CF_PAGES_HOST,
  }
}

type SupabaseAdmin = SupabaseClient

// Verifica el JWT del header Authorization y devuelve el user id, o null.
async function authUserId(supabase: SupabaseAdmin, authorization?: string): Promise<string | null> {
  if (!authorization?.startsWith('Bearer ')) return null
  const { data, error } = await supabase.auth.getUser(authorization.slice(7))
  if (error || !data.user) return null
  return data.user.id
}

const forumAiRequestSchema = z.object({
  event_id: z.string().uuid(),
  prompt: z.string().trim().min(8).max(1600),
  override_capacity_constraints: z.boolean().default(false),
  current_plan: z.object({
    columns: z.number().int().min(2).max(100),
    rows: z.number().int().min(2).max(100),
    fixed_elements: z.array(z.object({
      type: z.enum(['stage', 'aisle', 'entrance']),
      x: z.number().int().min(0).max(99), y: z.number().int().min(0).max(99),
      width: z.number().int().min(1).max(100), height: z.number().int().min(1).max(100),
      label: z.string().max(60), axis: z.enum(['horizontal', 'vertical']).optional(),
    })).max(30),
    seat_rows: z.array(z.object({ y: z.number().int().min(0).max(99), ranges: z.array(z.tuple([z.number().int().min(0).max(99), z.number().int().min(0).max(99)])).max(40) })).max(100),
  }).optional(),
}).strict()

function outputTextFromResponse(payload: unknown): string | null {
  const output = (payload as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output
  for (const item of output ?? []) for (const content of item.content ?? []) if (content.type === 'output_text' && typeof content.text === 'string') return content.text
  return null
}

type OpenAiResult =
  | { ok: true; payload: unknown }
  | { ok: false; status: number; code: string; message: string }

function openAiUserMessage(status: number, code: string) {
  if (code === 'insufficient_quota') return 'El proyecto de OpenAI todavía no tiene cuota disponible. Revisa facturación y límites del proyecto.'
  if (status === 401 || status === 403) return 'La conexión con OpenAI no está autorizada. Revisa la API key del Worker.'
  if (status === 404 || code === 'model_not_found') return 'El modelo configurado para IA no está disponible en el proyecto de OpenAI.'
  if (status === 429 || code === 'rate_limit_exceeded') return 'OpenAI aún reporta un límite de uso. Espera un minuto y vuelve a intentarlo.'
  if (status === 400) return 'OpenAI rechazó el formato de la solicitud. El incidente quedó identificado para corrección.'
  return 'OpenAI no pudo procesar la solicitud en este momento. Inténtalo de nuevo.'
}

async function requestOpenAi(apiKey: string, body: Record<string, unknown>, timeoutMs: number): Promise<OpenAiResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null) as { error?: { code?: string; type?: string } } | null
      if (response.ok) return { ok: true, payload }
      const code = String(payload?.error?.code ?? payload?.error?.type ?? `http_${response.status}`)
      console.error('[openai] request failed', { status: response.status, code, model: body.model, attempt: attempt + 1 })
      const retryable = [408, 409, 429].includes(response.status) || response.status >= 500
      if (retryable && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 750))
        continue
      }
      return { ok: false, status: response.status, code, message: openAiUserMessage(response.status, code) }
    } catch (error) {
      console.error('[openai] transport failed', { model: body.model, attempt: attempt + 1, error: error instanceof Error ? error.name : 'unknown' })
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 750))
        continue
      }
      return { ok: false, status: 502, code: 'transport_error', message: 'No se pudo contactar OpenAI. Comprueba la conexión e inténtalo de nuevo.' }
    } finally { clearTimeout(timeout) }
  }
  return { ok: false, status: 502, code: 'unknown_error', message: 'OpenAI no pudo procesar la solicitud.' }
}

app.post('/api/ai/forum-floorplan/proposal', async (c) => {
  const parsed = forumAiRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'La solicitud del plano no es válida.' }, 400)
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'La función de IA aún no está configurada. Solicita al administrador cargar OPENAI_API_KEY en el Worker.' }, 503)

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const caller = await authUserId(supabase, c.req.header('Authorization'))
  if (!caller) return c.json({ error: 'no autorizado' }, 401)
  const { data: event } = await supabase.from('events').select('id,organization_id,total_slots').eq('id', parsed.data.event_id).maybeSingle()
  if (!event) return c.json({ error: 'Evento no encontrado' }, 404)
  const [{ data: membership }, { data: platform }, { data: seats }, { data: categories }, { count: registrations }] = await Promise.all([
    supabase.from('memberships').select('role').eq('organization_id', event.organization_id).eq('user_id', caller).maybeSingle(),
    supabase.from('platform_admins').select('user_id').eq('user_id', caller).maybeSingle(),
    supabase.from('seats').select('map_element_id,status').eq('event_id', event.id).neq('status', 'available'),
    supabase.from('seat_reservation_categories').select('name,reserved_capacity').eq('event_id', event.id).eq('is_active', true),
    supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', event.id).neq('status', 'rejected'),
  ])
  if (!platform && (!membership || !['owner', 'admin'].includes(membership.role))) return c.json({ error: 'No tienes permisos para crear o reemplazar el plano con IA.' }, 403)
  if ((seats ?? []).some(seat => seat.map_element_id)) return c.json({ error: 'Hay sillas reservadas o confirmadas. Libéralas antes de reemplazar el plano con IA.' }, 409)

  const aiResult = await requestOpenAi(c.env.OPENAI_API_KEY, {
        model: c.env.OPENAI_FORUM_MODEL || c.env.OPENAI_MODEL || 'gpt-5.4-mini', store: false, max_output_tokens: 700,
        input: [
          { role: 'developer', content: 'Interpreta instrucciones en español para un plano de foro. Devuelve sólo la intención del montaje; no calcules coordenadas, filas, columnas ni bloques de sillas. capacity es la cantidad total exacta de asistentes o sillas solicitada. Un pasillo central es vertical. “Delante” significa front_cross_aisle y “detrás” rear_cross_aisle. “Entradas laterales” significa both_sides. Distingue entradas de pasillos. Considera el contexto de aforo y reservas, pero la solicitud expresa del organizador prevalece. Si se modifica un plano y el usuario no cambia la capacidad, conserva la capacidad calculable desde current_plan.seat_rows. No incluyas nombres, correos ni datos personales.' },
          { role: 'user', content: JSON.stringify({ request: parsed.data.prompt, current_plan: parsed.data.current_plan ?? null, capacity_context: { configured_capacity: event.total_slots, institutional_reservations: categories ?? [], active_registrations: registrations ?? 0 } }) },
        ],
        text: { format: { type: 'json_schema', name: 'forum_layout_intent', strict: true, schema: forumLayoutIntentJsonSchema } },
  }, 25_000)
  if (!aiResult.ok) return c.json({ error: aiResult.message, code: aiResult.code }, aiResult.status === 429 ? 429 : 502)

  const text = outputTextFromResponse(aiResult.payload)
  let candidate: unknown
  try { candidate = text ? JSON.parse(text) : null } catch { return c.json({ error: 'La respuesta de IA no tuvo el formato esperado.' }, 502) }
  const intent = forumLayoutIntentSchema.safeParse(candidate)
  if (!intent.success) {
    const details = intent.error.issues.slice(0, 4).map(issue => `${issue.path.join('.') || 'raíz'}: ${issue.message}`).join('; ')
    console.error('[forum-ai] intención fuera del esquema:', details)
    return c.json({ error: 'No pudimos interpretar la capacidad y circulación solicitadas. Revisa la instrucción e inténtalo de nuevo.' }, 502)
  }
  try {
    const plan = generateForumPlan(intent.data)
    const reservedCapacity = (categories ?? []).reduce((total, category) => total + Number(category.reserved_capacity ?? 0), 0)
    const minimumRequired = reservedCapacity + (registrations ?? 0)
    const conflicts: string[] = []
    if (event.total_slots > 0 && plan.capacity !== event.total_slots) conflicts.push(`La instrucción solicita ${plan.capacity} sillas y el aforo configurado es ${event.total_slots}.`)
    if (plan.capacity < minimumRequired) conflicts.push(`El plano tendría ${plan.capacity} sillas, pero hay ${minimumRequired} cupos comprometidos entre registros activos y reservas institucionales.`)
    if (conflicts.length && !parsed.data.override_capacity_constraints) return c.json({ needs_confirmation: true, conflicts, capacity_context: { configured_capacity: event.total_slots, active_registrations: registrations ?? 0, reserved_capacity: reservedCapacity, minimum_required: minimumRequired } }, 409)
    return c.json({ proposal: plan, intent: intent.data, capacity_context: { configured_capacity: event.total_slots, active_registrations: registrations ?? 0, reserved_capacity: reservedCapacity, overridden: conflicts.length > 0 } })
  } catch (error) {
    console.error('[forum-ai] fallo del motor determinista:', error instanceof Error ? error.message : 'error desconocido')
    return c.json({ error: 'No pudimos construir un plano válido con esas condiciones. Prueba con una capacidad menor o menos pasillos.' }, 422)
  }
})

const exhibitionImportRequestSchema = z.object({
  event_id: z.string().uuid(),
  map_id: z.string().uuid(),
  import_id: z.string().uuid(),
}).strict()

app.post('/api/ai/exhibition-import/analyze', async (c) => {
  const parsed = exhibitionImportRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'La solicitud de análisis no es válida.' }, 400)
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'La función de IA aún no está configurada.' }, 503)

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const caller = await authUserId(supabase, c.req.header('Authorization'))
  if (!caller) return c.json({ error: 'no autorizado' }, 401)
  const { data: importRow } = await supabase.from('venue_map_imports')
    .select('id,organization_id,event_id,map_id,storage_path,file_name,mime_type,status')
    .eq('id', parsed.data.import_id).maybeSingle()
  if (!importRow || importRow.event_id !== parsed.data.event_id || importRow.map_id !== parsed.data.map_id) return c.json({ error: 'Importación no encontrada.' }, 404)
  const [{ data: membership }, { data: platform }, { data: map }, { count: elementCount }] = await Promise.all([
    supabase.from('memberships').select('role').eq('organization_id', importRow.organization_id).eq('user_id', caller).maybeSingle(),
    supabase.from('platform_admins').select('user_id').eq('user_id', caller).maybeSingle(),
    supabase.from('venue_maps').select('id,event_id,organization_id,published,metadata').eq('id', importRow.map_id).maybeSingle(),
    supabase.from('venue_map_elements').select('id', { count: 'exact', head: true }).eq('map_id', importRow.map_id),
  ])
  if (!platform && (!membership || !['owner', 'admin'].includes(membership.role))) return c.json({ error: 'No tienes permisos para analizar este plano.' }, 403)
  if (!map || map.event_id !== importRow.event_id || map.organization_id !== importRow.organization_id) return c.json({ error: 'El plano no corresponde a la importación.' }, 409)
  if (map.published) return c.json({ error: 'Despublica el plano antes de analizar una importación.' }, 409)
  if ((elementCount ?? 0) > 0) return c.json({ error: 'El MVP de IA sólo funciona sobre un plano vacío.' }, 409)
  if (!['uploaded', 'failed'].includes(importRow.status)) return c.json({ error: 'Esta importación ya fue analizada o aplicada.' }, 409)

  await supabase.from('venue_map_imports').update({ status: 'analyzing', error_message: null }).eq('id', importRow.id)
  const fail = async (message: string, status: 422 | 429 | 502 = 502) => {
    await supabase.from('venue_map_imports').update({ status: 'failed', error_message: message }).eq('id', importRow.id)
    return c.json({ error: message }, status)
  }
  const { data: file, error: fileError } = await supabase.storage.from('floorplan-sources').download(importRow.storage_path)
  if (fileError || !file) return fail('No se pudo leer el archivo privado del plano.')
  if (file.size > 10 * 1024 * 1024) return fail('El archivo supera el límite de 10 MB.', 422)
  const mimeType = importRow.mime_type as 'image/png' | 'image/jpeg' | 'application/pdf'
  const dataUrl = arrayBufferToDataUrl(await file.arrayBuffer(), mimeType)
  const source = mimeType === 'application/pdf'
    ? { type: 'input_file', filename: importRow.file_name, file_data: dataUrl }
    : { type: 'input_image', image_url: dataUrl, detail: 'high' }
  const aiResult = await requestOpenAi(c.env.OPENAI_API_KEY, {
        model: c.env.OPENAI_VISION_MODEL || c.env.OPENAI_MODEL || 'gpt-5.4', store: false, max_output_tokens: 6000,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: 'Analiza esta imagen renderizada de la primera página de un plano de exposición como un problema de localización geométrica, no como un resumen del documento. Devuelve una caja delimitadora normalizada en un lienzo 0..1000, origen arriba a la izquierda, para CADA stand rectangular individual visible. Usa como label el número impreso del stand cuando sea legible (por ejemplo, Stand 53); nunca agrupes una fila, franja, zona o conjunto de stands en una sola caja. Detecta también pasillos, accesos, salidas de emergencia, escenario/foro, baños, servicios, paredes, columnas e información sólo cuando su contorno físico sea visible. La caja debe ajustarse al contorno real del objeto, no al texto cercano. Ignora logotipos, títulos, leyendas, pie de página, nombres de empresas, decoración, flechas impresas y textos sin un objeto físico delimitado. No inventes elementos ocultos o ilegibles. Cada source_id debe ser único. Reduce confidence si el contorno es ambiguo. Antes de responder verifica que los centros de las cajas coincidan visualmente con los objetos y que ninguna caja de stand abarque más de un stand. No extraigas nombres de personas, correos ni otros datos personales.' },
          source,
        ] }],
        text: { format: { type: 'json_schema', name: 'exhibition_floorplan_detection', strict: true, schema: exhibitionDetectionJsonSchema } },
  }, 45_000)
  if (!aiResult.ok) return fail(`${aiResult.message} (${aiResult.code})`, aiResult.status === 429 ? 429 : 502)
  const text = outputTextFromResponse(aiResult.payload)
  let candidate: unknown
  try { candidate = text ? JSON.parse(text) : null } catch { return fail('La respuesta de IA no tuvo el formato esperado.') }
  const detected = exhibitionDetectionSchema.safeParse(candidate)
  if (!detected.success) {
    console.error('[exhibition-ai] respuesta fuera del esquema', detected.error.issues.slice(0, 5))
    return fail('La propuesta de IA no pasó la validación del plano.')
  }
  const mapWidth = Number((map.metadata as Record<string, unknown> | null)?.width_units ?? 40)
  const mapHeight = Number((map.metadata as Record<string, unknown> | null)?.height_units ?? 24)
  const proposal = normalizeExhibitionDetection(detected.data, mapWidth, mapHeight)
  if (!proposal.elements.length) return fail('No se detectaron elementos utilizables. Prueba con una imagen más nítida.', 422)
  const { error: updateError } = await supabase.from('venue_map_imports').update({
    status: 'review', proposal, warnings: proposal.warnings, analyzed_at: new Date().toISOString(), error_message: null,
  }).eq('id', importRow.id)
  if (updateError) return fail('El análisis terminó, pero no se pudo guardar la propuesta.')
  return c.json({ proposal })
})

// Slug válido de la organización si el usuario tiene el rol requerido, o un error.
async function orgSlugForRole(
  supabase: SupabaseAdmin,
  orgId: string,
  userId: string,
  roles: string[],
): Promise<{ slug: string } | { error: string; code: 400 | 403 }> {
  const { data: mem } = await supabase
    .from('memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  let authorized = !!mem && roles.includes(mem.role as string)
  // Los superadmins pueden gestionar el subdominio de cualquier cliente.
  if (!authorized) {
    const { data: pa } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    authorized = !!pa
  }
  if (!authorized) return { error: 'no autorizado', code: 403 }

  const { data: org } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .maybeSingle()
  const slug = normalizeSlug((org as { slug?: string } | null)?.slug)
  if (!slug) {
    return { error: 'La organización necesita un slug válido (minúsculas, números y guiones).', code: 400 }
  }
  return { slug }
}

const provisionSchema = z.object({ organization_id: z.string().uuid() })

app.post('/api/tenants/provision-domain', async (c) => {
  const cf = cfConfig(c.env)
  if (!cf) return c.json({ error: 'Aprovisionamiento no configurado' }, 501)

  const parsed = provisionSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400)

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const userId = await authUserId(supabase, c.req.header('Authorization'))
  if (!userId) return c.json({ error: 'no autorizado' }, 401)

  const info = await orgSlugForRole(supabase, parsed.data.organization_id, userId, ['owner', 'admin'])
  if ('error' in info) return c.json({ error: info.error }, info.code)

  const result = await provisionDomain(cf, info.slug)
  if (!result.ok) {
    console.error('[provision-domain] fallo:', result.error)
    return c.json({ error: result.error, hostname: result.hostname }, 502)
  }
  if (result.dns === 'failed') {
    console.warn('[provision-domain] DNS no creado:', result.dnsError)
  }
  return c.json({ ok: true, hostname: result.hostname, status: result.status, dns: result.dns })
})

app.get('/api/tenants/domain-status', async (c) => {
  const cf = cfConfig(c.env)
  if (!cf) return c.json({ error: 'Aprovisionamiento no configurado' }, 501)

  const orgId = c.req.query('organization_id')
  if (!orgId) return c.json({ error: 'Datos inválidos' }, 400)

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const userId = await authUserId(supabase, c.req.header('Authorization'))
  if (!userId) return c.json({ error: 'no autorizado' }, 401)

  const info = await orgSlugForRole(supabase, orgId, userId, ['owner', 'admin', 'staff'])
  if ('error' in info) {
    // Sin slug válido no es un error de permisos: aún no hay subdominio.
    return info.code === 400 ? c.json({ status: 'none' }) : c.json({ error: info.error }, info.code)
  }

  const hostname = `${info.slug}.${cf.ROOT_DOMAIN}`
  const st = await getDomainStatus(cf, hostname)
  return c.json({ hostname, status: st?.status ?? 'none', validation: st?.validation ?? null })
})

// ---------------------------------------------------------------------------
// Alta manual de clientes por el superadmin: crea la organización e invita a
// uno o varios correos como administradores (owner). Los correos que aún no
// tienen cuenta reciben una invitación para definir su clave; los existentes
// se enlazan directamente. Requiere service role (crear usuarios) y por eso
// vive en el Worker, no en una RPC.
// ---------------------------------------------------------------------------
const createClientSchema = z.object({
  name: z.string().min(2),
  slug: z.string(),
  plan: z.enum(['arranque', 'profesional', 'asociacion']).optional(),
  admin_emails: z.array(z.string().email()).min(1).max(10),
})

app.post('/api/admin/clients', async (c) => {
  const parsed = createClientSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400)

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const userId = await authUserId(supabase, c.req.header('Authorization'))
  if (!userId) return c.json({ error: 'no autorizado' }, 401)

  // Solo superadmins de la plataforma.
  const { data: pa } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!pa) return c.json({ error: 'no autorizado' }, 403)

  const slug = normalizeSlug(parsed.data.slug)
  if (!slug) return c.json({ error: 'Subdominio inválido' }, 400)

  const { data: dup } = await supabase.from('organizations').select('id').eq('slug', slug).maybeSingle()
  if (dup) return c.json({ error: 'El subdominio ya está en uso' }, 409)

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name: parsed.data.name.trim(), slug, status: 'active', plan: parsed.data.plan ?? 'arranque' })
    .select('id, slug')
    .single()
  if (orgErr || !org) return c.json({ error: orgErr?.message ?? 'No se pudo crear la organización' }, 500)

  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const emails = [...new Set(parsed.data.admin_emails.map((e) => e.toLowerCase().trim()))]
  const admins: { email: string; status: 'invited' | 'linked' | 'error'; error?: string }[] = []

  for (const email of emails) {
    let uid: string | null = null
    let status: 'invited' | 'linked' = 'invited'

    const inv = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: `${base}/definir-clave` })
    if (inv.data?.user) {
      uid = inv.data.user.id
    } else if (inv.error && /registered|exist/i.test(inv.error.message)) {
      const { data: found } = await supabase.rpc('get_user_id_by_email', { p_email: email })
      uid = (found as string | null) ?? null
      status = 'linked'
    } else {
      admins.push({ email, status: 'error', error: inv.error?.message })
      continue
    }
    if (!uid) {
      admins.push({ email, status: 'error', error: 'No se pudo resolver el usuario' })
      continue
    }

    const { error: memErr } = await supabase
      .from('memberships')
      .insert({ organization_id: org.id, user_id: uid, role: 'owner' })
    if (memErr && !/duplicate|unique/i.test(memErr.message)) {
      admins.push({ email, status: 'error', error: memErr.message })
      continue
    }
    admins.push({ email, status })
  }

  // Aprovisiona el subdominio automáticamente (DNS + custom domain en Pages).
  let domain: { hostname: string; status?: string; error?: string } | null = null
  const cf = cfConfig(c.env)
  if (cf) {
    const pr = await provisionDomain(cf, slug)
    domain = pr.ok ? { hostname: pr.hostname, status: pr.status } : { hostname: pr.hostname, error: pr.error }
  }

  return c.json({ ok: true, org, admins, domain })
})

app.post('/api/admin/clients/:orgId/owners', async (c) => {
  const parsed=z.object({email:z.string().email()}).safeParse(await c.req.json().catch(()=>null)); if (!parsed.success) return c.json({error:'Correo inválido'},400)
  const supabase=createClient(c.env.SUPABASE_URL,c.env.SUPABASE_SERVICE_ROLE_KEY); const userId=await authUserId(supabase,c.req.header('Authorization')); if (!userId) return c.json({error:'no autorizado'},401)
  const {data:pa}=await supabase.from('platform_admins').select('user_id').eq('user_id',userId).maybeSingle(); if (!pa) return c.json({error:'no autorizado'},403)
  const orgId=c.req.param('orgId'); const base=c.env.APP_BASE_URL.replace(/\/$/,''); let uid:string|null=null
  const invited=await supabase.auth.admin.inviteUserByEmail(parsed.data.email.toLowerCase(),{redirectTo:`${base}/definir-clave`})
  if (invited.data?.user) uid=invited.data.user.id; else if (invited.error && /registered|exist/i.test(invited.error.message)) { const found=await supabase.rpc('get_user_id_by_email',{p_email:parsed.data.email}); uid=(found.data as string|null)??null } else return c.json({error:invited.error?.message??'No se pudo invitar'},400)
  if (!uid) return c.json({error:'No se pudo resolver el usuario'},400)
  const {error}=await supabase.from('memberships').insert({organization_id:orgId,user_id:uid,role:'owner'}); if (error && !/duplicate|unique/i.test(error.message)) return c.json({error:error.message},400)
  return c.json({ok:true})
})

const exhibitorInviteSchema = z.object({
  event_id: z.string().uuid(),
  company_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['owner', 'manager', 'staff']).default('staff'),
})

app.post('/api/exhibitor-portal/invite', async (c) => {
  const parsed = exhibitorInviteSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos de invitación inválidos' }, 400)
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const caller = await authUserId(supabase, c.req.header('Authorization'))
  if (!caller) return c.json({ error: 'no autorizado' }, 401)
  const { data: event } = await supabase.from('events').select('id,organization_id').eq('id', parsed.data.event_id).maybeSingle()
  const { data: company } = await supabase.from('companies').select('id,name,kind,event_id,organization_id').eq('id', parsed.data.company_id).maybeSingle()
  if (!event || !company || !['exhibitor', 'sponsor'].includes(company.kind) || company.event_id !== event.id || company.organization_id !== event.organization_id) return c.json({ error: 'Empresa o evento inválido' }, 400)
  const { data: platformAdmin } = await supabase.from('platform_admins').select('user_id').eq('user_id', caller).maybeSingle()
  const { data: orgMember } = await supabase.from('memberships').select('role').eq('organization_id', event.organization_id).eq('user_id', caller).maybeSingle()
  const { data: portalMember } = await supabase.from('exhibitor_portal_members').select('role,status').eq('event_id', event.id).eq('company_id', company.id).eq('user_id', caller).maybeSingle()
  const allowed = Boolean(platformAdmin || (orgMember && ['owner', 'admin'].includes(orgMember.role)) || (portalMember && portalMember.status === 'active' && ['owner', 'manager'].includes(portalMember.role)))
  if (!allowed) return c.json({ error: 'No tienes permisos para invitar personal' }, 403)
  const email = parsed.data.email.toLowerCase().trim()
  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const { data: eventDetails } = await supabase.from('events').select('name').eq('id', event.id).maybeSingle()
  const { data: generated, error: generateError } = await supabase.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: `${base}/definir-clave?next=/portal/expositor/${event.id}` } })
  let userId = generated?.user?.id ?? null
  let actionLink = generated?.properties?.action_link ?? null
  if (!userId && generateError && /registered|exist|already/i.test(generateError.message)) {
    const found = await supabase.rpc('get_user_id_by_email', { p_email: email })
    userId = (found.data as string | null) ?? null
    if (userId) {
      const recovery = await supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${base}/definir-clave?next=/portal/expositor/${event.id}` } })
      actionLink = recovery.data?.properties?.action_link ?? null
      if (recovery.error) return c.json({ error: recovery.error.message }, 400)
    }
  }
  if (!userId || !actionLink) return c.json({ error: generateError?.message ?? 'No se pudo generar el enlace de invitación' }, 400)
  const { error } = await supabase.from('exhibitor_portal_members').upsert({ event_id: event.id, company_id: company.id, user_id: userId, email, role: parsed.data.role, status: 'active', accepted_at: new Date().toISOString() }, { onConflict: 'event_id,company_id,user_id' })
  if (error) return c.json({ error: error.message }, 400)
  const portalUrl = `${base}/portal/expositor/${event.id}`
  const mailError = await sendPortalInviteEmail({ email: c.env.EMAIL, from: c.env.EMAIL_FROM, to: email, companyName: company.name, eventName: eventDetails?.name ?? 'tu evento', actionUrl: actionLink, portalUrl })
  if (mailError) return c.json({ error: `La invitación fue creada, pero el correo no pudo enviarse: ${mailError}`, invitation_created: true }, 502)
  return c.json({ ok: true, email, status: 'invited', invitation_created: true })
})

const operationalStaffInviteSchema = z.object({ event_id: z.string().uuid(), email: z.string().email() })
app.post('/api/operational-staff/invite', async (c) => {
  const parsed = operationalStaffInviteSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Correo o evento inválido' }, 400)
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const caller = await authUserId(supabase, c.req.header('Authorization'))
  if (!caller) return c.json({ error: 'no autorizado' }, 401)
  const { data: event } = await supabase.from('events').select('id,organization_id,name').eq('id', parsed.data.event_id).maybeSingle()
  if (!event) return c.json({ error: 'Evento no encontrado' }, 404)
  const { data: platform } = await supabase.from('platform_admins').select('user_id').eq('user_id', caller).maybeSingle()
  const { data: member } = await supabase.from('memberships').select('role').eq('organization_id', event.organization_id).eq('user_id', caller).maybeSingle()
  if (!platform && (!member || !['owner', 'admin'].includes(member.role))) return c.json({ error: 'No tienes permisos para invitar personal operativo' }, 403)
  const email = parsed.data.email.toLowerCase().trim()
  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const generated = await supabase.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: `${base}/definir-clave?next=/admin/equipo-operativo` } })
  let userId = generated.data?.user?.id ?? null
  let actionLink = generated.data?.properties?.action_link ?? null
  if (!userId && generated.error && /registered|exist|already/i.test(generated.error.message)) {
    const found = await supabase.rpc('get_user_id_by_email', { p_email: email })
    userId = (found.data as string | null) ?? null
    if (userId) {
      const recovery = await supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${base}/definir-clave?next=/admin/equipo-operativo` } })
      actionLink = recovery.data?.properties?.action_link ?? null
      if (recovery.error) return c.json({ error: recovery.error.message }, 400)
    }
  }
  if (!userId) return c.json({ error: generated.error?.message ?? 'No se pudo crear la cuenta operativa' }, 400)
  const { error: membershipError } = await supabase.from('memberships').upsert({ organization_id: event.organization_id, user_id: userId, role: 'staff' }, { onConflict: 'organization_id,user_id' })
  if (membershipError) return c.json({ error: membershipError.message }, 400)
  if (!actionLink) return c.json({ ok: true, email, status: 'linked', invitation_created: false })
  const mailError = await sendPortalInviteEmail({ email: c.env.EMAIL, from: c.env.EMAIL_FROM, to: email, companyName: 'Equipo operativo', eventName: event.name, actionUrl: actionLink, portalUrl: `${base}/admin/equipo-operativo` })
  if (mailError) return c.json({ error: `La cuenta fue habilitada, pero el correo falló: ${mailError}`, linked: true }, 502)
  return c.json({ ok: true, email, status: 'invited', invitation_created: true })
})

const providerNoticeSchema = z.object({ provider_id: z.string().uuid(), event_id: z.string().uuid(), type: z.enum(['quote', 'payment']), service_id: z.string().uuid().nullable().optional(), amount: z.number().positive().nullable().optional(), due_date: z.string().nullable().optional(), notes: z.string().max(2000).nullable().optional() })
app.post('/api/providers/notify', async (c) => {
  const parsed = providerNoticeSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos de proveedor inválidos' }, 400)
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const caller = await authUserId(supabase, c.req.header('Authorization'))
  if (!caller) return c.json({ error: 'no autorizado' }, 401)
  const { data: event } = await supabase.from('events').select('id,name,organization_id').eq('id', parsed.data.event_id).maybeSingle()
  const { data: provider } = await supabase.from('providers').select('id,name,organization_id,contact_email,billing_email').eq('id', parsed.data.provider_id).maybeSingle()
  if (!event || !provider || event.organization_id !== provider.organization_id) return c.json({ error: 'Evento o proveedor inválido' }, 400)
  const { data: member } = await supabase.from('memberships').select('role').eq('organization_id', event.organization_id).eq('user_id', caller).maybeSingle()
  const { data: platform } = await supabase.from('platform_admins').select('user_id').eq('user_id', caller).maybeSingle()
  if (!platform && (!member || !['owner', 'admin'].includes(member.role))) return c.json({ error: 'No tienes permisos para notificar a este proveedor' }, 403)
  const { data: primary } = await supabase.from('provider_contacts').select('email').eq('provider_id', provider.id).eq('status', 'active').eq('is_primary', true).maybeSingle()
  const recipient = primary?.email ?? provider.billing_email ?? provider.contact_email
  if (!recipient) return c.json({ error: 'El proveedor no tiene correo de contacto' }, 400)
  let message = ''
  if (parsed.data.type === 'quote') {
    const { error } = await supabase.from('event_provider_assignments').insert({ organization_id: event.organization_id, event_id: event.id, provider_id: provider.id, service_id: parsed.data.service_id ?? null, status: 'requested', notes: parsed.data.notes ?? null })
    if (error && !/duplicate|unique/i.test(error.message)) return c.json({ error: error.message }, 400)
    message = `El organizador solicita una cotización para el evento "${event.name}".${parsed.data.due_date ? ` Fecha límite: ${parsed.data.due_date}.` : ''} ${parsed.data.notes ?? ''}`
  } else {
    const { error } = await supabase.from('provider_payment_notices').insert({ provider_id: provider.id, event_id: event.id, amount: parsed.data.amount ?? null, due_date: parsed.data.due_date ?? null, status: 'sent', sent_at: new Date().toISOString(), notes: parsed.data.notes ?? null })
    if (error) return c.json({ error: error.message }, 400)
    message = `Tienes una notificación de pago relacionada con "${event.name}".${parsed.data.amount ? ` Monto: ${parsed.data.amount}.` : ''} ${parsed.data.notes ?? ''}`
  }
  const mailError = await sendProviderNoticeEmail({ email: c.env.EMAIL, from: c.env.EMAIL_FROM, to: recipient, providerName: provider.name, eventName: event.name, subject: parsed.data.type === 'quote' ? `Solicitud de cotización — ${event.name}` : `Notificación de pago — ${event.name}`, message })
  if (mailError) return c.json({ error: `Registro guardado, pero el correo falló: ${mailError}`, saved: true }, 502)
  return c.json({ ok: true, recipient })
})

app.delete('/api/admin/clients/:orgId/owners/:userId', async (c) => {
  const supabase=createClient(c.env.SUPABASE_URL,c.env.SUPABASE_SERVICE_ROLE_KEY); const caller=await authUserId(supabase,c.req.header('Authorization')); if (!caller) return c.json({error:'no autorizado'},401)
  const {data:pa}=await supabase.from('platform_admins').select('user_id').eq('user_id',caller).maybeSingle(); if (!pa) return c.json({error:'no autorizado'},403)
  const orgId=c.req.param('orgId'), userId=c.req.param('userId'); const {count}=await supabase.from('memberships').select('user_id',{count:'exact',head:true}).eq('organization_id',orgId).eq('role','owner'); if ((count??0)<=1) return c.json({error:'Debe permanecer al menos un propietario'},400)
  const {error}=await supabase.from('memberships').delete().eq('organization_id',orgId).eq('user_id',userId).eq('role','owner'); if (error) return c.json({error:error.message},400); return c.json({ok:true})
})

// Disparo manual de las tareas programadas (para pruebas). Protegido por
// CRON_SECRET; si el secreto no está configurado, el endpoint queda deshabilitado.
app.post('/api/jobs/run', async (c) => {
  const secret = c.env.CRON_SECRET
  if (!secret || c.req.header('x-cron-secret') !== secret) {
    return c.json({ error: 'no autorizado' }, 401)
  }
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const result = await runScheduledJobs(supabase, c.env)
  return c.json(result)
})

export default {
  fetch: app.fetch,

  // Cron Trigger horario: recordatorios de pago + liberación de plazas vencidas.
  async scheduled(_event: ScheduledController, env: Bindings) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const result = await runScheduledJobs(supabase, env)
    console.log('[cron] jobs:', JSON.stringify(result))
  },
}
