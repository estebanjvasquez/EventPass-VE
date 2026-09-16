import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  agendaDate,
  agendaDay,
  agendaDays,
  type PublicAgenda,
} from "../lib/programAgenda";

export function ProgramaAgendaView({ agenda }: { agenda: PublicAgenda }) {
  const [day, setDay] = useState("");
  const [activity, setActivity] = useState("");
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const config = agenda.config;
  if (!config)
    return (
      <p className="mt-6 rounded-lg bg-amber-50 p-5">
        El programa general aún no se ha publicado.
      </p>
    );
  const tz = config.timezone;
  const blocks = config.blocks.length
    ? config.blocks
    : agenda.events.map((e) => ({
        id: e.id,
        event_id: e.id,
        title: e.name,
        description: e.description ?? "",
        location: "",
        starts_at: e.start_date ?? "",
        ends_at: e.end_date ?? "",
        mode: "both" as const,
      }));
  const dates = [
    ...new Set(
      blocks
        .flatMap((b) => [
          ...agendaDays(b.starts_at, b.ends_at, tz),
          ...(
            agenda.events.find((e) => e.id === b.event_id)?.sessions ?? []
          ).map((s) => agendaDay(s.starts_at, tz)),
        ])
        .filter(Boolean),
    ),
  ].sort();
  const locations = [
    ...new Set(
      blocks
        .flatMap((b) => [
          b.location,
          ...(
            agenda.events.find((e) => e.id === b.event_id)?.sessions ?? []
          ).map((s) => s.stage_name ?? ""),
        ])
        .filter(Boolean),
    ),
  ].sort();
  let count = 0;
  return (
    <>
      <h2 className="mt-6 text-2xl font-bold">{config.title}</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Zona horaria: {tz}. Los horarios y requisitos corresponden a cada
        actividad.
      </p>
      <div className="my-6 grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          Día
          <select
            className="mt-1 w-full rounded-lg border p-2"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          >
            <option value="">Todos los días</option>
            {dates.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Actividad
          <select
            className="mt-1 w-full rounded-lg border p-2"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          >
            <option value="">Todas las actividades</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Sala o ubicación
          <select
            className="mt-1 w-full rounded-lg border p-2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">Todas las ubicaciones</option>
            {locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Buscar
          <input
            className="mt-1 w-full rounded-lg border p-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Actividad o ponente"
          />
        </label>
      </div>
      <div className="space-y-5">
        {blocks
          .filter((b) => !activity || b.id === activity)
          .sort(
            (a, b) =>
              (Date.parse(a.starts_at) || Number.MAX_SAFE_INTEGER) -
              (Date.parse(b.starts_at) || Number.MAX_SAFE_INTEGER),
          )
          .map((b) => {
            const event = agenda.events.find((e) => e.id === b.event_id);
            const matches = (text: string) =>
              text.toLowerCase().includes(search.toLowerCase());
            const sessions = (event?.sessions ?? []).filter(
              (s) =>
                config.presentation === "detailed" &&
                b.mode !== "summary" &&
                (!b.starts_at ||
                  !b.ends_at ||
                  agendaDay(b.starts_at, tz) !== agendaDay(b.ends_at, tz) ||
                  (s.starts_at !== null &&
                    Date.parse(s.starts_at) >= Date.parse(b.starts_at) &&
                    Date.parse(s.starts_at) < Date.parse(b.ends_at))) &&
                (!day || agendaDay(s.starts_at, tz) === day) &&
                (!location ||
                  s.stage_name === location ||
                  b.location === location) &&
                (matches(b.title) ||
                  matches(
                    `${s.session_name} ${s.speakers.map((p) => p.full_name).join(" ")}`,
                  )),
            );
            const inDay =
              !day ||
              (agendaDay(b.starts_at || null, tz) <= day &&
                agendaDay(b.ends_at || b.starts_at || null, tz) >= day);
            const summary =
              inDay &&
              (!location || b.location === location) &&
              matches(`${b.title} ${b.description}`);
            if (!summary && !sessions.length) return null;
            count++;
            return (
              <article key={b.id} className="rounded-xl border bg-white p-5">
                <p className="text-xs font-semibold uppercase text-emerald-700">
                  {event?.event_type === "exhibition"
                    ? "Exposición"
                    : event?.event_type === "forum"
                      ? "Foro"
                      : "Actividad"}
                </p>
                <h3 className="mt-2 text-xl font-bold">{b.title}</h3>
                <p className="mt-2 text-sm">
                  {agendaDate(b.starts_at || null, tz)}
                  {b.ends_at && ` — ${agendaDate(b.ends_at, tz)}`}
                  {b.location && ` · ${b.location}`}
                </p>
                {event?.event_type === "exhibition" &&
                  b.starts_at &&
                  b.ends_at &&
                  agendaDay(b.starts_at, tz) !== agendaDay(b.ends_at, tz) && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Duración general de la exposición; no implica apertura
                      continua. Consulta los horarios diarios publicados.
                    </p>
                  )}
                {b.mode !== "sessions" && (
                  <p className="mt-3 whitespace-pre-line text-zinc-600">
                    {b.description}
                  </p>
                )}
                {event && (
                  <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-emerald-700">
                    <Link to={`/e/${event.id}`}>Detalles e inscripción</Link>
                    {event.event_type === "exhibition" && (
                      <Link to={`/expo/${event.id}/plano`}>
                        Plano y expositores
                      </Link>
                    )}
                    {event.sessions.length > 0 && (
                      <Link to={`/e/${event.id}/agenda`}>Pantalla de sala</Link>
                    )}
                  </div>
                )}
                {config.presentation === "detailed" && b.mode !== "summary" && (
                  <div className="mt-4 space-y-3">
                    {sessions.map((s) => (
                      <details
                        key={s.session_id}
                        className="rounded-lg border p-4"
                      >
                        <summary className="cursor-pointer font-semibold">
                          {agendaDate(s.starts_at, tz)} · {s.session_name}
                          {s.stage_name && ` · ${s.stage_name}`}
                          {s.session_status === "cancelled" && " · Cancelada"}
                        </summary>
                        <p className="mt-3 whitespace-pre-line">
                          {s.session_description}
                        </p>
                        <p className="mt-2 text-sm">
                          Finaliza: {agendaDate(s.ends_at, tz)}
                        </p>
                        {s.speakers.map((p, i) => (
                          <p key={i} className="mt-2 text-sm">
                            {p.full_name}
                            {p.position && ` · ${p.position}`}
                            {p.company && ` · ${p.company}`}
                          </p>
                        ))}
                      </details>
                    ))}
                    {event &&
                      !event.sessions.length &&
                      event.event_type !== "exhibition" && (
                        <p className="text-sm text-zinc-500">
                          Detalle de sesiones pendiente de publicación.
                        </p>
                      )}
                  </div>
                )}
              </article>
            );
          })}
        {count === 0 && (
          <p className="rounded-lg bg-zinc-100 p-5">
            No hay actividades para estos filtros.
          </p>
        )}
      </div>
    </>
  );
}
export default function ProgramaAgenda() {
  const { programId, eventId } = useParams();
  const [params] = useSearchParams();
  const eventOnly = params.get("solo") === "evento";
  const [agenda, setAgenda] = useState<PublicAgenda | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setAgenda(null);
    setError("");
    void supabase
      .rpc("get_public_program_agenda", {
        p_program_id: programId ?? null,
        p_event_id: eventId ?? null,
        p_event_only: eventOnly,
      })
      .then(({ data, error }) => {
        if (alive) {
          setAgenda(data as PublicAgenda);
          setError(
            error
              ? "No se pudo cargar el programa. Intenta nuevamente."
              : !data
                ? "Programa no disponible."
                : "",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [programId, eventId, eventOnly]);
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8">
      <Link to="/" className="font-semibold text-emerald-700">
        Volver al sitio
      </Link>
      <h1 className="mt-6 text-3xl font-bold">
        {agenda?.name ?? "Programa de actividades"}
      </h1>
      {error ? (
        <p role="alert" className="mt-6">
          {error}
        </p>
      ) : agenda ? (
        <ProgramaAgendaView agenda={agenda} />
      ) : (
        <p className="mt-6">Cargando programa…</p>
      )}
    </main>
  );
}
