import { useMemo, useState } from "react";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import { Minus, Move, Plus, Redo2, Undo2 } from "lucide-react";

export type TimelineSession = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  stage_id: string | null;
  session_type: "lecture" | "workshop" | "break";
};
export type TimelineStage = { id: string; name: string };

type Change = Pick<TimelineSession, "stage_id" | "starts_at" | "ends_at">;
type Snapshot = TimelineSession[];
const SLOT_MINUTES = 30;
const MIN_HOUR = 7;
const MAX_HOUR = 22;
const slotId = (stageId: string, slot: number) =>
  `agenda-slot:${stageId}:${slot}`;
const minutesAt = (value: string | null) =>
  value
    ? new Date(value).getHours() * 60 + new Date(value).getMinutes()
    : MIN_HOUR * 60;
const dayOf = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-CA") : "";
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const toIso = (date: string, minutes: number) =>
  new Date(`${date}T${clock(minutes)}:00`).toISOString();
const duration = (item: TimelineSession) =>
  item.starts_at && item.ends_at
    ? Math.max(
        SLOT_MINUTES,
        Math.round(
          (new Date(item.ends_at).getTime() -
            new Date(item.starts_at).getTime()) /
            60000,
        ),
      )
    : 60;
const styleByType: Record<TimelineSession["session_type"], string> = {
  lecture: "border-blue-300 bg-blue-50 text-blue-950",
  workshop: "border-violet-300 bg-violet-50 text-violet-950",
  break: "border-amber-300 bg-amber-50 text-amber-950",
};

function TimelineCell({ stageId, slot }: { stageId: string; slot: number }) {
  const { ref, isDropTarget } = useDroppable({ id: slotId(stageId, slot) });
  return (
    <div
      ref={ref}
      className={`h-full border-b border-r border-zinc-100 ${isDropTarget ? "bg-emerald-100" : "bg-white"}`}
    />
  );
}

function DraggableSession({
  item,
  selected,
  onSelect,
  onEdit,
  onResize,
}: {
  item: TimelineSession;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onResize: (delta: number) => void;
}) {
  const { ref, isDragging } = useDraggable({ id: item.id });
  return (
    <div
      ref={ref}
      className="relative z-10 h-full min-h-0 p-1"
      style={{
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onEdit}
        className={`flex h-full w-full min-h-12 flex-col rounded-lg border p-2 text-left shadow-sm transition ${styleByType[item.session_type]} ${selected ? "ring-2 ring-emerald-600 ring-offset-1" : "hover:brightness-95"}`}
        aria-label={`${item.name}. Arrastra para cambiar de escenario u horario.`}
      >
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-70">
          <Move className="h-3 w-3" />
          {clock(minutesAt(item.starts_at))}
        </span>
        <span className="mt-1 line-clamp-2 text-xs font-bold leading-tight">
          {item.name}
        </span>
      </button>
      {selected && (
        <div className="absolute -bottom-2 left-1/2 z-20 flex -translate-x-1/2 overflow-hidden rounded-full border border-emerald-700 bg-white shadow">
          <button
            type="button"
            onClick={() => onResize(-SLOT_MINUTES)}
            aria-label="Reducir duración 30 minutos"
            className="grid h-5 w-5 place-items-center text-emerald-800 hover:bg-emerald-50"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onResize(SLOT_MINUTES)}
            aria-label="Aumentar duración 30 minutos"
            className="grid h-5 w-5 place-items-center text-emerald-800 hover:bg-emerald-50"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function AgendaTimelineCanvas({
  day,
  stages,
  sessions,
  onEdit,
  onPersist,
}: {
  day: string;
  stages: TimelineStage[];
  sessions: TimelineSession[];
  onEdit: (sessionId: string) => void;
  onPersist: (id: string, change: Change) => Promise<boolean>;
}) {
  const daySessions = useMemo(
    () =>
      sessions.filter((item) => dayOf(item.starts_at) === day && item.stage_id),
    [day, sessions],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState<{
    snapshots: Snapshot[];
    index: number;
  }>({ snapshots: [daySessions], index: 0 });
  const current = history.snapshots[history.index];
  const rows = ((MAX_HOUR - MIN_HOUR) * 60) / SLOT_MINUTES;
  const selected = current.find((item) => item.id === selectedId);
  const fits = (candidate: TimelineSession, source: TimelineSession[]) => {
    const start = minutesAt(candidate.starts_at);
    const end = start + duration(candidate);
    if (start < MIN_HOUR * 60 || end > MAX_HOUR * 60 || !candidate.stage_id)
      return false;
    return !source.some(
      (item) =>
        item.id !== candidate.id &&
        item.stage_id === candidate.stage_id &&
        item.starts_at &&
        item.ends_at &&
        start < minutesAt(item.ends_at) &&
        end > minutesAt(item.starts_at),
    );
  };
  const commit = (next: Snapshot) =>
    setHistory((previous) => ({
      snapshots: [...previous.snapshots.slice(0, previous.index + 1), next],
      index: previous.index + 1,
    }));
  async function apply(
    item: TimelineSession,
    candidate: TimelineSession,
    label: string,
  ) {
    if (!fits(candidate, current)) {
      setNotice(
        "No se puede colocar allí: se superpone con otra sesión o queda fuera del horario visible.",
      );
      return;
    }
    const ok = await onPersist(item.id, {
      stage_id: candidate.stage_id,
      starts_at: candidate.starts_at,
      ends_at: candidate.ends_at,
    });
    if (!ok) {
      setNotice(
        "No se pudo guardar el cambio. La sesión volvió a su posición anterior.",
      );
      return;
    }
    commit(current.map((entry) => (entry.id === item.id ? candidate : entry)));
    setNotice(label);
  }
  async function resize(delta: number) {
    if (!selected || !selected.starts_at) return;
    const nextDuration = duration(selected) + delta;
    if (nextDuration < SLOT_MINUTES) {
      setNotice("La duración mínima es de 30 minutos.");
      return;
    }
    const candidate = {
      ...selected,
      ends_at: toIso(day, minutesAt(selected.starts_at) + nextDuration),
    };
    await apply(
      selected,
      candidate,
      `Duración ajustada a ${nextDuration} min.`,
    );
  }
  async function travel(target: Snapshot, index: number) {
    const changed = target.find((item) => {
      const before = current.find((entry) => entry.id === item.id);
      return (
        before &&
        (before.stage_id !== item.stage_id ||
          before.starts_at !== item.starts_at ||
          before.ends_at !== item.ends_at)
      );
    });
    if (!changed) return;
    const before = current.find((item) => item.id === changed.id);
    if (!before) return;
    const ok = await onPersist(changed.id, {
      stage_id: changed.stage_id,
      starts_at: changed.starts_at,
      ends_at: changed.ends_at,
    });
    if (!ok) {
      setNotice("No se pudo restaurar ese cambio.");
      return;
    }
    setHistory((previous) => ({ ...previous, index }));
    setSelectedId(changed.id);
    setNotice(index < history.index ? "Cambio deshecho." : "Cambio rehecho.");
  }
  return (
    <section className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3">
        <span className="text-sm font-medium text-zinc-700">
          Arrastra una sesión a otra hora o escenario.
        </span>
        <div className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-300 p-1 text-xs font-semibold text-zinc-700">
          <span className="px-1 text-zinc-500">Escala</span>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))} disabled={zoom <= 0.75} aria-label="Reducir escala del horario" className="rounded p-1 hover:bg-zinc-100 disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.5, value + 0.25))} disabled={zoom >= 1.5} aria-label="Aumentar escala del horario" className="rounded p-1 hover:bg-zinc-100 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <button
          type="button"
          disabled={history.index === 0}
          onClick={() =>
            void travel(history.snapshots[history.index - 1], history.index - 1)
          }
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Deshacer
        </button>
        <button
          type="button"
          disabled={history.index >= history.snapshots.length - 1}
          onClick={() =>
            void travel(history.snapshots[history.index + 1], history.index + 1)
          }
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-40"
        >
          <Redo2 className="h-3.5 w-3.5" />
          Rehacer
        </button>
      </div>
      {notice && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {notice}
        </p>
      )}
      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled) return;
          const id = String(event.operation.source?.id ?? "");
          const match = /^agenda-slot:([^:]+):(\d+)$/.exec(
            String(event.operation.target?.id ?? ""),
          );
          const item = current.find((entry) => entry.id === id);
          if (!match || !item) return;
          const start = MIN_HOUR * 60 + Number(match[2]) * SLOT_MINUTES;
          const candidate = {
            ...item,
            stage_id: match[1],
            starts_at: toIso(day, start),
            ends_at: toIso(day, start + duration(item)),
          };
          void apply(item, candidate, "Sesión reubicada y guardada.");
        }}
      >
        <div className="overflow-auto rounded-2xl border border-zinc-200 bg-zinc-100 p-2">
          <div
            className="grid min-w-[780px] gap-px bg-zinc-200"
            style={{
              gridTemplateColumns: `72px repeat(${Math.max(stages.length, 1)}, minmax(220px, 1fr))`,
              gridTemplateRows: `42px repeat(${rows}, ${28 * zoom}px)`,
            }}
          >
            <div className="sticky left-0 z-20 bg-zinc-50" />
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-3 text-sm font-bold text-zinc-800"
                style={{ gridColumn: index + 2, gridRow: 1 }}
              >
                {stage.name}
              </div>
            ))}
            {Array.from({ length: rows }, (_, slot) => (
              <div
                key={`time-${slot}`}
                className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-zinc-50 pr-2 pt-1 text-right text-[10px] font-medium text-zinc-500"
                style={{ gridColumn: 1, gridRow: slot + 2 }}
              >
                {slot % 2 === 0
                  ? clock(MIN_HOUR * 60 + slot * SLOT_MINUTES)
                  : ""}
              </div>
            ))}
            {stages.flatMap((stage, index) =>
              Array.from({ length: rows }, (_, slot) => (
                <div
                  key={`${stage.id}-${slot}`}
                  style={{ gridColumn: index + 2, gridRow: slot + 2 }}
                >
                  <TimelineCell stageId={stage.id} slot={slot} />
                </div>
              )),
            )}
            {current.map((item) => {
              const index = stages.findIndex(
                (stage) => stage.id === item.stage_id,
              );
              if (index < 0) return null;
              const slot = Math.round(
                (minutesAt(item.starts_at) - MIN_HOUR * 60) / SLOT_MINUTES,
              );
              return (
                <div
                  key={item.id}
                  style={{
                    gridColumn: index + 2,
                    gridRow: `${slot + 2} / span ${Math.max(1, Math.round(duration(item) / SLOT_MINUTES))}`,
                  }}
                >
                  <DraggableSession
                    item={item}
                    selected={selectedId === item.id}
                    onSelect={() => setSelectedId(item.id)}
                    onEdit={() => onEdit(item.id)}
                    onResize={(delta) => void resize(delta)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </DragDropProvider>
    </section>
  );
}
