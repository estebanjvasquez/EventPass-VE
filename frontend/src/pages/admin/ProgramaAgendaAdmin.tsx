import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  emptyAgenda,
  agendaWallTime,
  agendaInstant,
  type AgendaConfig,
  type AgendaEvent,
  type PublicAgenda,
  type AgendaBlock,
} from "../../lib/programAgenda";
import { ProgramaAgendaView } from "../ProgramaAgenda";

const field =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm";
export default function ProgramaAgendaAdmin() {
  const { programId } = useParams();
  const [name, setName] = useState("");
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [config, setConfig] = useState<AgendaConfig>(emptyAgenda);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      supabase
        .from("event_programs")
        .select("name")
        .eq("id", programId!)
        .single(),
      supabase
        .from("program_events")
        .select(
          "event:events(id,name,description,event_type,start_date,end_date)",
        )
        .eq("program_id", programId!),
      supabase
        .from("program_agendas")
        .select("draft,published")
        .eq("program_id", programId!)
        .maybeSingle(),
    ]).then(async ([p, l, a]) => {
      if (!alive) return;
      if (p.error || l.error || a.error) {
        setMessage(
          p.error?.message ??
            l.error?.message ??
            a.error?.message ??
            "No se pudo cargar.",
        );
        setLoading(false);
        return;
      }
      const linked = (l.data ?? []).flatMap((x) =>
        x.event ? [x.event] : [],
      ) as unknown as AgendaEvent[];
      const sessions = await Promise.all(
        linked.map(async (e) => {
          const r = await supabase.rpc("get_public_forum_agenda", {
            p_event_id: e.id,
          });
          return { ...e, sessions: r.data ?? [] } as AgendaEvent;
        }),
      );
      if (!alive) return;
      setName(p.data.name);
      setEvents(sessions);
      setConfig(
        (a.data?.draft ??
          a.data?.published ?? {
            ...emptyAgenda,
            blocks: linked.map((e) => ({
              id: crypto.randomUUID(),
              event_id: e.id,
              title: e.name,
              description: e.description ?? "",
              location: "",
              starts_at: e.start_date ?? "",
              ends_at: e.end_date ?? "",
              mode: "both",
            })),
          }) as AgendaConfig,
      );
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [programId]);
  function change(id: string, values: Partial<AgendaBlock>) {
    setConfig((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === id ? { ...b, ...values } : b)),
    }));
  }
  async function save(action: "draft" | "publish" | "unpublish") {
    try {
      new Intl.DateTimeFormat("es-VE", { timeZone: config.timezone });
      if (
        config.blocks.some(
          (b) =>
            !b.title.trim() ||
            (b.starts_at && !Number.isFinite(Date.parse(b.starts_at))) ||
            (b.ends_at &&
              (!b.starts_at ||
                Date.parse(b.ends_at) <= Date.parse(b.starts_at))),
        )
      ) {
        setMessage(
          "Cada actividad requiere título y un final posterior al inicio.",
        );
        return;
      }
    } catch {
      setMessage(
        "Indica una zona horaria válida, por ejemplo America/Caracas.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_program_agenda", {
      p_program_id: programId!,
      p_config: config,
      p_action: action,
    });
    setBusy(false);
    setMessage(
      error?.message ??
        (action === "publish"
          ? "Programa general publicado."
          : action === "unpublish"
            ? "Programa general retirado de la web."
            : "Borrador guardado."),
    );
  }
  const datetime = (v: string) => {
    try {
      return agendaWallTime(v, config.timezone);
    } catch {
      return "";
    }
  };
  function setTime(id: string, key: "starts_at" | "ends_at", value: string) {
    try {
      change(id, { [key]: agendaInstant(value, config.timezone) });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hora inválida");
    }
  }
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <nav className="flex flex-wrap gap-4 text-sm font-semibold text-emerald-700">
        <Link to={`/admin/programas/${programId}/configuracion`}>
          Configuración y web
        </Link>
        <Link to={`/p/${programId}/agenda`} target="_blank">
          Ver programa publicado
        </Link>
      </nav>
      <h1 className="mt-6 text-3xl font-bold">Programa y agenda · {name}</h1>
      <p className="mt-3 text-zinc-600">
        Los bloques definen horarios diarios y actividades generales. Las
        sesiones se reutilizan desde cada evento, sin duplicarlas. La
        publicación es independiente del registro.
      </p>
      {message && (
        <p role="status" className="mt-4 rounded-lg bg-zinc-100 p-4">
          {message}
        </p>
      )}
      {!loading && name && (
        <>
          <div className="my-6 grid gap-4 sm:grid-cols-3">
            <label>
              Título público
              <input
                className={field}
                value={config.title}
                onChange={(e) =>
                  setConfig({ ...config, title: e.target.value })
                }
              />
            </label>
            <label>
              Zona horaria
              <input
                className={field}
                value={config.timezone}
                onChange={(e) =>
                  setConfig({ ...config, timezone: e.target.value })
                }
              />
            </label>
            <label>
              Presentación
              <select
                className={field}
                value={config.presentation}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    presentation: e.target
                      .value as AgendaConfig["presentation"],
                  })
                }
              >
                <option value="summary">Resumen por actividades</option>
                <option value="detailed">Resumen y sesiones detalladas</option>
              </select>
            </label>
          </div>
          <div className="space-y-4">
            {config.blocks.map((b, index) => (
              <fieldset key={b.id} className="rounded-xl border bg-white p-5">
                <legend className="px-2 font-bold">
                  Actividad {index + 1}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    Evento de origen
                    <select
                      className={field}
                      value={b.event_id ?? ""}
                      onChange={(e) => {
                        const event = events.find(
                          (x) => x.id === e.target.value,
                        );
                        change(b.id, {
                          event_id: event?.id ?? null,
                          ...(event
                            ? {
                                title: event.name,
                                description: event.description ?? "",
                                starts_at: event.start_date ?? "",
                                ends_at: event.end_date ?? "",
                              }
                            : {}),
                        });
                      }}
                    >
                      <option value="">
                        Bloque propio: acreditación, apertura, networking…
                      </option>
                      {events.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Título
                    <input
                      className={field}
                      value={b.title}
                      onChange={(e) => change(b.id, { title: e.target.value })}
                    />
                  </label>
                  <label>
                    Inicio ({config.timezone})
                    <input
                      className={field}
                      type="datetime-local"
                      value={datetime(b.starts_at)}
                      onChange={(e) =>
                        setTime(b.id, "starts_at", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Final ({config.timezone})
                    <input
                      className={field}
                      type="datetime-local"
                      value={datetime(b.ends_at)}
                      onChange={(e) => setTime(b.id, "ends_at", e.target.value)}
                    />
                  </label>
                  <label>
                    Sala o ubicación
                    <input
                      className={field}
                      value={b.location}
                      onChange={(e) =>
                        change(b.id, { location: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Contenido
                    <select
                      className={field}
                      value={b.mode}
                      onChange={(e) =>
                        change(b.id, {
                          mode: e.target.value as AgendaBlock["mode"],
                        })
                      }
                    >
                      <option value="summary">Solo bloque resumen</option>
                      <option value="sessions">Sesiones del evento</option>
                      <option value="both">Resumen y sesiones</option>
                    </select>
                  </label>
                  <label className="sm:col-span-2">
                    Descripción y requisitos
                    <textarea
                      className={field}
                      value={b.description}
                      onChange={(e) =>
                        change(b.id, { description: e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                  <button
                    disabled={index === 0}
                    onClick={() =>
                      setConfig((c) => {
                        const blocks = [...c.blocks];
                        [blocks[index - 1], blocks[index]] = [
                          blocks[index],
                          blocks[index - 1],
                        ];
                        return { ...c, blocks };
                      })
                    }
                  >
                    Subir
                  </button>
                  <button
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        blocks: [
                          ...c.blocks,
                          { ...b, id: crypto.randomUUID() },
                        ],
                      }))
                    }
                  >
                    Duplicar horario para otro día
                  </button>
                  <button
                    className="text-red-700"
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        blocks: c.blocks.filter((x) => x.id !== b.id),
                      }))
                    }
                  >
                    Quitar bloque
                  </button>
                  {b.event_id && (
                    <Link
                      className="text-emerald-700"
                      to={`/admin/agenda/${b.event_id}`}
                    >
                      Editar sesiones del evento
                    </Link>
                  )}
                </div>
              </fieldset>
            ))}
          </div>
          <button
            className="mt-5 rounded-lg border px-4 py-2 font-semibold"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                blocks: [
                  ...c.blocks,
                  {
                    id: crypto.randomUUID(),
                    event_id: null,
                    title: "Nueva actividad",
                    description: "",
                    location: "",
                    starts_at: "",
                    ends_at: "",
                    mode: "summary",
                  },
                ],
              }))
            }
          >
            Añadir actividad u horario diario
          </button>
          <div className="my-6 flex flex-wrap gap-3">
            <button
              disabled={busy}
              className="rounded-lg border px-4 py-2"
              onClick={() => void save("draft")}
            >
              Guardar borrador
            </button>
            <button
              disabled={busy}
              className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white"
              onClick={() => void save("publish")}
            >
              Publicar programa general
            </button>
            <button
              disabled={busy}
              className="rounded-lg border px-4 py-2"
              onClick={() => {
                if (window.confirm("¿Retirar el programa general de la web?"))
                  void save("unpublish");
              }}
            >
              Retirar publicación
            </button>
            <button
              className="rounded-lg border px-4 py-2"
              onClick={() => setPreview(!preview)}
            >
              Vista previa
            </button>
          </div>
          {preview && (
            <section className="rounded-xl border bg-zinc-50 p-5">
              <ProgramaAgendaView
                key={JSON.stringify(config)}
                agenda={{ name, config, events } as PublicAgenda}
              />
            </section>
          )}
        </>
      )}
    </main>
  );
}
