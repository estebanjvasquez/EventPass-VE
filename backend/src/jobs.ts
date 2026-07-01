// Tareas programadas del Worker (Cron Trigger horario):
//   1. Liberar plazas cuyo plazo de pago venció (status pending_payment).
//   2. Enviar recordatorios de pago a los días 3/7/9 mientras el plazo siga abierto.
// Usa el cliente service-role (omite RLS). Idempotente: la desduplicación de
// recordatorios se apoya en email_log; la expiración filtra por estado + plazo.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendReminderEmail, type EmailSendBinding } from './email'

const REMINDER_DAYS = [3, 7, 9] as const
const DAY_MS = 86_400_000

type JobEnv = {
  EMAIL: EmailSendBinding
  EMAIL_FROM: string
  APP_BASE_URL: string
}

export type JobResult = {
  expired: number
  reminders: number
  errors: string[]
}

type PaymentMethod = { name: string; details: Record<string, unknown> | null }

function eventName(events: unknown): string {
  if (!events) return 'Tu evento'
  const row = Array.isArray(events) ? events[0] : events
  const name = (row as { name?: string } | undefined)?.name
  return name ?? 'Tu evento'
}

export async function runScheduledJobs(
  supabase: SupabaseClient,
  env: JobEnv,
): Promise<JobResult> {
  const result: JobResult = { expired: 0, reminders: 0, errors: [] }
  await releaseExpiredSlots(supabase, result)
  await sendPaymentReminders(supabase, env, result)
  return result
}

async function releaseExpiredSlots(supabase: SupabaseClient, result: JobResult) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('registrations')
    .select('id, organization_id, seat_id')
    .eq('status', 'pending_payment')
    .lt('payment_deadline', nowIso)
    .limit(500)
  if (error) {
    result.errors.push(`expired query: ${error.message}`)
    return
  }
  for (const r of data ?? []) {
    // Guard de carrera: solo actualiza si sigue pendiente.
    const { error: upErr } = await supabase
      .from('registrations')
      .update({ status: 'rejected', rejection_reason: 'Plazo de pago vencido', seat_id: null })
      .eq('id', r.id)
      .eq('status', 'pending_payment')
    if (upErr) {
      result.errors.push(`expire ${r.id}: ${upErr.message}`)
      continue
    }
    if (r.seat_id) {
      await supabase.from('seats').update({ status: 'available' }).eq('id', r.seat_id)
    }
    await supabase.from('admin_actions').insert({
      organization_id: r.organization_id,
      action: 'auto_expire_registration',
      registration_id: r.id,
    })
    result.expired++
  }
}

async function sendPaymentReminders(
  supabase: SupabaseClient,
  env: JobEnv,
  result: JobResult,
) {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const minAgeIso = new Date(now - REMINDER_DAYS[0] * DAY_MS).toISOString()

  // Candidatos: pendientes, con al menos 3 días de antigüedad y plazo aún abierto.
  const { data: regs, error } = await supabase
    .from('registrations')
    .select(
      'id, organization_id, first_name, email, credential_token, created_at, payment_deadline, events(name)',
    )
    .eq('status', 'pending_payment')
    .lte('created_at', minAgeIso)
    .gt('payment_deadline', nowIso)
    .limit(300)
  if (error) {
    result.errors.push(`reminders query: ${error.message}`)
    return
  }
  if (!regs || regs.length === 0) return

  const ids = regs.map((r) => r.id)
  const { data: logs } = await supabase
    .from('email_log')
    .select('registration_id, email_type')
    .in('registration_id', ids)
    .like('email_type', 'reminder_d%')
  const sent = new Set((logs ?? []).map((l) => `${l.registration_id}:${l.email_type}`))

  const pmCache = new Map<string, PaymentMethod[]>()
  const base = env.APP_BASE_URL.replace(/\/$/, '')

  for (const r of regs) {
    const daysSince = Math.floor((now - new Date(r.created_at).getTime()) / DAY_MS)
    // El recordatorio más avanzado que corresponde y aún no se ha enviado.
    const dueType = REMINDER_DAYS.filter((t) => daysSince >= t)
      .map((t) => `reminder_d${t}`)
      .filter((t) => !sent.has(`${r.id}:${t}`))
      .pop()
    if (!dueType) continue

    let methods = pmCache.get(r.organization_id)
    if (!methods) {
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('name, details')
        .eq('organization_id', r.organization_id)
        .eq('is_active', true)
      methods = (pm ?? []) as PaymentMethod[]
      pmCache.set(r.organization_id, methods)
    }

    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(r.payment_deadline).getTime() - now) / DAY_MS),
    )
    const sendError = await sendReminderEmail({
      email: env.EMAIL,
      from: env.EMAIL_FROM,
      to: r.email,
      firstName: r.first_name,
      eventName: eventName(r.events),
      uploadUrl: `${base}/comprobante/${r.credential_token}`,
      daysLeft,
      paymentMethods: methods,
    })

    await supabase.from('email_log').insert({
      organization_id: r.organization_id,
      registration_id: r.id,
      email_type: dueType,
      status: sendError ? 'failed' : 'sent',
      sent_at: sendError ? null : new Date().toISOString(),
    })
    if (sendError) result.errors.push(`reminder ${r.id}: ${sendError}`)
    else result.reminders++
  }
}
