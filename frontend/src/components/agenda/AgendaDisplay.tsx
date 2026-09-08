import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, MapPin, Mic2 } from "lucide-react";
import { type AgendaSettings, sponsorMode } from "../../lib/publicAgendaDesign";
import { AgendaSponsors, SponsorTicker } from "./AgendaSponsors";
import './agenda-design.css';

type Speaker = {
  id: string;
  full_name: string;
  company: string | null;
  position: string | null;
};
type Sponsor = {
  name: string;
  logo_url?: string | null;
  activation_type?: string;
};
export type AgendaItem = {
  event_name: string;
  event_branding: { logo_url?: string; color?: string } | null;
  public_agenda_config: AgendaSettings | null;
  session_id: string;
  session_name: string;
  session_type: string;
  session_status: "scheduled" | "cancelled" | "completed";
  starts_at: string | null;
  ends_at: string | null;
  stage_name: string | null;
  speakers: Speaker[];
  sponsors: Sponsor[];
  event_sponsors: Sponsor[];
};
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("es-VE", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    : "-";
const dayLabel = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const typeLabel: Record<string, string> = {
  lecture: "Ponencia",
  workshop: "Taller",
  break: "Receso",
};
const refreshSeconds = (value: unknown) =>
  Math.min(
    300,
    Math.max(
      10,
      Number.isFinite(Number(value)) ? Math.round(Number(value)) : 15,
    ),
  );

function SessionCard({
  item,
  state,
  accent,
  settings,
}: {
  item: AgendaItem | null;
  state: "now" | "next";
  accent: string;
  settings: AgendaSettings;
}) {
  const now = state === "now";
  return (
    <article
      className={`relative overflow-hidden rounded-[22px] border p-5 sm:p-6 ${now ? "border-white/20 bg-white/[.12]" : "border-white/12 bg-black/20"}`}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: accent }}
      />
      <p className="text-xs font-semibold tracking-[0.12em] text-white/55">
        {now ? "EN ESTE MOMENTO" : "A CONTINUACIÓN"}
      </p>
      {item ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
          <time
            className="font-mono text-3xl font-semibold tabular-nums"
            style={{ color: accent }}
          >
            {time(item.starts_at)}
          </time>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/55">
              {typeLabel[item.session_type] ?? "Actividad"}
              {settings.show_locations !== false && item.stage_name ? ` · ${item.stage_name}` : ""}
            </p>
            <h2 className="agenda-session-title mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {item.session_name}
            </h2>
            {settings.show_speakers !== false && <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-white/70">
              <Mic2 className="mt-0.5 h-4 w-4 shrink-0" />
              {item.speakers.map((speaker) => speaker.full_name).join(", ") ||
                "Información de participantes por confirmar"}
            </p>}
            <AgendaSponsors sponsors={item.sponsors ?? []} mode={sponsorMode(settings, "activity")} />
          </div>
        </div>
      ) : (
        <p className="mt-5 text-lg text-white/65">
          {now
            ? "No hay una actividad en curso."
            : "No hay más actividades programadas."}
        </p>
      )}
    </article>
  );
}


export function AgendaDisplay({ items, settings: override, preview = false, error = null, loading = false }: { items: AgendaItem[]; settings?: AgendaSettings; preview?: boolean; error?: string | null; loading?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  const [day, setDay] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer); }, []);
  const refreshEvery = refreshSeconds((override ?? items[0]?.public_agenda_config)?.refresh_seconds);
  const settings = override ?? items[0]?.public_agenda_config ?? {};
  const branding = items[0]?.event_branding ?? {};
  const accent = settings.accent_color || branding.color || "#34d399";
  const background = settings.background_color || "#09090b";
  const textColor = settings.text_color || "#ffffff";
  const fontFamily = {
    outfit: "Outfit, system-ui, sans-serif",
    arial: "Arial, Helvetica, sans-serif",
    georgia: "Georgia, serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  }[settings.font_family ?? "outfit"];
  const textScale = settings.text_scale ?? "normal";
  const days = useMemo(
    () => [
      ...new Set(
        items
          .map((item) => item.starts_at?.slice(0, 10))
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    [items],
  );
  useEffect(() => {
    if ((!day || !days.includes(day)) && days.length)
      setDay(
        days.find((value) => value === now.toISOString().slice(0, 10)) ??
          days[0],
      );
  }, [day, days, now]);
  const visible = useMemo(
    () => items.filter((item) => (!day || item.starts_at?.startsWith(day)) && (!settings.stage_filter || item.stage_name === settings.stage_filter) && (settings.show_cancelled !== false || item.session_status !== "cancelled")),
    [items, day, settings.stage_filter, settings.show_cancelled],
  );
  const current = useMemo(
    () =>
      visible.find(
        (item) =>
          item.starts_at &&
          item.ends_at &&
          new Date(item.starts_at) <= now &&
          new Date(item.ends_at) >= now &&
          item.session_status === "scheduled",
      ) ?? null,
    [now, visible],
  );
  const next = useMemo(
    () =>
      visible.find(
        (item) =>
          item.starts_at &&
          new Date(item.starts_at) > now &&
          item.session_status === "scheduled",
      ) ?? null,
    [now, visible],
  );
  const sponsors = useMemo(
    () => [
      ...new Map(
        items
          .flatMap((item) => item.event_sponsors ?? [])
          .map((item) => [item.name, item]),
      ).values(),
    ],
    [items],
  );
  const title = settings.title || items[0]?.event_name || "Agenda del evento";
  if (loading)
    return (
      <main
        className="grid min-h-[100dvh] place-items-center bg-zinc-950 p-6 text-white"
        role="status"
      >
        Cargando agenda…
      </main>
    );
  if (error && !items.length)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-zinc-950 p-6 text-center text-white">
        <div className="max-w-md">
          <CalendarDays
            className="mx-auto h-10 w-10"
            style={{ color: accent }}
          />
          <h1 className="mt-5 text-2xl font-semibold">Agenda pública</h1>
          <p className="mt-2 text-zinc-400">{error}</p>
        </div>
      </main>
    );
  return (
    <main
      className={`public-agenda agenda-design agenda-layout-${settings.layout ?? "cards"} agenda-text-scale-${textScale} ${preview ? "agenda-preview" : "min-h-[100dvh]"} overflow-x-clip pb-32`}
      style={{
        backgroundColor: background,
        color: textColor,
        fontFamily,
        ["--agenda-accent" as string]: accent,
        ["--agenda-text" as string]: textColor,
        ["--agenda-background" as string]: background,
      }}
    >
      <header className="border-b border-white/10 bg-black/20 px-5 py-5 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt=""
                className="h-12 w-16 rounded-xl bg-white object-contain p-1 sm:h-14 sm:w-24"
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10">
                <CalendarDays className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.12em] text-white/50">
                {settings.subtitle || "PROGRAMACIÓN DEL EVENTO"}
              </p>
              <h1 className="agenda-primary truncate text-xl font-semibold tracking-tight sm:text-3xl">
                {title}
              </h1>
            </div>
          </div>
          {settings.show_clock !== false && <div className="text-right">
            <p className="hidden text-xs font-semibold text-white/50 sm:block">
              Hora local
            </p>
            <time className="agenda-primary font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
              {now.toLocaleTimeString("es-VE", {
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              })}
            </time>
          </div>}
        </div>
      </header>
      <div className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8">
        {error && (
          <p role="status" className="mb-4 rounded-xl border p-3 text-sm">
            No se pudo actualizar la agenda. Mostramos la última información
            recibida y volveremos a intentarlo.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {days.map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setDay(value)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold capitalize transition-colors ${value === day ? "border-transparent text-zinc-950" : "border-white/20 bg-white/5 text-white hover:bg-white/10"}`}
                style={
                  value === day
                    ? {
                        backgroundColor:
                          "color-mix(in srgb, currentColor 12%, transparent)",
                        borderColor: "currentColor",
                        color: textColor,
                      }
                    : undefined
                }
              >
                {dayLabel(value)}
              </button>
            ))}
          </div>
          <p className="hidden text-sm text-white/45 lg:block">
            Se actualiza cada {refreshEvery} segundos
          </p>
        </div>
        <div className="agenda-program-layout"><section className="agenda-highlights mt-6 grid gap-4 lg:grid-cols-2">
          {settings.show_current !== false && (
            <SessionCard item={current} state="now" accent={accent} settings={settings} />
          )}
          {settings.show_next !== false && (
            <SessionCard item={next} state="next" accent={accent} settings={settings} />
          )}
        </section>
        {settings.show_schedule !== false && (
          <section className="agenda-schedule mt-6">
            <div className="mb-4 flex items-center gap-3">
              <Clock3 className="h-5 w-5" style={{ color: accent }} />
              <h2 className="text-xl font-semibold tracking-tight">
                Programa del día
              </h2>
            </div>
            <div className="grid gap-3">
              {visible.map((item) => (
                <article
                  key={item.session_id}
                  className={`group grid gap-4 rounded-[20px] border p-4 transition-colors sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-center sm:p-5 ${item.session_status === "cancelled" ? "border-red-300/25 bg-red-500/10 opacity-75" : item.session_id === current?.session_id ? "border-white/25 bg-white/[.12]" : "border-white/10 bg-white/[.045] hover:bg-white/[.08]"}`}
                >
                  <div
                    className="font-mono text-xl font-semibold tabular-nums"
                    style={{
                      color:
                        item.session_id === current?.session_id
                          ? accent
                          : undefined,
                    }}
                  >
                    {time(item.starts_at)}
                    <span className="block text-xs font-normal opacity-70">
                      {item.ends_at
                        ? `hasta ${time(item.ends_at)}`
                        : "Fin por confirmar"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-[0.1em] text-white/50">
                      {typeLabel[item.session_type] ?? "ACTIVIDAD"}
                      {item.session_status === "cancelled"
                        ? " · CANCELADA"
                        : item.session_status === "completed"
                          ? " · FINALIZADA"
                          : item.session_id === current?.session_id
                            ? " · EN CURSO"
                            : " · PROGRAMADA"}
                    </p>
                    <h3
                      className={`agenda-session-title mt-1 text-lg font-semibold ${item.session_status === "cancelled" ? "line-through" : ""}`}
                    >
                      {item.session_name}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/65">
                      {settings.show_locations !== false && <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {item.stage_name || "Ubicación por confirmar"}
                      </span>}
                      {settings.show_speakers !== false && item.speakers.length > 0 && (
                        <span>
                          {item.speakers
                            .map((speaker) => speaker.full_name)
                            .join(", ")}
                        </span>
                      )}
                    </div>
                    <AgendaSponsors sponsors={item.sponsors ?? []} mode={sponsorMode(settings, "activity")} />
                  </div>
                </article>
              ))}
              {!visible.length && (
                <div className="rounded-[20px] border border-white/10 bg-white/[.045] p-10 text-center text-white/60">
                  No hay actividades para este día.
                </div>
              )}
            </div>
          </section>
        )}
        </div>
      </div>
      <SponsorTicker sponsors={sponsors} mode={sponsorMode(settings, "event")} settings={settings} preview={preview} />
    </main>
  );
}
