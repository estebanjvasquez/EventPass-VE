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
import BadgeStudio, { type BadgeVersion } from "../../components/badges/BadgeStudio";
import { defaultBadgeLayout, renderBadgeSides, type BadgeRenderData, type BadgeTemplateV2 } from "../../lib/badgeStudio";
import { bridgeHealth, bridgePrinters, cancelBridgeJob, getBridgeJob, loadBridgeConfig, prioritizeBridgeJob, saveBridgeConfig, submitBridgeJob, type BridgeConfig, type BridgePrinter } from "../../lib/printBridge";

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
type PrintJob = { id:string;status:"queued"|"rendering"|"sent"|"spooled"|"delivered"|"failed"|"cancelled";print_kind:"initial"|"reprint";template_id:string|null;credential_token_snapshot:string;station_label:string;printer_name:string;bridge_job_id:string|null;priority:number;attempt_count:number;error_message:string|null;queued_at:string;requested_by_name:string|null };
type Metrics = {
  initial_prints: number;
  reprints: number;
  cancellations: number;
  walk_ins: number;
  delivered: number;
  failures: number;
  average_service_seconds: number | null;
};
type BadgeTemplate = BadgeTemplateV2;
type BadgeAsset={id:string;name:string;public_url:string;mime_type:string;size_bytes:number;created_at:string};
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
  width_mm: 100,
  height_mm: 60,
  dpi: 300,
  double_sided: false,
  layout: defaultBadgeLayout(),
  back_layout: { version: 1, elements: [] },
  template_status: "published",
  version: 1,
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
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [templates, setTemplates] = useState<BadgeTemplate[]>([]);
  const [templateVersions,setTemplateVersions]=useState<BadgeVersion[]>([]);
  const [badgeAssets,setBadgeAssets]=useState<BadgeAsset[]>([]);
  const [templateDraft, setTemplateDraft] =
    useState<BadgeTemplate>(defaultTemplate());
  const [showDesigner, setShowDesigner] = useState(false);
  const [copyTemplateType,setCopyTemplateType]=useState('vip');
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
  const [testBusy, setTestBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [browserPages,setBrowserPages]=useState<string[]>([]);
  const [bridgeConfig, setBridgeConfig] = useState<BridgeConfig>(() => loadBridgeConfig());
  const [bridgeState, setBridgeState] = useState<"unknown" | "connected" | "offline">("unknown");
  const [bridgeDevices, setBridgeDevices] = useState<BridgePrinter[]>([]);
  const [bridgeMessage, setBridgeMessage] = useState("Comprobando el servicio local…");
  const initialBridgeConfig = useRef(bridgeConfig);
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
  const connectBridge = useCallback(async (config: BridgeConfig) => {
    setBridgeState("unknown");
    setBridgeMessage("Comprobando el servicio local…");
    if (!config.url.trim()) {
      setBridgeState("offline");
      setBridgeMessage("Indica la dirección del bridge local.");
      return;
    }
    if (!config.token.trim()) {
      setBridgeState("offline");
      setBridgeMessage("Introduce el código de vinculación que aparece en la ventana del bridge.");
      return;
    }
    try {
      const health = await bridgeHealth(config);
      const value = await bridgePrinters(config);
      setBridgeDevices(value.printers);
      setBridgeState("connected");
      const offline=value.printers.filter(item=>item.offline).length;
      setBridgeMessage(value.printers.length ? `Bridge ${health.version} · ${value.printers.length} impresora${value.printers.length === 1 ? "" : "s"} detectada${value.printers.length === 1 ? "" : "s"}${offline?` · ${offline} sin conexión`:""} · ${health.queue} en cola.` : `Bridge ${health.version} conectado, pero Windows no reportó impresoras instaladas.`);
      if (!config.printer) {
        const printer = value.printers.find(item => item.isDefault)?.name ?? value.printers[0]?.name ?? "";
        const next = { ...config, printer };
        setBridgeConfig(next);
        saveBridgeConfig(next);
      }
    } catch (bridgeError) {
      setBridgeState("offline");
      setBridgeDevices([]);
      setBridgeMessage(bridgeError instanceof Error ? bridgeError.message : "No se pudo conectar con el bridge local.");
    }
  }, []);
  useEffect(() => { void connectBridge(initialBridgeConfig.current); }, [connectBridge]);
  const loadOperationalData = useCallback(async () => {
    if (!eventId) return;
    const [templateResult, metricResult, jobsResult,versionsResult,assetsResult] = await Promise.all([
      supabase
        .from("badge_templates")
        .select(
          "id,participation_type,name,size_key,primary_color,background_color,text_color,header_text,footer_text,show_company,show_job_title,show_identification,show_qr,width_mm,height_mm,dpi,double_sided,layout,back_layout,template_status,version",
        )
        .eq("event_id", eventId)
        .eq("active", true)
        .order("participation_type"),
      supabase.rpc("get_accreditation_metrics", { p_event_id: eventId }),
      supabase.from("badge_print_jobs").select("id,status,print_kind,template_id,credential_token_snapshot,station_label,printer_name,bridge_job_id,priority,attempt_count,error_message,queued_at,requested_by_name").eq("event_id",eventId).order("priority",{ascending:true}).order("queued_at",{ascending:false}).limit(20),
      supabase.from("badge_template_versions").select("id,version,status,created_at,saved_by_name,snapshot").eq("event_id",eventId).order("created_at",{ascending:false}).limit(50),
      supabase.from("badge_assets").select("id,name,public_url,mime_type,size_bytes,created_at").eq("event_id",eventId).order("created_at",{ascending:false}),
    ]);
    setTemplates(
      ((templateResult.data ?? []) as BadgeTemplate[]).map((item) => ({
        ...item,
        header_text: item.header_text ?? "",
        footer_text: item.footer_text ?? "",
        width_mm: Number(item.width_mm || 100),
        height_mm: Number(item.height_mm || 60),
        layout: item.layout?.elements?.length ? item.layout : defaultBadgeLayout(Number(item.width_mm || 100), Number(item.height_mm || 60), item.primary_color),
        back_layout: item.back_layout ?? { version: 1, elements: [] },
      })),
    );
    const row = Array.isArray(metricResult.data)
      ? (metricResult.data[0] as Metrics | undefined)
      : undefined;
    setMetrics(row ?? emptyMetrics);
    setPrintJobs((jobsResult.data ?? []) as PrintJob[]);
    setTemplateVersions((versionsResult.data??[]) as BadgeVersion[]);
    setBadgeAssets((assetsResult.data??[]) as BadgeAsset[]);
  }, [eventId]);
  useEffect(() => {
    setSelected(null);
    setResults([]);
    setHasSearched(false);
    void loadOperationalData();
  }, [eventId, loadOperationalData]);
  useEffect(()=>{if(!eventId)return;const timer=window.setInterval(()=>void loadOperationalData(),5000);return()=>window.clearInterval(timer)},[eventId,loadOperationalData]);

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
    setBrowserPages([]);
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
    const prior = printLogs.filter((item) => item.print_kind !== "cancelled").length;
    const expectedKind = prior ? "reprint" : "initial";
    const reason =
      expectedKind === "reprint"
        ? window.prompt("Motivo de la reimpresión")?.trim()
        : null;
    if (expectedKind === "reprint" && !reason) {
      setError("La reimpresión requiere un motivo.");
      return;
    }
    setBusy(true); setError(null);
    const printer = bridgeState === "connected" && bridgeConfig.printer ? bridgeConfig.printer : "Diálogo del sistema";
    const created = await supabase.rpc("prepare_badge_print_job", { p_event_id:eventId,p_record_type:selected.record_type,p_record_id:selected.id,p_template_id:activeTemplate.id??null,p_station_label:bridgeConfig.station||"Mostrador principal",p_printer_name:printer,p_reason:reason,p_output_sides:activeTemplate.double_sided?2:1,p_profile_snapshot:bridgeConfig.profile });
    const prepared=(Array.isArray(created.data)?created.data[0]:null) as {job_id:string;print_kind:"initial"|"reprint";credential_token:string}|null;
    if(created.error||!prepared?.job_id){setBusy(false);setError(created.error?.message??"No se pudo crear el trabajo de impresión.");return}
    const jobId=prepared.job_id;
    const printReg={...selected,credential_token:prepared.credential_token};
    setSelected(printReg);
    await supabase.rpc("update_badge_print_job",{p_job_id:jobId,p_status:"rendering",p_bridge_job_id:null,p_payload_hash:null,p_error_message:null});
    if(bridgeState!=="connected"||!bridgeConfig.printer){
      const pngDataUrls=await renderBadgeSides(activeTemplate,{...printReg,...edit,last_name:edit.last_name||null,company:edit.company||null,job_title:edit.job_title||null,cedula:edit.cedula||null,event_name:eventName,organization_name:orgName,participation_type:TYPE_LABELS[selected.participation_type]??selected.participation_type});
      await supabase.rpc("update_badge_print_job",{p_job_id:jobId,p_status:"sent",p_bridge_job_id:"browser-dialog",p_payload_hash:null,p_error_message:null});
      setBrowserPages(pngDataUrls);setPendingJobId(jobId);setPrinted(true);setBusy(false);setInfo("Trabajo abierto en el diálogo del sistema. Confirma la entrega para cerrar la auditoría.");window.setTimeout(()=>window.print(),150);return
    }
    try{
      const pngDataUrls=await renderBadgeSides(activeTemplate,{...printReg,...edit,last_name:edit.last_name||null,company:edit.company||null,job_title:edit.job_title||null,cedula:edit.cedula||null,event_name:eventName,organization_name:orgName,participation_type:TYPE_LABELS[selected.participation_type]??selected.participation_type});
      let bridgeJob=await submitBridgeJob(bridgeConfig,{cloudJobId:jobId,printer:bridgeConfig.printer,title:`${eventName} · ${selected.first_name} ${selected.last_name??""}`.trim(),pngDataUrls,widthMm:activeTemplate.width_mm,heightMm:activeTemplate.height_mm});
      await supabase.rpc("update_badge_print_job",{p_job_id:jobId,p_status:"sent",p_bridge_job_id:bridgeJob.id,p_payload_hash:bridgeJob.payloadHash??null,p_error_message:null});
      for(let attempt=0;attempt<75&&bridgeJob.status!=="spooled"&&bridgeJob.status!=="failed";attempt+=1){await new Promise(resolve=>setTimeout(resolve,400));bridgeJob=await getBridgeJob(bridgeConfig,bridgeJob.id)}
      if(bridgeJob.status!=="spooled")throw new Error(bridgeJob.error??"La impresora no confirmó el trabajo a tiempo.")
      await supabase.rpc("update_badge_print_job",{p_job_id:jobId,p_status:"spooled",p_bridge_job_id:bridgeJob.id,p_payload_hash:bridgeJob.payloadHash??null,p_error_message:null});
      setPrinted(true);setPendingJobId(jobId);setInfo(prepared.print_kind==="reprint"?"Reimpresión enviada a Windows. Confirma la entrega.":"Credencial enviada a Windows. Confirma la entrega.");await loadPrints();await loadOperationalData()
    }catch(printError){const message=printError instanceof Error?printError.message:"No se pudo imprimir la credencial.";await supabase.rpc("update_badge_print_job",{p_job_id:jobId,p_status:"failed",p_bridge_job_id:null,p_payload_hash:null,p_error_message:message});setError(message);setPrinted(false)}finally{setBusy(false)}
  }
  async function testPrint() {
    if(!selected||bridgeState!=="connected"||!bridgeConfig.printer){setError("Selecciona una persona y conecta una impresora antes de probar.");return}
    setTestBusy(true);setError(null);
    try{
      const data:BadgeRenderData={...selected,...edit,last_name:edit.last_name||null,company:edit.company||null,job_title:edit.job_title||null,cedula:edit.cedula||null,event_name:eventName,organization_name:orgName,participation_type:TYPE_LABELS[selected.participation_type]??selected.participation_type};
      const pngDataUrls=await renderBadgeSides(templateDraft,data);
      let job=await submitBridgeJob(bridgeConfig,{cloudJobId:crypto.randomUUID(),printer:bridgeConfig.printer,title:`PRUEBA · ${templateDraft.name}`,pngDataUrls,widthMm:templateDraft.width_mm,heightMm:templateDraft.height_mm,test:true,priority:1});
      for(let attempt=0;attempt<75&&job.status!=="spooled"&&job.status!=="failed";attempt+=1){await new Promise(resolve=>setTimeout(resolve,400));job=await getBridgeJob(bridgeConfig,job.id)}
      if(job.status!=="spooled")throw new Error(job.error??"La impresora no confirmó la prueba.");
      setInfo("Prueba enviada a Windows sin crear una impresión en la auditoría.");
    }catch(testError){setError(testError instanceof Error?testError.message:"No se pudo imprimir la prueba.")}finally{setTestBusy(false)}
  }
  async function recordOutcome(outcome: "delivered" | "failed") {
    if (!selected) return;
    const failure =
      outcome === "failed"
        ? window.prompt("Describe el fallo de impresión")?.trim()
        : null;
    if (outcome === "failed" && !failure) return;
    if(pendingJobId){
      if(outcome==="delivered"){
        const spooled=await supabase.rpc("update_badge_print_job",{p_job_id:pendingJobId,p_status:"spooled",p_bridge_job_id:null,p_payload_hash:null,p_error_message:null});if(spooled.error){setError(spooled.error.message);return}
        const delivered=await supabase.rpc("update_badge_print_job",{p_job_id:pendingJobId,p_status:"delivered",p_bridge_job_id:null,p_payload_hash:null,p_error_message:null});if(delivered.error){setError(delivered.error.message);return}
      }else{
        const finalized=await supabase.rpc("update_badge_print_job",{p_job_id:pendingJobId,p_status:"failed",p_bridge_job_id:null,p_payload_hash:null,p_error_message:failure});if(finalized.error){setError(finalized.error.message);return}
      }
    }
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
      setBrowserPages([]);
      setPendingJobId(null);
      if (outcome === "delivered") setSelected(null);
      await loadOperationalData();
    }
  }
  async function manageQueueJob(job:PrintJob,action:"cancel"|"prioritize"|"retry"|"reassign") {
    setError(null);
    const targetPrinter=action==="reassign"?window.prompt("Impresora para el reintento",bridgeConfig.printer||job.printer_name)?.trim():null;
    if(action==="reassign"&&!targetPrinter)return;
    try{
      if(action==="cancel"&&job.bridge_job_id)await cancelBridgeJob(bridgeConfig,job.bridge_job_id).catch(()=>undefined);
      if(action==="prioritize"&&job.bridge_job_id)await prioritizeBridgeJob(bridgeConfig,job.bridge_job_id).catch(()=>undefined);
      const managed=await supabase.rpc("manage_badge_print_job",{p_job_id:job.id,p_action:action,p_printer_name:targetPrinter});
      if(managed.error)throw managed.error;
      if(action==="cancel"||action==="prioritize"){setInfo(action==="cancel"?"Trabajo cancelado.":"Trabajo movido al inicio de la cola.");await loadOperationalData();return}
      const newJobId=managed.data as string;
      const found=await supabase.rpc("get_event_badge_for_print",{p_event_id:eventId,p_token:job.credential_token_snapshot});
      const reg=(Array.isArray(found.data)?found.data[0]:null) as Reg|null;
      if(found.error||!reg)throw new Error(found.error?.message??"No se pudo recuperar la credencial para reintentar.");
      const template=templates.find(item=>item.id===job.template_id)||templates.find(item=>item.participation_type===reg.participation_type)||defaultTemplate(reg.participation_type);
      const printer=targetPrinter||job.printer_name||bridgeConfig.printer;
      await supabase.rpc("update_badge_print_job",{p_job_id:newJobId,p_status:"rendering",p_bridge_job_id:null,p_payload_hash:null,p_error_message:null});
      const pngDataUrls=await renderBadgeSides(template,{...reg,event_name:eventName,organization_name:orgName,participation_type:TYPE_LABELS[reg.participation_type]??reg.participation_type});
      let local=await submitBridgeJob(bridgeConfig,{cloudJobId:newJobId,printer,title:`REINTENTO · ${eventName} · ${reg.first_name}`,pngDataUrls,widthMm:template.width_mm,heightMm:template.height_mm,priority:1});
      await supabase.rpc("update_badge_print_job",{p_job_id:newJobId,p_status:"sent",p_bridge_job_id:local.id,p_payload_hash:local.payloadHash??null,p_error_message:null});
      for(let attempt=0;attempt<75&&local.status!=="spooled"&&local.status!=="failed";attempt+=1){await new Promise(resolve=>setTimeout(resolve,400));local=await getBridgeJob(bridgeConfig,local.id)}
      if(local.status!=="spooled")throw new Error(local.error??"La impresora no confirmó el reintento.");
      await supabase.rpc("update_badge_print_job",{p_job_id:newJobId,p_status:"spooled",p_bridge_job_id:local.id,p_payload_hash:local.payloadHash??null,p_error_message:null});
      setInfo("Reintento enviado correctamente. Confirma la entrega desde la atención del participante.");
    }catch(queueError){setError(queueError instanceof Error?queueError.message:"No se pudo administrar el trabajo.")}finally{await loadOperationalData()}
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
  async function saveTemplate(status:'draft'|'published'='published') {
    if (!eventId || !orgId) return;
    setBusy(true);
    const { id: _id, ...draft } = templateDraft;
    const nextVersion=Math.max(templateDraft.version??0,...templateVersions.filter(item=>item.snapshot.participation_type===templateDraft.participation_type).map(item=>item.version),0)+1;
    const snapshot={...templateDraft,version:nextVersion,template_status:status};
    let templateId=templateDraft.id??null;
    let saveError:null|{message:string}=null;
    if(status==='published'){
      const saved=await supabase.from("badge_templates").upsert({...draft,template_status:"published",published_at:new Date().toISOString(),version:nextVersion,organization_id:orgId,event_id:eventId,updated_at:new Date().toISOString()},{onConflict:"event_id,participation_type"}).select("id").single();
      saveError=saved.error;templateId=saved.data?.id??templateId;
    }
    if(!saveError){
      const user=await supabase.auth.getUser();
      const metadata=user.data.user?.user_metadata??{};
      const versioned=await supabase.from("badge_template_versions").insert({organization_id:orgId,event_id:eventId,template_id:templateId,participation_type:templateDraft.participation_type,version:nextVersion,status,snapshot,saved_by:user.data.user?.id??null,saved_by_name:metadata.display_name||metadata.full_name||user.data.user?.email||null});
      saveError=versioned.error;
    }
    setBusy(false);
    if (saveError) setError(saveError.message);
    else {
      setInfo(
        (status==='draft'?"Borrador guardado para ":"Diseño publicado para ") +
          (TYPE_LABELS[templateDraft.participation_type] ??
            templateDraft.participation_type) +
          ".",
      );
      await loadOperationalData();
    }
  }
  async function uploadBadgeAsset(file:File){
    if(!orgId||!eventId)throw new Error("Selecciona un evento.");
    if(file.size>5*1024*1024)throw new Error("La imagen supera el límite de 5 MB.");
    if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type))throw new Error("Usa una imagen PNG, JPG, WebP o SVG.");
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${orgId}/${eventId}/${crypto.randomUUID()}-${safe}`;
    const uploaded=await supabase.storage.from('badge-assets').upload(path,file,{contentType:file.type,upsert:false});
    if(uploaded.error)throw uploaded.error;
    const publicUrl=supabase.storage.from('badge-assets').getPublicUrl(path).data.publicUrl;
    const saved=await supabase.from('badge_assets').insert({organization_id:orgId,event_id:eventId,name:file.name,storage_path:path,public_url:publicUrl,mime_type:file.type,size_bytes:file.size});
    if(saved.error){
      await supabase.storage.from('badge-assets').remove([path]);
      throw saved.error;
    }
    setBadgeAssets(items=>[{id:crypto.randomUUID(),name:file.name,public_url:publicUrl,mime_type:file.type,size_bytes:file.size,created_at:new Date().toISOString()},...items]);
    return publicUrl;
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
  const previewData:BadgeRenderData|undefined=selected?{...selected,...edit,last_name:edit.last_name||null,company:edit.company||null,job_title:edit.job_title||null,cedula:edit.cedula||null,event_name:eventName,organization_name:orgName,participation_type:TYPE_LABELS[selected.participation_type]??selected.participation_type}:undefined;
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
            {eventId && <Link to={`/admin/acreditacion/kiosco/${eventId}`} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800"><IdCard className="h-4 w-4" />Modo kiosco</Link>}
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
        <PrintStationPanel config={bridgeConfig} setConfig={setBridgeConfig} state={bridgeState} message={bridgeMessage} printers={bridgeDevices} connect={connectBridge} />
        <PrintQueuePanel jobs={printJobs} onAction={manageQueueJob} bridgeConnected={bridgeState==="connected"} />
        {showDesigner && canConfigure && (
          <><div className="mt-5 flex flex-wrap items-end gap-2"><label className="grid min-w-56 flex-1 gap-1 text-xs font-semibold">Diseño por tipo<select className={input} value={templateDraft.participation_type} onChange={e=>selectTemplateType(e.target.value)}>{TYPES.map(type=><option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></label><label className="grid min-w-44 gap-1 text-xs font-semibold">Copiar diseño a<select className={input} value={copyTemplateType===templateDraft.participation_type?(TYPES.find(type=>type!==templateDraft.participation_type)??''):copyTemplateType} onChange={e=>setCopyTemplateType(e.target.value)}>{TYPES.filter(type=>type!==templateDraft.participation_type).map(type=><option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></label><button type="button" onClick={()=>{const target=copyTemplateType===templateDraft.participation_type?(TYPES.find(type=>type!==templateDraft.participation_type)??'vip'):copyTemplateType;setTemplateDraft({...templateDraft,id:undefined,participation_type:target,name:`${templateDraft.name} · ${TYPE_LABELS[target]??target}`,version:0});setInfo(`Diseño copiado a ${TYPE_LABELS[target]??target}. Revísalo y publícalo.`)}} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Copiar</button></div><BadgeStudio template={templateDraft} onChange={setTemplateDraft} onSave={status=>void saveTemplate(status)} busy={busy} previewData={previewData} onTestPrint={()=>void testPrint()} testBusy={testBusy} onUploadImage={uploadBadgeAsset} assets={badgeAssets} versions={templateVersions.filter(item=>item.snapshot.participation_type===templateDraft.participation_type)} onRestore={snapshot=>{setTemplateDraft(snapshot);setInfo("Versión cargada en el editor. Publícala para activarla.")}}/></>
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
      {browserPages.length>0?(
        <BadgeImagePrint pages={browserPages} widthMm={activeTemplate.width_mm} heightMm={activeTemplate.height_mm}/>
      ):selected && !selected.badge_cancelled_at && (
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

function PrintQueuePanel({jobs,onAction,bridgeConnected}:{jobs:PrintJob[];onAction:(job:PrintJob,action:"cancel"|"prioritize"|"retry"|"reassign")=>Promise<void>;bridgeConnected:boolean}) {
  const labels:Record<PrintJob["status"],string>={queued:"En cola",rendering:"Renderizando",sent:"Enviada",spooled:"En spool",delivered:"Entregada",failed:"Fallida",cancelled:"Cancelada"}
  return <details className="mt-4 rounded-2xl border bg-white"><summary className="cursor-pointer list-none p-5 font-bold">Cola de impresión · {jobs.filter(job=>!["spooled","delivered","cancelled"].includes(job.status)).length} activas</summary><div className="border-t px-5 pb-5"><div className="divide-y">{jobs.map(job=><div key={job.id} className="grid gap-2 py-3 text-sm md:grid-cols-[110px_1fr_1fr_auto]"><span className={`font-bold ${job.status==="failed"?"text-red-700":["spooled","delivered"].includes(job.status)?"text-emerald-700":"text-amber-700"}`}>{labels[job.status]}{job.priority===1?" · Prioridad":""}</span><span>{job.station_label}<small className="block text-zinc-500">Intentos: {job.attempt_count}</small></span><span className="truncate text-zinc-600">{job.printer_name}</span><time className="text-xs text-zinc-500">{new Date(job.queued_at).toLocaleTimeString("es-VE")}</time>{job.error_message&&<p className="text-xs text-red-700 md:col-span-4">{job.error_message}</p>}<div className="flex flex-wrap gap-2 md:col-span-4">{job.status==="queued"&&<button type="button" onClick={()=>void onAction(job,"prioritize")} className="rounded border px-2 py-1 text-xs font-semibold">Priorizar</button>}{!["spooled","delivered","cancelled"].includes(job.status)&&<button type="button" onClick={()=>void onAction(job,"cancel")} className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">Cancelar</button>}{["failed","sent","cancelled"].includes(job.status)&&bridgeConnected&&<><button type="button" onClick={()=>void onAction(job,"retry")} className="rounded border px-2 py-1 text-xs font-semibold">Reintentar</button><button type="button" onClick={()=>void onAction(job,"reassign")} className="rounded border px-2 py-1 text-xs font-semibold">Cambiar impresora</button></>}</div></div>)}{!jobs.length&&<p className="py-4 text-sm text-zinc-500">Todavía no hay trabajos para este evento.</p>}</div></div></details>
}

function PrintStationPanel({config,setConfig,state,message,printers,connect}:{config:BridgeConfig;setConfig:(value:BridgeConfig)=>void;state:"unknown"|"connected"|"offline";message:string;printers:BridgePrinter[];connect:(config:BridgeConfig)=>Promise<void>}) {
  const update=(values:Partial<BridgeConfig>)=>{const next={...config,...values};setConfig(next);saveBridgeConfig(next)}
  const profile=(values:Partial<BridgeConfig["profile"]>)=>update({profile:{...config.profile,...values}})
  return <section className="mt-5 rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Estación de impresión</h2><p className="mt-1 text-xs text-zinc-600">Vincula el bridge local, calibra el soporte y controla la cola de Windows.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${state==="connected"?"bg-emerald-100 text-emerald-800":state==="offline"?"bg-red-100 text-red-800":"bg-zinc-100 text-zinc-700"}`}>{state==="connected"?"Bridge conectado":state==="offline"?"Bridge sin conexión":"Comprobando"}</span></div><div className="mt-4 grid gap-3 md:grid-cols-4"><label className="grid gap-1 text-xs font-semibold">Nombre de estación<input className={input} value={config.station} onChange={e=>update({station:e.target.value})}/></label><label className="grid gap-1 text-xs font-semibold">Dirección local<input className={input} value={config.url} onChange={e=>update({url:e.target.value})}/></label><label className="grid gap-1 text-xs font-semibold">Código de vinculación<input className={input} type="password" value={config.token} onChange={e=>update({token:e.target.value})} placeholder="Código mostrado por el bridge"/></label><label className="grid gap-1 text-xs font-semibold">Impresora<select className={input} value={config.printer} onChange={e=>update({printer:e.target.value})}><option value="">Selecciona una impresora</option>{printers.map(printer=><option key={printer.name} value={printer.name}>{printer.name}{printer.isDefault?" · predeterminada":""}{printer.offline?" · sin conexión":""}</option>)}</select></label></div><details className="mt-4 rounded-xl border bg-zinc-50 p-4"><summary className="cursor-pointer text-sm font-bold">Calibración y perfil local · {config.profile.name}</summary><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><label className="grid gap-1 text-xs font-semibold lg:col-span-2">Nombre del perfil<input className={input} value={config.profile.name} onChange={e=>profile({name:e.target.value})}/></label><label className="grid gap-1 text-xs font-semibold">X mm<input className={input} type="number" min="-30" max="30" step="0.1" value={config.profile.offsetXmm} onChange={e=>profile({offsetXmm:Number(e.target.value)})}/></label><label className="grid gap-1 text-xs font-semibold">Y mm<input className={input} type="number" min="-30" max="30" step="0.1" value={config.profile.offsetYmm} onChange={e=>profile({offsetYmm:Number(e.target.value)})}/></label><label className="grid gap-1 text-xs font-semibold">Escala %<input className={input} type="number" min="50" max="150" step="0.5" value={config.profile.scalePercent} onChange={e=>profile({scalePercent:Number(e.target.value)})}/></label><label className="grid gap-1 text-xs font-semibold">Copias<input className={input} type="number" min="1" max="10" value={config.profile.copies} onChange={e=>profile({copies:Number(e.target.value)})}/></label><label className="grid gap-1 text-xs font-semibold lg:col-span-2">Doble cara<select className={input} value={config.profile.duplexMode} onChange={e=>profile({duplexMode:e.target.value as BridgeConfig["profile"]["duplexMode"]})}><option value="simplex">Una cara</option><option value="long-edge">Borde largo</option><option value="short-edge">Borde corto</option></select></label></div><p className="mt-3 text-xs text-zinc-500">Los valores se guardan en esta estación y se adjuntan a la auditoría de cada trabajo.</p></details><div className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${state==="connected"?"bg-emerald-50 text-emerald-800":state==="offline"?"bg-red-50 text-red-800":"bg-zinc-100 text-zinc-700"}`} role="status">{message}</div><div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={state==="unknown"} onClick={()=>void connect(config)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{state==="unknown"?"Probando…":"Probar conexión"}</button>{state!=="connected"&&<p className="self-center text-xs text-zinc-500">Puedes seguir usando el diálogo del sistema como respaldo.</p>}</div></section>
}
function BadgeImagePrint({pages,widthMm,heightMm}:{pages:string[];widthMm:number;heightMm:number}){
  return createPortal(<div id="badge-print-root"><style>{`@page{size:${widthMm}mm ${heightMm}mm;margin:0}`}</style>{pages.map((page,index)=><img key={page} src={page} alt="" style={{display:'block',width:`${widthMm}mm`,height:`${heightMm}mm`,breakAfter:index<pages.length-1?'page':'auto'}}/>)}</div>,document.body)
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
  const size = { w: Number(template.width_mm) || 100, h: Number(template.height_mm) || 60 };
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
