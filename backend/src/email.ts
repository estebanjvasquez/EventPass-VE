// Envío de correos transaccionales con el binding nativo de Cloudflare
// Email Sending (`send_email`). No requiere API key ni servicio externo: la
// autenticación es el propio binding y un dominio remitente verificado.

// Forma mínima del binding `send_email` (API moderna por objeto). Se tipa aquí
// para no depender de la versión de @cloudflare/workers-types.
export type EmailSendBinding = {
  send(message: {
    to: string
    from: string | { email: string; name?: string }
    replyTo?: string
    subject: string
    html?: string
    text?: string
  }): Promise<unknown>
}

type PaymentMethod = {
  name: string
  details: Record<string, unknown> | null
}

type UploadLinkParams = {
  email: EmailSendBinding
  from: string
  to: string
  firstName: string
  eventName: string
  uploadUrl: string
  paymentMethods: PaymentMethod[]
  context?: EventEmailContext
}

export type EventEmailContext = {
  organizerName?: string | null
  logoUrl?: string | null
  accentColor?: string | null
  startsAt?: string | null
  endsAt?: string | null
  venueName?: string | null
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

const sender = (email: string, name?: string | null) => ({ email, name: name?.trim() || 'EventosFácil' })
const replyTo = 'soporte@eventosfacil.net'

function accent(context?: EventEmailContext): string {
  return /^#[0-9a-f]{6}$/i.test(context?.accentColor ?? '') ? context!.accentColor! : '#059669'
}

function logoHtml(context?: EventEmailContext): string {
  if (!context?.logoUrl || !/^https:\/\//i.test(context.logoUrl)) return ''
  return `<img src="${esc(context.logoUrl)}" alt="${esc(context.organizerName ?? 'Organizador')}" style="display:block;max-height:56px;max-width:180px;object-fit:contain;margin:0 0 20px">`
}

function formatDate(value?: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('es-VE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Caracas' }).format(parsed)
}

function eventDetailsHtml(context?: EventEmailContext): string {
  const startsAt = formatDate(context?.startsAt)
  const rows = [
    startsAt ? `<div><strong>Fecha:</strong> ${esc(startsAt)}</div>` : '',
    context?.venueName ? `<div><strong>Lugar:</strong> ${esc(context.venueName)}</div>` : '',
  ].filter(Boolean)
  return rows.length ? `<div style="margin:20px 0 0;padding:14px 16px;background:#fafafa;border-radius:10px;font-size:14px;line-height:1.6;color:#3f3f46">${rows.join('')}</div>` : ''
}

function eventDetailsText(context?: EventEmailContext): string {
  const startsAt = formatDate(context?.startsAt)
  const rows = [startsAt ? `Fecha: ${startsAt}` : '', context?.venueName ? `Lugar: ${context.venueName}` : ''].filter(Boolean)
  return rows.length ? `\n\n${rows.join('\n')}` : ''
}

export type EmailDeliveryResult = {
  ok: boolean
  providerMessageId: string | null
  providerStatus: 'accepted' | 'failed'
  errorCode: string | null
  errorDetail: string | null
}

function accepted(result: unknown): EmailDeliveryResult {
  const row = result && typeof result === 'object' ? result as Record<string, unknown> : null
  return {
    ok: true,
    providerMessageId: typeof row?.messageId === 'string' ? row.messageId : null,
    providerStatus: 'accepted',
    errorCode: null,
    errorDetail: null,
  }
}

function failed(error: unknown): EmailDeliveryResult {
  const row = error && typeof error === 'object' ? error as Record<string, unknown> : null
  return {
    ok: false,
    providerMessageId: null,
    providerStatus: 'failed',
    errorCode: typeof row?.code === 'string' ? row.code : null,
    errorDetail: error instanceof Error ? error.message : String(error),
  }
}

function paymentMethodsHtml(methods: PaymentMethod[]): string {
  if (methods.length === 0) return ''
  const items = methods
    .map((m) => {
      const rows = Object.entries(m.details ?? {})
        .map(
          ([k, v]) =>
            `<div style="font-size:13px;color:#52525b"><span style="color:#a1a1aa;text-transform:capitalize">${esc(
              k,
            )}:</span> ${esc(String(v))}</div>`,
        )
        .join('')
      return `<li style="margin:0 0 12px;padding:12px 14px;background:#fafafa;border-radius:8px;list-style:none">
        <div style="font-weight:600;font-size:14px;color:#27272a">${esc(m.name)}</div>${rows}</li>`
    })
    .join('')
  return `<p style="font-weight:600;color:#27272a;margin:24px 0 8px">Datos de pago</p>
    <ul style="margin:0;padding:0">${items}</ul>`
}

function paymentMethodsText(methods: PaymentMethod[]): string {
  if (methods.length === 0) return ''
  const lines = methods
    .map((m) => {
      const detail = Object.entries(m.details ?? {})
        .map(([k, v]) => `   ${k}: ${String(v)}`)
        .join('\n')
      return ` - ${m.name}\n${detail}`
    })
    .join('\n')
  return `\n\nDatos de pago:\n${lines}`
}

export function uploadLinkEmailHtml(p: UploadLinkParams): string {
  const color = accent(p.context)
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px">
      ${logoHtml(p.context)}
      <p style="font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:${color};margin:0">
        ${esc(p.eventName)}
      </p>
      <h1 style="font-size:24px;color:#18181b;margin:8px 0 0">Hola, ${esc(p.firstName)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#52525b;margin:16px 0 0">
        Recibimos tu registro. Para completar tu inscripción, realiza el pago y
        carga tu comprobante en el siguiente enlace:
      </p>
      <p style="margin:24px 0">
        <a href="${esc(p.uploadUrl)}"
           style="display:inline-block;background:${color};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px">
          Cargar mi comprobante
        </a>
      </p>
      ${eventDetailsHtml(p.context)}
      ${paymentMethodsHtml(p.paymentMethods)}
      <p style="font-size:12px;color:#a1a1aa;margin:24px 0 0;word-break:break-all">
        Si el botón no funciona, copia este enlace:<br>${esc(p.uploadUrl)}
      </p>
    </div>
    <p style="text-align:center;font-size:12px;color:#a1a1aa;margin:16px 0 0">
      ${esc(p.context?.organizerName ?? 'EventosFácil')}
    </p>
  </div>
</body></html>`
}

export function uploadLinkEmailText(p: UploadLinkParams): string {
  return `Hola, ${p.firstName}

Recibimos tu registro para "${p.eventName}". Para completar tu inscripción,
realiza el pago y carga tu comprobante en este enlace:

${p.uploadUrl}${eventDetailsText(p.context)}${paymentMethodsText(p.paymentMethods)}

— ${p.context?.organizerName ?? 'EventosFácil'}`
}

// Devuelve null si se envió bien; un mensaje de error en caso contrario.
export async function sendUploadLinkEmail(p: UploadLinkParams): Promise<EmailDeliveryResult> {
  try {
    const result = await p.email.send({
      to: p.to,
      from: sender(p.from, p.context?.organizerName),
      replyTo,
      subject: `Completa tu inscripción — ${p.eventName}`,
      html: uploadLinkEmailHtml(p),
      text: uploadLinkEmailText(p),
    })
    return accepted(result)
  } catch (err) {
    return failed(err)
  }
}

// ---------------------------------------------------------------------------
// Recordatorio de pago (cron: días 3/7/9 mientras el plazo siga abierto).
// ---------------------------------------------------------------------------
type ReminderParams = UploadLinkParams & { daysLeft: number }

function plazoFrase(daysLeft: number): string {
  if (daysLeft <= 0) return 'Tu plazo vence hoy'
  if (daysLeft === 1) return 'Te queda 1 día'
  return `Te quedan ${daysLeft} días`
}

export function reminderEmailHtml(p: ReminderParams): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px">
      <p style="font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#059669;margin:0">
        ${esc(p.eventName)}
      </p>
      <h1 style="font-size:24px;color:#18181b;margin:8px 0 0">Hola, ${esc(p.firstName)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#52525b;margin:16px 0 0">
        Tu plaza sigue reservada, pero aún no hemos recibido tu comprobante de
        pago. <strong style="color:#b45309">${esc(plazoFrase(p.daysLeft))}</strong>
        para completar tu inscripción antes de que la plaza se libere.
      </p>
      <p style="margin:24px 0">
        <a href="${esc(p.uploadUrl)}"
           style="display:inline-block;background:#059669;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px">
          Cargar mi comprobante
        </a>
      </p>
      ${paymentMethodsHtml(p.paymentMethods)}
      <p style="font-size:12px;color:#a1a1aa;margin:24px 0 0;word-break:break-all">
        Si el botón no funciona, copia este enlace:<br>${esc(p.uploadUrl)}
      </p>
    </div>
    <p style="text-align:center;font-size:12px;color:#a1a1aa;margin:16px 0 0">
      EventPass VE
    </p>
  </div>
</body></html>`
}

function reminderEmailText(p: ReminderParams): string {
  return `Hola, ${p.firstName}

Tu plaza para "${p.eventName}" sigue reservada, pero aún no recibimos tu
comprobante de pago. ${plazoFrase(p.daysLeft)} para completar tu inscripción
antes de que la plaza se libere.

Carga tu comprobante aquí:
${p.uploadUrl}${paymentMethodsText(p.paymentMethods)}

— EventPass VE`
}

export async function sendReminderEmail(p: ReminderParams): Promise<string | null> {
  try {
    await p.email.send({
      to: p.to,
      from: sender(p.from),
      replyTo,
      subject: `Recordatorio: completa tu pago — ${p.eventName}`,
      html: reminderEmailHtml(p),
      text: reminderEmailText(p),
    })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

// ---------------------------------------------------------------------------
// Aviso al organizador: resumen de plazas liberadas por vencimiento de pago.
// ---------------------------------------------------------------------------
type ReleasedItem = { attendee: string; eventName: string }

type SlotReleaseParams = {
  email: EmailSendBinding
  from: string
  to: string
  orgName: string
  items: ReleasedItem[]
}

export function slotReleaseEmailHtml(p: SlotReleaseParams): string {
  const rows = p.items
    .map(
      (it) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;font-size:14px;color:#27272a">${esc(it.attendee)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;font-size:14px;color:#52525b">${esc(it.eventName)}</td>
        </tr>`,
    )
    .join('')
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px">
      <p style="font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#b45309;margin:0">
        Plazas liberadas
      </p>
      <h1 style="font-size:22px;color:#18181b;margin:8px 0 0">${esc(p.orgName)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#52525b;margin:16px 0 0">
        Se ${p.items.length === 1 ? 'liberó 1 plaza' : `liberaron ${p.items.length} plazas`}
        por vencimiento del plazo de pago. Estos registros pasaron a rechazados
        y su asiento volvió a estar disponible:
      </p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0 0">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#a1a1aa">Asistente</th>
            <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#a1a1aa">Evento</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="text-align:center;font-size:12px;color:#a1a1aa;margin:16px 0 0">
      EventPass VE · aviso automático
    </p>
  </div>
</body></html>`
}

function slotReleaseEmailText(p: SlotReleaseParams): string {
  const lines = p.items.map((it) => ` - ${it.attendee} (${it.eventName})`).join('\n')
  return `${p.orgName} — Plazas liberadas

Se ${p.items.length === 1 ? 'liberó 1 plaza' : `liberaron ${p.items.length} plazas`} por vencimiento del plazo de pago.
Estos registros pasaron a rechazados y su asiento volvió a estar disponible:

${lines}

— EventPass VE (aviso automático)`
}

export async function sendSlotReleaseEmail(p: SlotReleaseParams): Promise<string | null> {
  try {
    await p.email.send({
      to: p.to,
      from: sender(p.from),
      replyTo,
      subject: `Plazas liberadas (${p.items.length}) — ${p.orgName}`,
      html: slotReleaseEmailHtml(p),
      text: slotReleaseEmailText(p),
    })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

// ---------------------------------------------------------------------------
// Aviso al asistente: su plaza se liberó por no completar el pago a tiempo.
// ---------------------------------------------------------------------------
type SlotExpiredParams = {
  email: EmailSendBinding
  from: string
  to: string
  firstName: string
  eventName: string
}

export function slotExpiredEmailHtml(p: SlotExpiredParams): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px">
      <p style="font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#b45309;margin:0">
        ${esc(p.eventName)}
      </p>
      <h1 style="font-size:24px;color:#18181b;margin:8px 0 0">Hola, ${esc(p.firstName)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#52525b;margin:16px 0 0">
        Tu plaza se liberó porque no recibimos tu comprobante de pago dentro del
        plazo. Sabemos que a veces surgen imprevistos: si aún deseas asistir,
        puedes registrarte de nuevo mientras haya cupos disponibles.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#71717a;margin:16px 0 0">
        Si ya realizaste el pago, responde a este correo y lo revisamos.
      </p>
    </div>
    <p style="text-align:center;font-size:12px;color:#a1a1aa;margin:16px 0 0">
      EventPass VE
    </p>
  </div>
</body></html>`
}

function slotExpiredEmailText(p: SlotExpiredParams): string {
  return `Hola, ${p.firstName}

Tu plaza para "${p.eventName}" se liberó porque no recibimos tu comprobante de
pago dentro del plazo. Si aún deseas asistir, puedes registrarte de nuevo
mientras haya cupos disponibles.

Si ya realizaste el pago, responde a este correo y lo revisamos.

— EventPass VE`
}

export async function sendSlotExpiredEmail(p: SlotExpiredParams): Promise<string | null> {
  try {
    await p.email.send({
      to: p.to,
      from: sender(p.from),
      replyTo,
      subject: `Tu plaza se liberó — ${p.eventName}`,
      html: slotExpiredEmailHtml(p),
      text: slotExpiredEmailText(p),
    })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

// ---------------------------------------------------------------------------
// Confirmación de pago: se envía cuando el organizador confirma el registro.
// Incluye el enlace a la credencial con QR.
// ---------------------------------------------------------------------------
type ConfirmationParams = {
  email: EmailSendBinding
  from: string
  to: string
  firstName: string
  eventName: string
  credentialUrl: string
  kind: 'free_registration' | 'payment_confirmed' | 'program_approved'
  activityName?: string | null
  context?: EventEmailContext
}

export function confirmationEmailHtml(p: ConfirmationParams): string {
  const color = accent(p.context)
  const title = p.kind === 'payment_confirmed'
    ? '¡Pago confirmado!'
    : p.kind === 'program_approved'
      ? '¡Participación confirmada!'
      : '¡Registro confirmado!'
  const message = p.kind === 'payment_confirmed'
    ? `Hola, ${esc(p.firstName)}. Verificamos tu pago y tu plaza está confirmada.`
    : p.kind === 'program_approved'
      ? `Hola, ${esc(p.firstName)}. Tu participación en ${esc(p.activityName ?? p.eventName)} fue aprobada.`
      : `Hola, ${esc(p.firstName)}. Tu registro gratuito está confirmado.`
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px">
      ${logoHtml(p.context)}
      <p style="font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:${color};margin:0">
        ${esc(p.eventName)}
      </p>
      <h1 style="font-size:24px;color:#18181b;margin:8px 0 0">${title}</h1>
      <p style="font-size:15px;line-height:1.6;color:#52525b;margin:16px 0 0">
        ${message} Abre tu credencial con el código QR y preséntala en el ingreso.
      </p>
      <p style="margin:24px 0">
        <a href="${esc(p.credentialUrl)}"
           style="display:inline-block;background:${color};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px">
          Ver mi credencial
        </a>
      </p>
      ${eventDetailsHtml(p.context)}
      <p style="font-size:12px;color:#a1a1aa;margin:24px 0 0;word-break:break-all">
        Si el botón no funciona, copia este enlace:<br>${esc(p.credentialUrl)}
      </p>
    </div>
    <p style="text-align:center;font-size:12px;color:#a1a1aa;margin:16px 0 0">
      ${esc(p.context?.organizerName ?? 'EventosFácil')}
    </p>
  </div>
</body></html>`
}

export function confirmationEmailText(p: ConfirmationParams): string {
  const title = p.kind === 'payment_confirmed' ? '¡Pago confirmado!' : p.kind === 'program_approved' ? '¡Participación confirmada!' : '¡Registro confirmado!'
  const message = p.kind === 'payment_confirmed'
    ? `Hola, ${p.firstName}. Verificamos tu pago y tu plaza está confirmada.`
    : p.kind === 'program_approved'
      ? `Hola, ${p.firstName}. Tu participación en ${p.activityName ?? p.eventName} fue aprobada.`
      : `Hola, ${p.firstName}. Tu registro gratuito está confirmado.`
  return `${title} — ${p.eventName}

${message}
Abre tu credencial con el código QR y preséntala en el ingreso.

${p.credentialUrl}${eventDetailsText(p.context)}

— ${p.context?.organizerName ?? 'EventosFácil'}`
}

export async function sendConfirmationEmail(p: ConfirmationParams): Promise<EmailDeliveryResult> {
  try {
    const result = await p.email.send({
      to: p.to,
      from: sender(p.from, p.context?.organizerName),
      replyTo,
      subject: `${p.kind === 'payment_confirmed' ? 'Pago confirmado' : p.kind === 'program_approved' ? 'Participación confirmada' : 'Registro confirmado'} — ${p.eventName}`,
      html: confirmationEmailHtml(p),
      text: confirmationEmailText(p),
    })
    return accepted(result)
  } catch (err) {
    return failed(err)
  }
}

type PortalInviteParams = {
  email: EmailSendBinding
  from: string
  to: string
  companyName: string
  eventName: string
  actionUrl: string
  portalUrl: string
}

export function portalInviteEmailHtml(p: PortalInviteParams): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px"><p style="font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#059669;margin:0">Portal de expositores</p><h1 style="font-size:24px;color:#18181b;margin:8px 0 0">Invitación para ${esc(p.companyName)}</h1><p style="font-size:15px;line-height:1.6;color:#52525b;margin:16px 0 0">Te invitamos a gestionar la participación de <strong>${esc(p.companyName)}</strong> en ${esc(p.eventName)}. Define tu contraseña para acceder al portal.</p><p style="margin:24px 0"><a href="${esc(p.actionUrl)}" style="display:inline-block;background:#059669;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px">Definir contraseña y entrar</a></p><p style="font-size:12px;color:#71717a;line-height:1.5">Después de definir tu contraseña podrás acceder al portal desde:<br><a href="${esc(p.portalUrl)}">${esc(p.portalUrl)}</a></p><p style="font-size:12px;color:#a1a1aa;margin:24px 0 0;word-break:break-all">Si el botón no funciona, copia este enlace:<br>${esc(p.actionUrl)}</p></div><p style="text-align:center;font-size:12px;color:#a1a1aa;margin:16px 0 0">EventosFácil</p></div></body></html>`
}

export function portalInviteEmailText(p: PortalInviteParams): string {
  return `Invitación al portal de ${p.companyName}

Te invitamos a gestionar la participación de ${p.companyName} en ${p.eventName}.
Define tu contraseña aquí:
${p.actionUrl}

Portal: ${p.portalUrl}

— EventosFácil`
}

export async function sendPortalInviteEmail(p: PortalInviteParams): Promise<string | null> {
  try {
    await p.email.send({ to: p.to, from: sender(p.from), replyTo, subject: `Invitación al portal — ${p.companyName}`, html: portalInviteEmailHtml(p), text: portalInviteEmailText(p) })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

type ProviderNoticeParams = { email: EmailSendBinding; from: string; to: string; providerName: string; eventName: string; subject: string; message: string }
export async function sendProviderNoticeEmail(p: ProviderNoticeParams): Promise<string | null> {
  try {
    const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:28px"><p style="color:#059669;font-size:12px;font-weight:bold;text-transform:uppercase">EventosFácil · ${esc(p.eventName)}</p><h1 style="font-size:22px;color:#18181b">${esc(p.subject)}</h1><p style="color:#52525b;line-height:1.6">Hola ${esc(p.providerName)},</p><p style="color:#52525b;line-height:1.6">${esc(p.message)}</p><p style="color:#a1a1aa;font-size:12px">Responde a este correo si necesitas aclaraciones.</p></div></body></html>`
    await p.email.send({ to: p.to, from: sender(p.from), replyTo, subject: p.subject, html, text: `Hola ${p.providerName},\n\n${p.message}\n\nEvento: ${p.eventName}` })
    return null
  } catch (err) { return err instanceof Error ? err.message : String(err) }
}
