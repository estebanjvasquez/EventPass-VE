export type TicketCategory = { id: string; name: string; description: string; benefits: string[]; price: number; currency: string; remaining: number | null; published?: boolean; capacity?: number | null; sales_start?: string | null; sales_end?: string | null };
export type PurchaseSnapshot = { event_name?: string; starts_at?: string | null; timezone?: string; venue?: string | null; category?: string | null; benefits?: string[] | null; amount?: number | null; currency?: string | null; seat?: string | null; legacy?: boolean };
export type ParticipantRecord = { id: string; reference: string; event_id?: string | null; program_id?: string | null; name: string; status: string; reason?: string | null; deadline?: string | null; snapshot: PurchaseSnapshot; credential_token?: string | null; upload_token?: string | null; passes?: string[]; email_status?: string | null };
export function purchasePrice(amount: number | null | undefined, currency?: string | null) {
  if (amount == null) return "Importe no registrado; consulta al organizador";
  if (Number(amount) === 0) return "Gratuito";
  return `${Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? 'USD'}`;
}
export function participantState(record: Pick<ParticipantRecord,'status'|'deadline'|'reason'>, now = Date.now()) {
  if (record.status === 'confirmed') return { label: 'Confirmado', detail: 'Tu credencial está disponible.' };
  if (record.status === 'payment_submitted') return { label: 'Comprobante recibido', detail: 'El organizador está revisando tu pago.' };
  if (record.status === 'pending_approval') return { label: 'Pendiente de aprobación', detail: 'El organizador está revisando tu participación.' };
  if (record.status === 'cancelled') return { label: 'Cancelado', detail: 'Contacta al organizador para consultar las opciones disponibles.' };
  if ((record.status === 'pending_payment' && record.deadline && new Date(record.deadline).getTime() <= now) || (record.status === 'rejected' && record.reason === 'Plazo de pago vencido')) return { label: 'Plazo vencido', detail: 'El plazo terminó. Contacta al organizador antes de realizar un pago.' };
  if (record.status === 'rejected') return { label: 'Rechazado', detail: record.reason || 'Contacta al organizador para conocer el motivo.' };
  return { label: 'Pendiente de pago', detail: 'Carga tu comprobante antes de que venza el plazo.' };
}
export function purchaseDate(value?: string | null, timezone = 'America/Caracas') {
  if (!value) return 'Por confirmar';
  try { return new Intl.DateTimeFormat('es-VE', { dateStyle: 'long', timeStyle: 'short', timeZone: timezone }).format(new Date(value)); }
  catch { return 'Por confirmar'; }
}
export function emailState(status?: string | null) {
  if (status === 'delivered') return 'Entregado';
  if (status === 'accepted' || status === 'sent') return 'Aceptado por el proveedor; entrega no confirmada';
  if (status === 'failed' || status === 'bounced' || status === 'suppressed') return 'No se pudo entregar';
  return 'Sin confirmación de envío';
}
