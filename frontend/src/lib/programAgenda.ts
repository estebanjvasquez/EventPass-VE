export type AgendaBlock = {
  id: string;
  event_id: string | null;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  mode: "summary" | "sessions" | "both";
};
export type AgendaConfig = {
  title: string;
  timezone: string;
  presentation: "summary" | "detailed";
  blocks: AgendaBlock[];
};
export type PublicSession = {
  session_id: string;
  session_name: string;
  session_description?: string;
  starts_at: string | null;
  ends_at: string | null;
  stage_name: string | null;
  session_type: string;
  session_status: string;
  speakers: { full_name: string; company?: string; position?: string }[];
};
export type AgendaEvent = {
  id: string;
  name: string;
  description: string | null;
  event_type: string;
  start_date: string | null;
  end_date: string | null;
  sessions: PublicSession[];
};
export type PublicAgenda = {
  name: string;
  config: AgendaConfig | null;
  events: AgendaEvent[];
};
export const emptyAgenda: AgendaConfig = {
  title: "Programa general",
  timezone: "America/Caracas",
  presentation: "detailed",
  blocks: [],
};
export function agendaDate(value: string | null, timezone: string) {
  return value
    ? new Intl.DateTimeFormat("es-VE", {
        timeZone: timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Horario por confirmar";
}
export function agendaDay(value: string | null, timezone: string) {
  return value
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "";
}
export function agendaDays(start: string, end: string, timezone: string) {
  if (!start) return [];
  const first = agendaDay(start, timezone),
    last = agendaDay(end || start, timezone);
  const result: string[] = [];
  const cursor = new Date(`${first}T12:00:00Z`);
  for (
    let i = 0;
    i < 366 && cursor.toISOString().slice(0, 10) <= last;
    i++, cursor.setUTCDate(cursor.getUTCDate() + 1)
  )
    result.push(cursor.toISOString().slice(0, 10));
  return result;
}
export function agendaWallTime(value: string, timezone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function agendaInstant(value: string, timezone: string) {
  if (!value) return "";
  const target = Date.parse(`${value}Z`);
  let instant = target;
  for (let i = 0; i < 3; i++)
    instant +=
      target -
      Date.parse(
        `${agendaWallTime(new Date(instant).toISOString(), timezone)}Z`,
      );
  const result = new Date(instant).toISOString();
  if (agendaWallTime(result, timezone) !== value)
    throw new Error("Esa hora no existe en la zona horaria elegida.");
  return result;
}
