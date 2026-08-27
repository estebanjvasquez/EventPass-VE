import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendUploadLinkEmail, sendConfirmationEmail, sendPortalInviteEmail, sendProviderNoticeEmail, type EmailSendBinding } from './email'
import { runScheduledJobs } from './jobs'
import { normalizeSlug, provisionDomain, getDomainStatus, type CfEnv } from './tenants'

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
// El join events(name) llega como objeto o como array según la relación.
function extractEventName(events: unknown): string {
  if (!events) return 'Tu evento'
  const row = Array.isArray(events) ? events[0] : events
  return (row as { name?: string } | undefined)?.name ?? 'Tu evento'
}

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

  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const sendError = await sendUploadLinkEmail({
    email: c.env.EMAIL,
    from: c.env.EMAIL_FROM,
    to: email,
    firstName: reg.first_name,
    eventName: extractEventName(reg.events),
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

// ---------------------------------------------------------------------------
// Correo de confirmación de pago: lo invoca el panel admin tras confirmar un
// registro. El Worker solo envía si el registro está realmente confirmado
// (evita falsos "confirmado"). Incluye el enlace a la credencial con QR.
// ---------------------------------------------------------------------------
const confirmSchema = z.object({ registration_id: z.string().uuid() })

app.post('/api/registrations/confirm-notify', async (c) => {
  const parsed = confirmSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400)

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: reg, error } = await supabase
    .from('registrations')
    .select('id, first_name, email, credential_token, status, organization_id, events(name)')
    .eq('id', parsed.data.registration_id)
    .maybeSingle()

  if (error || !reg) return c.json({ ok: true })
  // Solo se notifica una confirmación real.
  if (reg.status !== 'confirmed') return c.json({ ok: true })

  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const sendError = await sendConfirmationEmail({
    email: c.env.EMAIL,
    from: c.env.EMAIL_FROM,
    to: reg.email,
    firstName: reg.first_name,
    eventName: extractEventName(reg.events),
    credentialUrl: `${base}/credencial/${reg.credential_token}`,
  })

  await supabase.from('email_log').insert({
    organization_id: reg.organization_id,
    registration_id: reg.id,
    email_type: 'payment_confirmed',
    status: sendError ? 'failed' : 'sent',
    sent_at: sendError ? null : new Date().toISOString(),
  })

  if (sendError) {
    console.error('[confirm-notify] envío fallido:', sendError)
    return c.json({ ok: false }, 502)
  }
  return c.json({ ok: true })
})

const participationNotifySchema = z.object({ participation_id: z.string().uuid() })

app.post('/api/program-participations/notify', async (c) => {
  const parsed = participationNotifySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400)
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase
    .from('event_participations')
    .select('id,status,credential_token,people(first_name,email),event_programs(name,organization_id)')
    .eq('id', parsed.data.participation_id)
    .maybeSingle()
  if (error || !data || data.status !== 'approved') return c.json({ ok: true })
  const personRaw = Array.isArray(data.people) ? data.people[0] : data.people
  const programRaw = Array.isArray(data.event_programs) ? data.event_programs[0] : data.event_programs
  const person = personRaw as { first_name?: string; email?: string } | null
  const program = programRaw as { name?: string; organization_id?: string } | null
  if (!person?.email || !program?.organization_id) return c.json({ ok: true })
  const base = c.env.APP_BASE_URL.replace(/\/$/, '')
  const sendError = await sendConfirmationEmail({
    email: c.env.EMAIL,
    from: c.env.EMAIL_FROM,
    to: person.email,
    firstName: person.first_name ?? 'Participante',
    eventName: program.name ?? 'Tu evento',
    credentialUrl: `${base}/credencial/${data.credential_token}`,
  })
  await supabase.from('email_log').insert({
    organization_id: program.organization_id,
    registration_id: null,
    email_type: 'program_credential',
    status: sendError ? 'failed' : 'sent',
    sent_at: sendError ? null : new Date().toISOString(),
  })
  if (sendError) return c.json({ ok: false }, 502)
  return c.json({ ok: true })
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
  const { data: company } = await supabase.from('companies').select('id,name,kind').eq('id', parsed.data.company_id).maybeSingle()
  if (!event || !company || !['exhibitor', 'sponsor'].includes(company.kind)) return c.json({ error: 'Empresa o evento inválido' }, 400)
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
