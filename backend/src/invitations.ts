import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { hashToken } from './participant'

type Bindings = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }
export const invitationsApi = new Hono<{ Bindings: Bindings }>()
const secret = z.string().regex(/^[a-f0-9]{64}$/)
const base = z.object({ event_id: z.string().uuid(), code: secret })
invitationsApi.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await db.rpc('participant_rate_limit', {
    p_key: 'invitation:' + await hashToken(c.req.header('CF-Connecting-IP') ?? 'unknown'), p_limit: 30,
  })
  if (error || !data) return c.json({ error: 'Espera antes de volver a intentarlo.' }, 429)
  await next()
})
invitationsApi.post('/redeem', async c => {
  const parsed = base.extend({ request: secret, first_name: z.string().trim().min(2).max(120), last_name: z.string().trim().max(120), email: z.string().trim().email().max(254), phone: z.string().trim().max(60) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Revisa el código y los datos del registro.' }, 400)
  const x = parsed.data
  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await db.rpc('redeem_event_invitation', { p_event: x.event_id, p_code: x.code, p_request: x.request, p_first: x.first_name, p_last: x.last_name, p_email: x.email, p_phone: x.phone })
  if (error) return c.json({ error: error.code === '23505' ? 'Ya existe un registro con ese correo. Recupera tu registro o consulta al organizador.' : error.message }, 400)
  return c.json(data)
})
invitationsApi.post('/household', async c => {
  const parsed = base.extend({ member_id: z.string().uuid().optional(), response: z.enum(['accepted', 'declined']).optional(), first_name: z.string().trim().min(2).max(120).optional(), last_name: z.string().trim().max(120).optional() }).refine(x => !!x.member_id === !!x.response).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Enlace o respuesta no válidos.' }, 400)
  const x = parsed.data
  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await db.rpc('social_household_access', { p_event: x.event_id, p_code: x.code, p_member: x.member_id ?? null, p_response: x.response ?? null, p_first: x.first_name ?? null, p_last: x.last_name ?? null })
  if (error) return c.json({ error: error.message }, 400)
  return c.json(data)
})
