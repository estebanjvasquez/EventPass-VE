import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  IdCard,
  Palette,
  Printer,
  Search,
  UserPlus,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { credentialQrValue, extractCredentialToken } from "../../lib/credentialQr";
import { supabase } from "../../lib/supabase";
import { resolveActiveOrg } from "../../lib/activeOrg";
import ImpersonationBanner from "../../components/ImpersonationBanner";

type Reg = {
  id: string;
  record_type: "registration" | "participation";
  first_name: string;
  last_name: string | null;
  cedula: string | null;
  company: string | null;
  job_title: string | null;
  participation_type: string;
  status: string;
  attendance_status: string;
  credential_token: string;
  seat_label: string | null;
  badge_cancelled_at: string | null;
};
type EventOption = {
  id: string;
  name: string;
  status: string;
  total_participants: number;
  ready_participants: number;
  can_print: boolean;
  can_configure: boolean;
};
type PrintLog = {
  id: string;
  print_kind: "initial" | "reprint" | "cancelled";
  reason: string | null;
  created_at: string;
};
type Metrics = {
  initial_prints: number;
  reprints: number;
  cancellations: number;
  walk_ins: number;
  delivered: number;
  failures: number;
  average_service_seconds: number | null;
};
type BadgeTemplate = {
  id?: string;
  participation_type: string;
  name: string;
  size_key: SizeKey;
  primary_color: string;
  background_color: string;
  text_color: string;
  header_text: string;
  footer_text: string;
  show_company: boolean;
  show_job_title: boolean;
  show_identification: boolean;
  show_qr: boolean;
};
type WalkInForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  cedula: string;
  company: string;
  job_title: string;
  participation_type: string;
};

const SIZES = {
  etiqueta: { label: "Etiqueta 10 × 6 cm", w: 100, h: 60 },
  credencial: { label: "Credencial 9 × 13 cm", w: 90, h: 130 },
  a6: { label: "A6 · 10.5 × 14.8 cm", w: 105, h: 148 },
  media_carta: { label: "Media carta · 14 × 21.6 cm", w: 140, h: 216 },
} as const;
type SizeKey = keyof typeof SIZES;
const TYPES = [
  "attendee",
  "guest",
  "vip",
  "speaker",
  "exhibitor",
  "staff",
  "security",
];
const TYPE_LABELS: Record<string, string> = {
  attendee: "Participante",
  guest: "Invitado",
  vip: "VIP",
  speaker: "Ponente",
  exhibitor: "Expositor",
  staff: "Staff",
  security: "Seguridad",
};
const READER_ID = "acred-reader";
const input =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500";
const emptyMetrics: Metrics = {
  initial_prints: 0,
  reprints: 0,
  cancellations: 0,
  walk_ins: 0,
  delivered: 0,
  failures: 0,
  average_service_seconds: null,
};
const defaultTemplate = (type = "attendee"): BadgeTemplate => ({
  participation_type: type,
  name: TYPE_LABELS[type] ?? type,
  size_key: "etiqueta",
  primary_color: "#047857",
  background_color: "#ffffff",
  text_color: "#18181b",
  header_text: "",
  footer_text: "",
  show_company: true,
  show_job_title: true,
  show_identification: false,
  show_qr: true,
});
const isConfirmed = (reg: Reg) =>
  reg.status === "confirmed" || reg.status === "approved";

export default function AcreditacionEvento() {
  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Reg[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<Reg | null>(null);
  const [edit, setEdit] = useState({
    first_name: "",
    last_name: "",
    cedula: "",
    company: "",
    job_title: "",
  });
  const [printLogs, setPrintLogs] = useState<PrintLog[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [templates, setTemplates] = useState<BadgeTemplate[]>([]);
  const [templateDraft, setTemplateDraft] =
    useState<BadgeTemplate>(defaultTemplate());
  const [showDesigner, setShowDesigner] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkIn, setWalkIn] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    cedula: "",
    company: "",
    job_title: "",
    participation_type: "attendee",
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [printed, setPrinted] = useState(false);
  const serviceStarted = useRef(Date.now());

  useEffect(() => {
    void (async () => {
      const active = await resolveActiveOrg();
      if (!active) return;
      setOrgId(active.organization_id);
      setOrgName(active.organizations?.name ?? "");
      const { data, error: eventsError } = await supabase.rpc(
        "get_accreditation_event_options",
      );
      if (eventsError) {
        setError(eventsError.message);
        return;
      }
      const rows = (data ?? []) as EventOption[];
      setEvents(rows);
      if (rows[0]) setEventId(rows[0].id);
    })();
  }, []);
  const loadOperationalData = useCallback(async () => {
    if (!eventId) return;
    const [templateResult, metricResult] = await Promise.all([
      supabase
        .from("badge_templates")
        .select(
          "id,participation_type,name,size_key,primary_color,background_color,text_color,header_text,footer_text,show_company,show_job_title,show_identification,show_qr",
        )
        .eq("event_id", eventId)
        .eq("active", true)
        .order("participation_type"),
      supabase.rpc("get_accreditation_metrics", { p_event_id: eventId }),
    ]);
    setTemplates(
      ((templateResult.data ?? []) as BadgeTemplate[]).map((item) => ({
        ...item,
        header_text: item.header_text ?? "",
        footer_text: item.footer_text ?? "",
      })),
    );
    const row = Array.isArray(metricResult.data)
      ? (metricResult.data[0] as Metrics | undefined)
      : undefined;
    setMetrics(row ?? emptyMetrics);
  }, [eventId]);
  useEffect(() => {
    setSelected(null);
    setResults([]);
    setHasSearched(false);
    void loadOperationalData();
  }, [eventId, loadOperationalData]);

  function choose(reg: Reg) {
    setSelected(reg);
    setEdit({
      first_name: reg.first_name,
      last_name: reg.last_name ?? "",
      cedula: reg.cedula ?? "",
      company: reg.company ?? "",
      job_title: reg.job_title ?? "",
    });
    setResults([]);
    setPrinted(false);
    serviceStarted.current = Date.now();
  }
  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const event = events.find((item) => item.id === eventId);
    if (!eventId || query.trim().length < 2) {
      setError("Escribe al menos dos caracteres para buscar.");
      return;
    }
    if (!event?.can_print) {
      setError(
        "No tienes permiso para acreditar e imprimir en este evento. Pide a un administrador que te asigne “Imprimir acreditaciones”.",
      );
      return;
    }
    setError(null);
    setHasSearched(true);
    const { data, error: rpcError } = await supabase.rpc(
      "search_event_badges",
      { p_event_id: eventId, p_query: query.trim().replace(/[%,]/g, "") },
    );
    if (rpcError) setError(rpcError.message);
    else setResults((data ?? []) as Reg[]);
  }
  const pickByToken = useCallback(async (token: string) => {
    const { data, error: rpcError } = await supabase.rpc(
      "get_event_badge_by_token",
      { p_token: extractCredentialToken(token) },
    );
    const row = Array.isArray(data) ? (data[0] as Reg | undefined) : undefined;
    if (rpcError || !row)
      setError(rpcError?.message ?? "Código no válido para tu organización.");
    else choose(row);
  }, []);
  useEffect(() => {
    if (!scanning) return;
    const scanner = new Html5Qrcode(READER_ID);
    let cancelled = false;
    void scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          void pickByToken(decoded);
          setScanning(false);
        },
        undefined,
      )
      .catch(() => {
        if (!cancelled)
          setError("No pudimos acceder a la cámara. Usa la búsqueda manual.");
      });
    return () => {
      cancelled = true;
      void scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [scanning, pickByToken]);
  const loadPrints = useCallback(async () => {
    if (!selected) return;
    const key =
      selected.record_type === "participation"
        ? "participation_id"
        : "registration_id";
    const { data } = await supabase
      .from("badge_print_logs")
      .select("id,print_kind,reason,created_at")
      .eq(key, selected.id)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setPrintLogs((data ?? []) as PrintLog[]);
  }, [selected, eventId]);
  useEffect(() => {
    if (!selected) setPrintLogs([]);
    else void loadPrints();
  }, [selected, loadPrints]);

  async function saveIdentity() {
    if (!selected || !edit.first_name.trim()) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc(
      "update_event_badge_identity",
      {
        p_record_type: selected.record_type,
        p_record_id: selected.id,
        p_first_name: edit.first_name,
        p_last_name: edit.last_name,
        p_cedula: edit.cedula,
        p_company: edit.company,
        p_job_title: edit.job_title,
      },
    );
    setBusy(false);
    if (rpcError) setError(rpcError.message);
    else {
      setSelected({
        ...selected,
        ...edit,
        last_name: edit.last_name || null,
        cedula: edit.cedula || null,
        company: edit.company || null,
        job_title: edit.job_title || null,
      });
      setInfo("Datos corregidos y auditados antes de imprimir.");
    }
  }
  async function confirmBadge() {
    if (!selected) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("confirm_event_badge", {
      p_record_type: selected.record_type,
      p_record_id: selected.id,
    });
    setBusy(false);
    if (rpcError) setError(rpcError.message);
    else {
      setSelected({
        ...selected,
        status:
          selected.record_type === "registration" ? "confirmed" : "approved",
      });
      setInfo("Participante confirmado. Ya puede imprimirse la credencial.");
    }
  }
  async function createWalkIn(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId || !walkIn.first_name.trim()) return;
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc(
      "create_walk_in_badge",
      {
        p_event_id: eventId,
        p_first_name: walkIn.first_name,
        p_last_name: walkIn.last_name,
        p_email: walkIn.email,
        p_phone: walkIn.phone,
        p_cedula: walkIn.cedula,
        p_company: walkIn.company,
        p_job_title: walkIn.job_title,
        p_participation_type: walkIn.participation_type,
      },
    );
    setBusy(false);
    const created = Array.isArray(data)
      ? (data[0] as { id: string; credential_token: string } | undefined)
      : undefined;
    if (rpcError || !created)
      setError(rpcError?.message ?? "No se pudo crear el walk-in.");
    else {
      choose({
        id: created.id,
        record_type: "registration",
        first_name: walkIn.first_name,
        last_name: walkIn.last_name || null,
        cedula: walkIn.cedula || null,
        company: walkIn.company || null,
        job_title: walkIn.job_title || null,
        participation_type: walkIn.participation_type,
        status: "confirmed",
        attendance_status: "no_attendance",
        credential_token: created.credential_token,
        seat_label: null,
        badge_cancelled_at: null,
      });
      setWalkIn({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        cedula: "",
        company: "",
        job_title: "",
        participation_type: "attendee",
      });
      setShowWalkIn(false);
      setInfo("Walk-in registrado y confirmado.");
      void loadOperationalData();
    }
  }
  async function printBadge() {
    if (
      !selected ||
      !orgId ||
      !isConfirmed(selected) ||
      selected.badge_cancelled_at
    )
      return;
    const prior = printLogs.filter(
      (item) => item.print_kind !== "cancelled",
    ).length;
    const kind = prior ? "reprint" : "initial";
    const reason =
      kind === "reprint"
        ? window.prompt("Motivo de la reimpresión")?.trim()
        : null;
    if (kind === "reprint" && !reason) {
      setError("La reimpresión requiere un motivo.");
      return;
    }
    const { error: insertError } = await supabase
      .from("badge_print_logs")
      .insert({
        organization_id: orgId,
        event_id: eventId,
        registration_id:
          selected.record_type === "registration" ? selected.id : null,
        participation_id:
          selected.record_type === "participation" ? selected.id : null,
        print_kind: kind,
        reason,
        device_label: navigator.userAgent.slice(0, 120),
      });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setPrinted(true);
    setInfo(
      kind === "reprint"
        ? "Reimpresión auditada."
        : "Impresión inicial auditada.",
    );
    window.print();
    await loadPrints();
    await loadOperationalData();
  }
  async function recordOutcome(outcome: "delivered" | "failed") {
    if (!selected) return;
    const failure =
      outcome === "failed"
        ? window.prompt("Describe el fallo de impresión")?.trim()
        : null;
    if (outcome === "failed" && !failure) return;
    const { error: rpcError } = await supabase.rpc(
      "record_accreditation_service",
      {
        p_record_type: selected.record_type,
        p_record_id: selected.id,
        p_outcome: outcome,
        p_duration_ms: Date.now() - serviceStarted.current,
        p_failure_reason: failure,
        p_device_label: navigator.userAgent.slice(0, 120),
      },
    );
    if (rpcError) setError(rpcError.message);
    else {
      setInfo(
        outcome === "delivered"
          ? "Credencial entregada. Atención finalizada."
          : "Fallo registrado para seguimiento.",
      );
      setPrinted(false);
      if (outcome === "delivered") setSelected(null);
      await loadOperationalData();
    }
  }
  async function cancelBadge() {
    if (!selected) return;
    const reason = window
      .prompt("Motivo de cancelación de la credencial")
      ?.trim();
    if (!reason) return;
    const { error: rpcError } = await supabase.rpc("cancel_event_badge", {
      p_record_type: selected.record_type,
      p_record_id: selected.id,
      p_reason: reason,
      p_device_label: navigator.userAgent.slice(0, 120),
    });
    if (rpcError) setError(rpcError.message);
    else {
      setSelected({
        ...selected,
        badge_cancelled_at: new Date().toISOString(),
      });
      setInfo("Credencial cancelada y auditada.");
      await loadPrints();
      await loadOperationalData();
    }
  }
  function selectTemplateType(type: string) {
    setTemplateDraft(
      templates.find((item) => item.participation_type === type) ??
        defaultTemplate(type),
    );
  }
  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId || !orgId) return;
    setBusy(true);
    const { id: _id, ...draft } = templateDraft;
    const { error: saveError } = await supabase
      .from("badge_templates")
      .upsert(
        {
          ...draft,
          organization_id: orgId,
          event_id: eventId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id,participation_type" },
      );
    setBusy(false);
    if (saveError) setError(saveError.message);
    else {
      setInfo(
        "Diseño guardado para " +
          (TYPE_LABELS[templateDraft.participation_type] ??
            templateDraft.participation_type) +
          ".",
      );
      await loadOperationalData();
    }
  }

  const currentEvent = events.find((item) => item.id === eventId);
  const eventName = currentEvent?.name ?? "";
  const canPrint = Boolean(currentEvent?.can_print);
  const canConfigure = Boolean(currentEvent?.can_configure);
  const activeTemplate = selected
    ? (templates.find(
        (item) => item.participation_type === selected.participation_type,
      ) ?? defaultTemplate(selected.participation_type))
    : defaultTemplate();
  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <ImpersonationBanner />
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Administración
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <IdCard className="h-4 w-4 text-emerald-600" />
            Mostrador de acreditación
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              Mostrador de acreditación
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Sigue los pasos: selecciona el evento, busca, confirma, imprime y entrega.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowWalkIn((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
            >
              <UserPlus className="h-4 w-4" />
              Registrar walk-in
            </button>
            {canConfigure && (
              <button
                type="button"
                onClick={() => setShowDesigner((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
              >
                <Palette className="h-4 w-4" />
                Configuración de impresión
              </button>
            )}
          </div>
        </div>
        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["1", "Selecciona el evento"],
            ["2", "Busca al participante"],
            ["3", "Confirma sus datos"],
            ["4", "Imprime la credencial"],
            ["5", "Marca la entrega"],
          ].map(([step, label]) => (
            <div key={step} className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-700 text-xs font-bold text-white">{step}</span>
              {label}
            </div>
          ))}
        </section>
        <section className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {[
            ["Iniciales", metrics.initial_prints],
            ["Reimpresiones", metrics.reprints],
            ["Canceladas", metrics.cancellations],
            ["Walk-ins", metrics.walk_ins],
            ["Entregadas", metrics.delivered],
            ["Fallos", metrics.failures],
            [
              "Promedio",
              metrics.average_service_seconds == null
                ? "—"
                : `${metrics.average_service_seconds}s`,
            ],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border bg-white p-3">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          ))}
        </section>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {info && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
          >
            {info}
          </p>
        )}
        {showDesigner && canConfigure && (
          <Designer
            template={templateDraft}
            setTemplate={setTemplateDraft}
            selectType={selectTemplateType}
            save={saveTemplate}
            busy={busy}
          />
        )}
        {showWalkIn && (
          <WalkIn
            form={walkIn}
            setForm={setWalkIn}
            submit={createWalkIn}
            busy={busy}
          />
        )}
        <div className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-2xl border bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <select
                aria-label="Evento"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className={input}
              >
                {events.length === 0 && (
                  <option value="">Sin eventos disponibles para acreditación</option>
                )}
                {events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.total_participants} participantes
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setScanning((v) => !v)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"
              >
                <Camera className="h-4 w-4" />
                {scanning ? "Cerrar cámara" : "Escanear QR"}
              </button>
            </div>
            {currentEvent && (
              <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
                <p className="font-semibold">{currentEvent.name}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {currentEvent.total_participants} participantes · {currentEvent.ready_participants} confirmados o aprobados
                </p>
                {!canPrint && (
                  <p className="mt-2 rounded bg-amber-50 p-2 text-xs font-medium text-amber-800">
                    Puedes consultar la operación, pero no acreditar ni imprimir hasta tener el permiso “Imprimir acreditaciones” para este evento.
                  </p>
                )}
                {!canConfigure && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Plantilla activa: la configura un administrador; tú puedes usarla para imprimir cuando tengas permiso.
                  </p>
                )}
              </div>
            )}
            {scanning && (
              <div className="mt-3 overflow-hidden rounded-xl bg-black">
                <div id={READER_ID} />
              </div>
            )}
            <form onSubmit={search} className="mt-3 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre, cédula, correo o empresa"
                className={input + " min-w-0 flex-1"}
              />
              <button className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                <Search className="h-4 w-4" />
                Buscar
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {results.map((item) => (
                <button
                  type="button"
                  key={`${item.record_type}-${item.id}`}
                  onClick={() => choose(item)}
                  className="flex w-full items-center justify-between rounded-lg bg-zinc-50 p-3 text-left text-sm"
                >
                  <span>
                    <strong>
                      {item.first_name} {item.last_name ?? ""}
                    </strong>
                    <span className="block text-xs text-zinc-500">
                      {item.company ??
                        item.cedula ??
                        TYPE_LABELS[item.participation_type]}
                    </span>
                  </span>
                  <span
                    className={
                      isConfirmed(item)
                        ? "text-xs font-semibold text-emerald-700"
                        : "text-xs font-semibold text-amber-700"
                    }
                  >
                    {item.badge_cancelled_at
                      ? "Cancelada"
                      : isConfirmed(item)
                        ? "Confirmado"
                        : "Pendiente"}
                  </span>
                </button>
              ))}
              {hasSearched && results.length === 0 && (
                <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
                  No encontramos participantes en “{eventName}”. Verifica que elegiste el evento correcto o busca por otro dato.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-5">
            {!selected ? (
              <div className="grid min-h-64 place-items-center text-center text-sm text-zinc-500">
                <div>
                  <IdCard className="mx-auto mb-2 h-8 w-8" />
                  Selecciona un participante o registra un walk-in.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase text-zinc-400">
                      {TYPE_LABELS[selected.participation_type] ??
                        selected.participation_type}
                    </p>
                    <h2 className="text-xl font-bold">
                      {selected.first_name} {selected.last_name ?? ""}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-sm text-zinc-500"
                  >
                    Cambiar
                  </button>
                </div>
                {selected.badge_cancelled_at && (
                  <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
                    Credencial cancelada. No se puede imprimir.
                  </p>
                )}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input
                    className={input}
                    value={edit.first_name}
                    onChange={(e) =>
                      setEdit({ ...edit, first_name: e.target.value })
                    }
                    placeholder="Nombre"
                  />
                  <input
                    className={input}
                    value={edit.last_name}
                    onChange={(e) =>
                      setEdit({ ...edit, last_name: e.target.value })
                    }
                    placeholder="Apellido"
                  />
                  <input
                    className={input}
                    value={edit.cedula}
                    onChange={(e) =>
                      setEdit({ ...edit, cedula: e.target.value })
                    }
                    placeholder="Identificación"
                  />
                  <input
                    className={input}
                    value={edit.company}
                    onChange={(e) =>
                      setEdit({ ...edit, company: e.target.value })
                    }
                    placeholder="Empresa"
                  />
                  <input
                    className={input + " sm:col-span-2"}
                    value={edit.job_title}
                    onChange={(e) =>
                      setEdit({ ...edit, job_title: e.target.value })
                    }
                    placeholder="Cargo"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveIdentity()}
                  className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold"
                >
                  Guardar correcciones
                </button>
                <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                  {!isConfirmed(selected) && (
                    <button
                      type="button"
                      disabled={busy || !!selected.badge_cancelled_at}
                      onClick={() => void confirmBadge()}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Confirmar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !canPrint ||
                      !isConfirmed(selected) ||
                      !!selected.badge_cancelled_at
                    }
                    onClick={() => void printBadge()}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    <Printer className="h-4 w-4" />
                    {printLogs.some((item) => item.print_kind !== "cancelled")
                      ? "Reimprimir"
                      : "Imprimir"}
                  </button>
                  {!canPrint && (
                    <p className="self-center text-xs font-medium text-amber-700">
                      Falta el permiso de impresión para este evento.
                    </p>
                  )}
                  {printed && (
                    <>
                      <button
                        type="button"
                        onClick={() => void recordOutcome("delivered")}
                        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                      >
                        Marcar entregada
                      </button>
                      <button
                        type="button"
                        onClick={() => void recordOutcome("failed")}
                        className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800"
                      >
                        Reportar fallo
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={!!selected.badge_cancelled_at}
                    onClick={() => void cancelBadge()}
                    className="ml-auto inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar credencial
                  </button>
                </div>
                <div className="mt-5 border-t pt-4">
                  <h3 className="text-xs font-semibold uppercase text-zinc-500">
                    Auditoría de impresión
                  </h3>
                  {printLogs.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                      {printLogs.map((log) => (
                        <li key={log.id} className="flex justify-between gap-3">
                          <span>
                            {log.print_kind === "initial"
                              ? "Inicial"
                              : log.print_kind === "reprint"
                                ? "Reimpresión"
                                : "Cancelación"}
                            {log.reason ? ` · ${log.reason}` : ""}
                          </span>
                          <time>
                            {new Date(log.created_at).toLocaleString("es-VE")}
                          </time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">
                      Sin impresiones.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      {selected && !selected.badge_cancelled_at && (
        <BadgePrint
          reg={{
            ...selected,
            ...edit,
            last_name: edit.last_name || null,
            cedula: edit.cedula || null,
            company: edit.company || null,
            job_title: edit.job_title || null,
          }}
          eventName={eventName}
          orgName={orgName}
          template={activeTemplate}
        />
      )}
    </div>
  );
}

function WalkIn({
  form,
  setForm,
  submit,
  busy,
}: {
  form: WalkInForm;
  setForm: (value: WalkInForm) => void;
  submit: (e: React.FormEvent) => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={submit}
      className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5"
    >
      <h2 className="font-semibold">Registro inmediato de walk-in</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Se crea confirmado y listo para imprimir; el correo es opcional.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          required
          className={input}
          value={form.first_name}
          onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          placeholder="Nombre"
        />
        <input
          className={input}
          value={form.last_name}
          onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          placeholder="Apellido"
        />
        <input
          type="email"
          className={input}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Correo opcional"
        />
        <input
          className={input}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Teléfono"
        />
        <input
          className={input}
          value={form.cedula}
          onChange={(e) => setForm({ ...form, cedula: e.target.value })}
          placeholder="Identificación"
        />
        <input
          className={input}
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder="Empresa"
        />
        <input
          className={input}
          value={form.job_title}
          onChange={(e) => setForm({ ...form, job_title: e.target.value })}
          placeholder="Cargo"
        />
        <select
          className={input}
          value={form.participation_type}
          onChange={(e) =>
            setForm({ ...form, participation_type: e.target.value })
          }
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <button
        disabled={busy}
        className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
      >
        Crear y acreditar
      </button>
    </form>
  );
}

function Designer({
  template,
  setTemplate,
  selectType,
  save,
  busy,
}: {
  template: BadgeTemplate;
  setTemplate: (value: BadgeTemplate) => void;
  selectType: (type: string) => void;
  save: (e: React.FormEvent) => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={save}
      className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-5"
    >
      <h2 className="font-semibold">Diseñador por tipo de participante</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium">
          Tipo
          <select
            className={input}
            value={template.participation_type}
            onChange={(e) => selectType(e.target.value)}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Nombre
          <input
            className={input}
            value={template.name}
            onChange={(e) => setTemplate({ ...template, name: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Formato
          <select
            className={input}
            value={template.size_key}
            onChange={(e) =>
              setTemplate({ ...template, size_key: e.target.value as SizeKey })
            }
          >
            {Object.entries(SIZES).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Encabezado
          <input
            className={input}
            value={template.header_text}
            onChange={(e) =>
              setTemplate({ ...template, header_text: e.target.value })
            }
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Color principal
          <input
            type="color"
            className={input + " h-10"}
            value={template.primary_color}
            onChange={(e) =>
              setTemplate({ ...template, primary_color: e.target.value })
            }
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Fondo
          <input
            type="color"
            className={input + " h-10"}
            value={template.background_color}
            onChange={(e) =>
              setTemplate({ ...template, background_color: e.target.value })
            }
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Texto
          <input
            type="color"
            className={input + " h-10"}
            value={template.text_color}
            onChange={(e) =>
              setTemplate({ ...template, text_color: e.target.value })
            }
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Pie
          <input
            className={input}
            value={template.footer_text}
            onChange={(e) =>
              setTemplate({ ...template, footer_text: e.target.value })
            }
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {(
          [
            ["show_company", "Empresa"],
            ["show_job_title", "Cargo"],
            ["show_identification", "Identificación"],
            ["show_qr", "Código QR"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={template[key]}
              onChange={(e) =>
                setTemplate({ ...template, [key]: e.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <button
        disabled={busy}
        className="mt-3 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
      >
        Guardar diseño
      </button>
    </form>
  );
}

function BadgePrint({
  reg,
  eventName,
  orgName,
  template,
}: {
  reg: Reg;
  eventName: string;
  orgName: string;
  template: BadgeTemplate;
}) {
  const size = SIZES[template.size_key];
  const landscape = size.w > size.h;
  const qr = Math.round(
    Math.min(size.w, size.h) * (landscape ? 0.62 : 0.45) * 3.78,
  );
  return createPortal(
    <div id="badge-print-root">
      <style>{`@page{size:${size.w}mm ${size.h}mm;margin:0}`}</style>
      <div
        style={{
          width: `${size.w}mm`,
          height: `${size.h}mm`,
          backgroundColor: template.background_color,
          color: template.text_color,
          borderColor: template.primary_color,
        }}
        className={`box-border flex ${landscape ? "flex-row items-center gap-3" : "flex-col items-center text-center"} justify-between overflow-hidden border-4 p-3`}
      >
        <div className={landscape ? "min-w-0 flex-1" : "w-full"}>
          <p
            style={{ color: template.primary_color }}
            className="text-[10px] font-bold uppercase tracking-wide"
          >
            {template.header_text || orgName}
          </p>
          <p className="truncate text-[9px] opacity-70">{eventName}</p>
          <p
            className={`${landscape ? "text-lg" : "text-2xl"} mt-2 font-bold leading-tight`}
          >
            {reg.first_name} {reg.last_name ?? ""}
          </p>
          <p
            style={{ backgroundColor: template.primary_color }}
            className="mt-2 inline-block rounded px-2 py-1 text-[10px] font-bold uppercase text-white"
          >
            {TYPE_LABELS[reg.participation_type] ?? reg.participation_type}
          </p>
          {template.show_company && reg.company && (
            <p className="mt-2 text-sm font-semibold">{reg.company}</p>
          )}
          {template.show_job_title && reg.job_title && (
            <p className="text-[11px] opacity-80">{reg.job_title}</p>
          )}
          {template.show_identification && reg.cedula && (
            <p className="mt-1 text-[10px] opacity-70">{reg.cedula}</p>
          )}
          {template.footer_text && (
            <p className="mt-2 text-[9px] opacity-70">{template.footer_text}</p>
          )}
        </div>
        {template.show_qr && (
          <div className={landscape ? "shrink-0" : "mt-2"}>
            <QRCodeSVG
              value={credentialQrValue(reg.credential_token)}
              size={qr}
              level="M"
              marginSize={0}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
