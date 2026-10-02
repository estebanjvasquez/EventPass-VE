export const EVENT_TYPE_LABEL: Record<string, string> = {
  forum: "Foro",
  exhibition: "Exposición",
  workshop: "Taller",
  social: "Encuentro social",
};

export const EVENT_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  closed: "Cerrado",
  archived: "Archivado",
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  confirmed: "Confirmado",
  active: "Activo",
  inactive: "Inactivo",
  unpaid: "Pendiente de pago",
  partial: "Pago parcial",
  paid: "Pagado",
  overdue: "Vencido",
  payment_submitted: "Comprobante recibido",
  pending_payment: "Pendiente de pago",
  completed: "Completado",
};

export const PARTICIPATION_TYPE_LABEL: Record<string, string> = {
  attendee: "Asistente",
  guest: "Invitado",
  vip: "Invitado VIP",
  speaker: "Ponente",
  exhibitor: "Expositor",
  staff: "Personal",
  security: "Seguridad",
};

export const ACCESS_MODE_LABEL: Record<string, string> = {
  program: "Evento",
  day: "Día",
  session: "Sesión",
  zone: "Zona",
};

export function displayLabel(values: Record<string, string>, value: string | null | undefined) {
  if (!value) return "Sin definir";
  return values[value] ?? value.replaceAll("_", " ");
}

export type LaunchCheck = {
  key: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  detail: string;
};

export type EventReadiness = {
  event_id: string;
  can_publish: boolean;
  checks: LaunchCheck[];
};

export type PublicRegistrationState = {
  available: boolean;
  reason?: string | null;
  payment_required?: boolean;
  price_known?: boolean;
  payment_methods_ready?: boolean;
};
