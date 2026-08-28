import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Building2,
  Download,
  FileText,
  Home,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import CsvImportPanel from "../../components/CsvImportPanel";
import type { CsvColumn, CsvRow } from "../../lib/csvImport";
import { usePersistentDraft } from "../../lib/usePersistentDraft";

type Company = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  legal_name: string | null;
  tax_id: string | null;
  fiscal_address: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  billing_contact: string | null;
  website: string | null;
  profile_notes: string | null;
  public_logo_url?: string | null;
  public_description?: string | null;
  public_category?: string | null;
  public_social_links?: Record<string, string> | null;
  public_contact_email?: string | null;
  public_contact_phone?: string | null;
  public_profile_status?: string | null;
};
type Stand = { id: string; label: string; status: string };
type Assignment = { element_id: string; company_id: string };
type EventConfig = Record<string, unknown>;
type PortalMember = {
  id: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
};
type PortalTask = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: string;
};
type PortalPayment = {
  id: string;
  amount: number;
  currency: string;
  payment_date: string;
  reference: string | null;
  status: string;
  notes: string | null;
};
type PortalDocument = {
  id: string;
  name: string;
  kind: string;
  storage_path: string;
  created_at: string;
};
type PortalAudit = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  details: Record<string, unknown>;
};
const companyColumns: CsvColumn[] = [
  {
    key: "name",
    label: "Nombre comercial",
    required: true,
    aliases: ["nombre", "empresa"],
  },
  { key: "legal_name", label: "Razón social", aliases: ["razon_social"] },
  {
    key: "tax_id",
    label: "RIF",
    aliases: ["rif_identificacion", "identificacion_fiscal"],
  },
  { key: "contact_name", label: "Contacto", aliases: ["contacto_nombre"] },
  {
    key: "contact_email",
    label: "Correo",
    aliases: ["contacto_correo", "email"],
  },
  {
    key: "contact_phone",
    label: "Teléfono",
    aliases: ["contacto_telefono", "telefono"],
  },
];

export default function ExpositoresAdmin() {
  const { eventId } = useParams();
  const { session } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stands, setStands] = useState<Stand[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventConfig, setEventConfig] = useState<EventConfig>({});
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inviteCompany, setInviteCompany] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyDraft, setCompanyDraft] = useState<Partial<Company>>({});
  const [reviewCompany, setReviewCompany] = useState<Company | null>(null);
  const [portalMembers, setPortalMembers] = useState<PortalMember[]>([]);
  const [portalTasks, setPortalTasks] = useState<PortalTask[]>([]);
  const [portalPayments, setPortalPayments] = useState<PortalPayment[]>([]);
  const [portalDocuments, setPortalDocuments] = useState<PortalDocument[]>([]);
  const [portalAudit, setPortalAudit] = useState<PortalAudit[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const manualPath =
    typeof eventConfig.exhibitor_manual_path === "string"
      ? eventConfig.exhibitor_manual_path
      : null;
  const selectedCompany = companies.find(
    (company) => company.id === selectedCompanyId,
  );
  const companyDraftState = usePersistentDraft({
    key:
      eventId && selectedCompanyId
        ? `exhibitor:${eventId}:${selectedCompanyId}`
        : null,
    value: companyDraft,
    savedValue: selectedCompany ?? {},
    enabled: Boolean(selectedCompany),
    restore: setCompanyDraft,
  });

  const load = useCallback(async () => {
    if (!eventId) return;
    setError(null);
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("organization_id,name,config")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) {
      setError(eventError.message);
      return;
    }
    if (!event) {
      setError("No se encontró el evento.");
      return;
    }
    setOrgId(event.organization_id);
    setEventName(event.name ?? "");
    setEventConfig((event.config as EventConfig | null) ?? {});
    const { data: map } = await supabase
      .from("venue_maps")
      .select("id")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const [firmResult, standResult] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "id,name,contact_name,contact_email,contact_phone,legal_name,tax_id,fiscal_address,billing_email,billing_phone,billing_contact,website,profile_notes,public_logo_url,public_description,public_category,public_social_links,public_contact_email,public_contact_phone,public_profile_status",
        )
        .eq("organization_id", event.organization_id)
        .eq("kind", "exhibitor")
        .order("name"),
      map
        ? supabase
            .from("venue_map_elements")
            .select("id,label,status")
            .eq("map_id", map.id)
            .eq("element_type", "stand")
            .order("label")
        : Promise.resolve({ data: [], error: null }),
    ]);
    const boothResult = await supabase
      .from("booth_assignments")
      .select("element_id,company_id")
      .neq("status", "cancelled");
    setCompanies((firmResult.data ?? []) as Company[]);
    setStands((standResult.data ?? []) as Stand[]);
    setAssignments(
      ((boothResult.data ?? []) as Assignment[]).filter((item) =>
        (standResult.data ?? []).some((stand) => stand.id === item.element_id),
      ),
    );
    if (firmResult.error || standResult.error || boothResult.error)
      setError(
        firmResult.error?.message ??
          standResult.error?.message ??
          boothResult.error?.message ??
          "No se pudo cargar.",
      );
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!orgId || !name.trim()) return;
    const { error: insertError } = await supabase
      .from("companies")
      .insert({ organization_id: orgId, name: name.trim(), kind: "exhibitor" });
    if (insertError) setError(insertError.message);
    else {
      setName("");
      await load();
    }
  }

  async function importCompanies(rows: CsvRow[]) {
    if (!orgId)
      throw new Error("No se pudo identificar la organización del evento.");
    const known = new Set(
      companies.map((company) => company.name.trim().toLocaleLowerCase("es")),
    );
    const pending: Record<string, string | null>[] = [];
    let skipped = 0;
    for (const row of rows) {
      const key = row.name.trim().toLocaleLowerCase("es");
      if (!key || known.has(key)) {
        skipped += 1;
        continue;
      }
      known.add(key);
      pending.push({
        organization_id: orgId,
        kind: "exhibitor",
        name: row.name.trim(),
        legal_name: row.legal_name || null,
        tax_id: row.tax_id || null,
        contact_name: row.contact_name || null,
        contact_email: row.contact_email || null,
        contact_phone: row.contact_phone || null,
      });
    }
    if (!pending.length) return { created: 0, skipped };
    const { error: importError } = await supabase
      .from("companies")
      .insert(pending);
    if (importError) throw new Error(importError.message);
    await load();
    return { created: pending.length, skipped };
  }

  async function assign(companyId: string, standId: string) {
    const { error: assignmentError } = await supabase
      .from("booth_assignments")
      .upsert(
        { element_id: standId, company_id: companyId, status: "confirmed" },
        { onConflict: "element_id" },
      );
    if (!assignmentError)
      await supabase
        .from("venue_map_elements")
        .update({ status: "assigned" })
        .eq("id", standId);
    if (assignmentError) setError(assignmentError.message);
    else {
      setAssignments((current) => [
        ...current.filter(
          (item) =>
            item.company_id !== companyId && item.element_id !== standId,
        ),
        { element_id: standId, company_id: companyId },
      ]);
      setStands((current) =>
        current.map((stand) =>
          stand.id === standId ? { ...stand, status: "assigned" } : stand,
        ),
      );
      setNotice("Stand asignado y guardado.");
      window.setTimeout(() => {
        void load();
      }, 1800);
    }
  }

  async function uploadManual(file: File | undefined) {
    if (!file || !eventId || !orgId) return;
    if (file.type !== "application/pdf") {
      setError("El manual debe estar en formato PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("El manual no puede superar 10 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    const path = `${orgId}/${eventId}/exhibitor-manual-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("agenda-attachments")
      .upload(path, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    const config = { ...eventConfig, exhibitor_manual_path: path };
    const { error: updateError } = await supabase
      .from("events")
      .update({ config })
      .eq("id", eventId);
    if (updateError) setError(updateError.message);
    else setEventConfig(config);
    setUploading(false);
  }

  async function downloadManual() {
    if (!manualPath) return;
    const { data, error: signedError } = await supabase.storage
      .from("agenda-attachments")
      .createSignedUrl(manualPath, 300);
    if (signedError) setError(signedError.message);
    else if (data?.signedUrl)
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function inviteStaff(event: React.FormEvent) {
    event.preventDefault();
    if (!eventId || !inviteCompany || !inviteEmail || !session?.access_token)
      return;
    setInviting(true);
    setError(null);
    setNotice(null);
    const api =
      (import.meta.env.VITE_API_URL as string | undefined)?.replace(
        /\/$/,
        "",
      ) ?? "";
    const response = await fetch(`${api}/api/exhibitor-portal/invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_id: eventId,
        company_id: inviteCompany,
        email: inviteEmail,
        role: "staff",
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      setError(body.error ?? "No se pudo enviar la invitación.");
    else {
      setInviteEmail("");
      setNotice(
        "Invitación enviada por correo. El usuario recibirá un enlace para definir su contraseña y entrar al portal.",
      );
    }
    setInviting(false);
  }

  function selectCompany(company: Company) {
    setSelectedCompanyId(company.id);
    setCompanyDraft(company);
    void loadCompanyAdmin(company.id);
  }

  async function loadCompanyAdmin(companyId: string) {
    if (!eventId) return;
    const [
      memberResult,
      taskResult,
      paymentResult,
      documentResult,
      auditResult,
    ] = await Promise.all([
      supabase
        .from("exhibitor_portal_members")
        .select("id,email,role,status,created_at")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("exhibitor_portal_tasks")
        .select("id,title,description,due_at,status")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .order("due_at"),
      supabase
        .from("exhibitor_portal_payments")
        .select("id,amount,currency,payment_date,reference,status,notes")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .order("payment_date", { ascending: false }),
      supabase
        .from("exhibitor_portal_documents")
        .select("id,name,kind,storage_path,created_at")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("exhibitor_portal_audit")
        .select("id,action,entity_type,created_at,details")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setPortalMembers((memberResult.data ?? []) as PortalMember[]);
    setPortalTasks((taskResult.data ?? []) as PortalTask[]);
    setPortalPayments((paymentResult.data ?? []) as PortalPayment[]);
    setPortalDocuments((documentResult.data ?? []) as PortalDocument[]);
    setPortalAudit((auditResult.data ?? []) as PortalAudit[]);
    const issue =
      memberResult.error ??
      taskResult.error ??
      paymentResult.error ??
      documentResult.error ??
      auditResult.error;
    if (issue) setError(issue.message);
  }

  async function createTask() {
    if (!eventId || !selectedCompanyId || !taskTitle.trim()) return;
    setTaskBusy(true);
    const { error: taskError } = await supabase
      .from("exhibitor_portal_tasks")
      .insert({
        event_id: eventId,
        company_id: selectedCompanyId,
        title: taskTitle.trim(),
        due_at: taskDue || null,
        created_by: session?.user.id ?? null,
      });
    if (taskError) setError(taskError.message);
    else {
      setTaskTitle("");
      setTaskDue("");
      await loadCompanyAdmin(selectedCompanyId);
    }
    setTaskBusy(false);
  }

  async function updateTask(task: PortalTask) {
    const next = task.status === "completed" ? "pending" : "completed";
    const { error: taskError } = await supabase
      .from("exhibitor_portal_tasks")
      .update({
        status: next,
        completed_at: next === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (taskError) setError(taskError.message);
    else if (selectedCompanyId) await loadCompanyAdmin(selectedCompanyId);
  }

  async function updatePayment(payment: PortalPayment, status: string) {
    const { error: paymentError } = await supabase
      .from("exhibitor_portal_payments")
      .update({ status })
      .eq("id", payment.id);
    if (paymentError) setError(paymentError.message);
    else if (selectedCompanyId) await loadCompanyAdmin(selectedCompanyId);
  }

  async function revokeMember(member: PortalMember) {
    const { error: memberError } = await supabase
      .from("exhibitor_portal_members")
      .update({ status: "revoked" })
      .eq("id", member.id);
    if (memberError) setError(memberError.message);
    else if (selectedCompanyId) await loadCompanyAdmin(selectedCompanyId);
  }

  async function resendMember(member: PortalMember) {
    if (!eventId || !member.email || !session?.access_token) return;
    const api =
      (import.meta.env.VITE_API_URL as string | undefined)?.replace(
        /\/$/,
        "",
      ) ?? "";
    const response = await fetch(`${api}/api/exhibitor-portal/invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_id: eventId,
        company_id: selectedCompanyId,
        email: member.email,
        role: member.role,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      setError(body.error ?? "No se pudo reenviar la invitación.");
    else setNotice(`Invitación reenviada a ${member.email}.`);
  }

  async function uploadDocument(file: File | undefined) {
    if (!file || !eventId || !orgId || !selectedCompanyId) return;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${orgId}/${eventId}/${selectedCompanyId}/documents/${Date.now()}-${safeName}`;
    const upload = await supabase.storage
      .from("agenda-attachments")
      .upload(path, file, { upsert: false });
    if (upload.error) {
      setError(upload.error.message);
      return;
    }
    const { error: documentError } = await supabase
      .from("exhibitor_portal_documents")
      .insert({
        event_id: eventId,
        company_id: selectedCompanyId,
        name: file.name,
        kind: "document",
        storage_path: path,
      });
    if (documentError) setError(documentError.message);
    else await loadCompanyAdmin(selectedCompanyId);
  }

  async function downloadDocument(path: string) {
    const { data, error: signedError } = await supabase.storage
      .from("agenda-attachments")
      .createSignedUrl(path, 300);
    if (signedError) setError(signedError.message);
    else if (data?.signedUrl)
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCompanyId) return;
    const { error: saveError } = await supabase
      .from("companies")
      .update({
        name: companyDraft.name?.trim(),
        contact_name: companyDraft.contact_name?.trim() || null,
        contact_email: companyDraft.contact_email?.trim() || null,
        contact_phone: companyDraft.contact_phone?.trim() || null,
        legal_name: companyDraft.legal_name?.trim() || null,
        tax_id: companyDraft.tax_id?.trim() || null,
        fiscal_address: companyDraft.fiscal_address?.trim() || null,
        billing_email: companyDraft.billing_email?.trim() || null,
        billing_phone: companyDraft.billing_phone?.trim() || null,
        billing_contact: companyDraft.billing_contact?.trim() || null,
        website: companyDraft.website?.trim() || null,
        profile_notes: companyDraft.profile_notes?.trim() || null,
      })
      .eq("id", selectedCompanyId);
    if (saveError) setError(saveError.message);
    else {
      companyDraftState.clear();
      setError(null);
      setSelectedCompanyId("");
      setCompanyDraft({});
      await load();
    }
  }

  async function reviewPublicProfile(companyId: string, approved: boolean) {
    const { error: reviewError } = await supabase.rpc(
      "review_exhibitor_public_profile",
      { p_company_id: companyId, p_approved: approved },
    );
    if (reviewError) setError(reviewError.message);
    else {
      setReviewCompany(null);
      setNotice(
        approved
          ? "Perfil aprobado y visible en el plano."
          : "Perfil devuelto para correcciones.",
      );
      await load();
    }
  }

  const assigned = new Map(
    assignments.map((item) => [item.company_id, item.element_id]),
  );
  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          <Link
            to={`/admin/eventos/${eventId}/administrar`}
            aria-label="Volver a administrar evento"
            className="inline-flex items-center gap-2 font-semibold text-emerald-700"
          >
            <Home className="h-4 w-4" />
            Admin del evento
          </Link>
          <Building2 className="h-5 w-5 text-emerald-700" />
          <span className="font-semibold">Expositores y plano</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-2xl font-bold">
          Expositores{eventName ? ` · ${eventName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Gestiona empresas y asigna uno o varios espacios desde una vista
          comercial separada del diseño.
        </p>
        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}
          <section className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="font-semibold text-amber-950">Revisión de perfiles públicos</h2>
            <p className="mt-1 text-xs text-amber-900">Aprueba o devuelve los perfiles enviados antes de mostrarlos en el plano público.</p>
            <div className="mt-3 space-y-2">
              {companies.filter((company) => company.public_profile_status === "pending").map((company) => (
                <div key={company.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm">
                  <span><b>{company.name}</b>{company.public_category ? ` · ${company.public_category}` : ""}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setReviewCompany(company)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Ver perfil enviado</button>
                    <button type="button" onClick={() => void reviewPublicProfile(company.id, true)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Aprobar</button>
                    <button type="button" onClick={() => void reviewPublicProfile(company.id, false)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900">Solicitar cambios</button>
                  </div>
                </div>
              ))}
              {!companies.some((company) => company.public_profile_status === "pending") && (
                <p className="rounded-lg bg-white p-3 text-sm text-amber-900">No hay perfiles pendientes de revisión.</p>
              )}
            </div>
          </section>
        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <form onSubmit={create} className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold">Nueva empresa expositora</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border p-2 text-sm"
                placeholder="Nombre de la empresa"
              />
              <button className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
                Crear
              </button>
            </div>
          </form>
          <div className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold">Manual del expositor</h2>
            <p className="mt-1 text-xs text-zinc-600">
              PDF privado para que los expositores lo descarguen desde su portal
              (máximo 10 MB).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Upload className="h-4 w-4" />
                {uploading ? "Subiendo…" : "Cargar PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    void uploadManual(event.target.files?.[0]);
                  }}
                />
              </label>
              {manualPath && (
                <button
                  type="button"
                  onClick={() => {
                    void downloadManual();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <Download className="h-4 w-4" />
                  Descargar manual
                </button>
              )}
            </div>
          </div>
          <form
            onSubmit={inviteStaff}
            className="rounded-xl border bg-white p-4"
          >
            <h2 className="font-semibold">Invitar personal al portal</h2>
            <p className="mt-1 text-xs text-zinc-600">
              El personal sólo verá la empresa y el evento asignados.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select
                required
                value={inviteCompany}
                onChange={(event) => setInviteCompany(event.target.value)}
                className="rounded-lg border p-2 text-sm"
              >
                <option value="">Empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="correo@empresa.com"
                className="rounded-lg border p-2 text-sm"
              />
            </div>
            <button
              disabled={inviting}
              className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {inviting ? "Enviando…" : "Invitar personal"}
            </button>
          </form>
          {selectedCompanyId && (
            <form
              onSubmit={saveCompany}
              className="rounded-xl border bg-white p-4 md:col-span-2"
            >
              <h2 className="font-semibold">Datos del expositor</h2>
              <p className="mt-1 text-xs text-zinc-600">
                El organizador puede corregir aquí la información comercial,
                fiscal y de facturación.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  required
                  value={companyDraft.name ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      name: event.target.value,
                    })
                  }
                  placeholder="Nombre comercial"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  value={companyDraft.legal_name ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      legal_name: event.target.value,
                    })
                  }
                  placeholder="Razón social"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  value={companyDraft.tax_id ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      tax_id: event.target.value,
                    })
                  }
                  placeholder="RIF / identificación fiscal"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  value={companyDraft.contact_name ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      contact_name: event.target.value,
                    })
                  }
                  placeholder="Contacto principal"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  type="email"
                  value={companyDraft.contact_email ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      contact_email: event.target.value,
                    })
                  }
                  placeholder="Correo de contacto"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  value={companyDraft.contact_phone ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      contact_phone: event.target.value,
                    })
                  }
                  placeholder="Teléfono"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  value={companyDraft.billing_contact ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      billing_contact: event.target.value,
                    })
                  }
                  placeholder="Contacto de facturación"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  type="email"
                  value={companyDraft.billing_email ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      billing_email: event.target.value,
                    })
                  }
                  placeholder="Correo de facturación"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  value={companyDraft.billing_phone ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      billing_phone: event.target.value,
                    })
                  }
                  placeholder="Teléfono de facturación"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  value={companyDraft.website ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      website: event.target.value,
                    })
                  }
                  placeholder="Sitio web"
                  className="rounded-lg border p-2 text-sm"
                />
                <textarea
                  value={companyDraft.fiscal_address ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      fiscal_address: event.target.value,
                    })
                  }
                  placeholder="Dirección fiscal"
                  className="rounded-lg border p-2 text-sm sm:col-span-2"
                />
                <textarea
                  value={companyDraft.profile_notes ?? ""}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      profile_notes: event.target.value,
                    })
                  }
                  placeholder="Notas del acuerdo o perfil"
                  className="rounded-lg border p-2 text-sm sm:col-span-2"
                />
              </div>
              <button className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white">
                Guardar datos
              </button>
              {companyDraftState.dirty && (
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  Cambios sin guardar. El borrador se conserva en este dispositivo
                  si sales y vuelves.
                </p>
              )}
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <h3 className="font-semibold">Personal e invitaciones</h3>
                  <div className="mt-3 space-y-2 text-xs">
                    {portalMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-2 rounded bg-zinc-50 p-2"
                      >
                        <span>
                          {member.email ?? "Correo pendiente"} · {member.role}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              void resendMember(member);
                            }}
                            title="Reenviar"
                            className="rounded border p-1"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          {member.status !== "revoked" && (
                            <button
                              type="button"
                              onClick={() => {
                                void revokeMember(member);
                              }}
                              title="Revocar"
                              className="rounded border border-red-200 p-1 text-red-700"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                    {!portalMembers.length && (
                      <p className="text-zinc-500">
                        No hay personal vinculado.
                      </p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <h3 className="font-semibold">Documentos del expositor</h3>
                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs">
                    <Upload className="h-3.5 w-3.5" />
                    Subir documento
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        void uploadDocument(event.target.files?.[0]);
                      }}
                    />
                  </label>
                  <div className="mt-2 space-y-1 text-xs">
                    {portalDocuments.map((document) => (
                      <button
                        type="button"
                        key={document.id}
                        onClick={() => {
                          void downloadDocument(document.storage_path);
                        }}
                        className="flex w-full items-center gap-2 text-left text-emerald-700"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {document.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <h3 className="font-semibold">Tareas</h3>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Nueva tarea"
                      className="min-w-0 flex-1 rounded border p-2 text-xs"
                    />
                    <input
                      type="date"
                      value={taskDue}
                      onChange={(event) => setTaskDue(event.target.value)}
                      className="rounded border p-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={taskBusy}
                      onClick={() => {
                        void createTask();
                      }}
                      className="rounded bg-emerald-700 px-2 text-xs font-semibold text-white"
                    >
                      Añadir
                    </button>
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    {portalTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between rounded bg-zinc-50 p-2"
                      >
                        <span
                          className={
                            task.status === "completed"
                              ? "line-through text-zinc-400"
                              : ""
                          }
                        >
                          {task.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void updateTask(task);
                          }}
                          className="text-emerald-700"
                        >
                          {task.status === "completed"
                            ? "Reabrir"
                            : "Completar"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <h3 className="font-semibold">Pagos</h3>
                  <div className="mt-2 space-y-1 text-xs">
                    {portalPayments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between gap-2 rounded bg-zinc-50 p-2"
                      >
                        <span>
                          {payment.amount} {payment.currency} ·{" "}
                          {payment.reference ?? "Sin referencia"}
                        </span>
                        <select
                          value={payment.status}
                          onChange={(event) => {
                            void updatePayment(payment, event.target.value);
                          }}
                          className="rounded border p-1"
                        >
                          <option value="pending">Pendiente</option>
                          <option value="confirmed">Confirmado</option>
                          <option value="rejected">Rechazado</option>
                        </select>
                      </div>
                    ))}
                    {!portalPayments.length && (
                      <p className="text-zinc-500">No hay pagos reportados.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border p-3 lg:col-span-2">
                  <h3 className="font-semibold">Auditoría reciente</h3>
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    {portalAudit.map((entry) => (
                      <p key={entry.id}>
                        {new Date(entry.created_at).toLocaleString()} ·{" "}
                        {entry.action} · {entry.entity_type}
                      </p>
                    ))}
                    {!portalAudit.length && (
                      <p>No hay movimientos registrados.</p>
                    )}
                  </div>
                </div>
              </div>
            </form>
          )}
        </section>
        <div className="mt-6">
          <CsvImportPanel
            title="Importar empresas expositoras"
            description="Carga en bloque los datos comerciales básicos. Los nombres ya existentes en esta organización se omiten."
            columns={companyColumns}
            example={{
              name: "Empresa Ejemplo, C.A.",
              legal_name: "Empresa Ejemplo de Venezuela, C.A.",
              tax_id: "J-12345678-9",
              contact_name: "Ana Pérez",
              contact_email: "ana@empresa.com",
              contact_phone: "+58 412 0000000",
            }}
            templateName="plantilla-empresas-expositoras.csv"
            onImport={importCompanies}
          />
        </div>
        <div className="mt-6 overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-600">
              <tr>
                <th className="p-3">Empresa</th>
                <th className="p-3">Contacto</th>
                <th className="p-3">Espacio</th>
                <th className="p-3">Portal</th>
                <th className="p-3">Editar</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} className="border-t">
                  <td className="p-3 font-medium">{company.name}</td>
                  <td className="p-3 text-zinc-600">
                    {company.contact_name ??
                      company.contact_email ??
                      "Pendiente"}
                  </td>
                  <td className="p-3">
                    <select
                      value={assigned.get(company.id) ?? ""}
                      onChange={(event) =>
                        event.target.value &&
                        assign(company.id, event.target.value)
                      }
                      className="rounded border p-2 text-sm"
                    >
                      <option value="">Sin espacio</option>
                      {stands
                        .filter(
                          (stand) =>
                            stand.status !== "assigned" ||
                            assigned.get(company.id) === stand.id,
                        )
                        .map((stand) => (
                          <option key={stand.id} value={stand.id}>
                            {stand.label}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <Link
                      to={`/portal/expositor/${eventId}?companyId=${company.id}`}
                      className="text-xs font-semibold text-emerald-700"
                    >
                      Abrir portal
                    </Link>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => selectCompany(company)}
                      className="text-xs font-semibold text-zinc-700"
                    >
                      Editar datos
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="mt-6 rounded-xl border bg-white p-4">
          <h2 className="font-semibold">Revisión de perfiles públicos</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Aprueba el branding que los expositores enviaron desde su portal.
          </p>
          <div className="mt-3 space-y-2">
            {companies
              .filter(
                (company) =>
                  company.public_profile_status === "pending" ||
                  company.public_profile_status === "approved",
              )
              .map((company) => (
                <div
                  key={company.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3 text-sm"
                >
                  <span>
                    <b>{company.name}</b>
                    <span className="ml-2 text-xs text-zinc-500">
                      {company.public_profile_status === "approved"
                        ? "Aprobado"
                        : "Pendiente"}
                      {company.public_category
                        ? ` · ${company.public_category}`
                        : ""}
                    </span>
                  </span>
                  <div className="flex gap-2">
                    {company.public_profile_status !== "approved" && (
                      <button
                        type="button"
                        onClick={() => setReviewCompany(company)}
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      >
                        Ver perfil
                      </button>
                    )}
                    {company.public_profile_status !== "approved" && (
                      <button
                        type="button"
                        onClick={() =>
                          void reviewPublicProfile(company.id, true)
                        }
                        className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Aprobar
                      </button>
                    )}
                    {company.public_profile_status === "approved" && (
                      <button
                        type="button"
                        onClick={() => setReviewCompany(company)}
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      >
                        Ver perfil
                      </button>
                    )}
                    {company.public_profile_status === "approved" && (
                      <button
                        type="button"
                        onClick={() =>
                          void reviewPublicProfile(company.id, false)
                        }
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800"
                      >
                        Solicitar cambios
                      </button>
                    )}
                  </div>
                </div>
              ))}
            {!companies.some(
              (company) =>
                company.public_profile_status === "pending" ||
                company.public_profile_status === "approved",
            ) && (
              <p className="text-sm text-zinc-500">No hay perfiles enviados.</p>
            )}
          </div>
        </section>
        {reviewCompany && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/50 p-4" onClick={() => setReviewCompany(null)}>
            <section className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Perfil público enviado</p>
                  <h2 className="mt-1 text-2xl font-bold">{reviewCompany.name}</h2>
                  <p className="mt-1 text-sm text-zinc-500">Estado: {reviewCompany.public_profile_status === "approved" ? "Aprobado" : "Pendiente de revisión"}</p>
                </div>
                <button type="button" onClick={() => setReviewCompany(null)} className="rounded-lg border px-3 py-2 text-sm">Cerrar</button>
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-[160px_1fr]">
                <div className="grid h-36 place-items-center rounded-xl border bg-zinc-50 p-3">
                  {reviewCompany.public_logo_url ? <img src={reviewCompany.public_logo_url} alt={`Logo de ${reviewCompany.name}`} className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-zinc-400">Sin logo</span>}
                </div>
                <dl className="grid gap-3 text-sm">
                  <div><dt className="text-xs font-semibold uppercase text-zinc-500">Categoría</dt><dd className="mt-1">{reviewCompany.public_category || "Sin categoría"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-zinc-500">Contacto público</dt><dd className="mt-1">{reviewCompany.public_contact_email || reviewCompany.public_contact_phone || "Sin contacto"}</dd></div>
                  {reviewCompany.public_social_links?.website && <div><dt className="text-xs font-semibold uppercase text-zinc-500">Sitio web</dt><dd className="mt-1"><a href={reviewCompany.public_social_links.website} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{reviewCompany.public_social_links.website}</a></dd></div>}
                </dl>
              </div>
              <div className="mt-5 rounded-xl border bg-zinc-50 p-4">
                <h3 className="text-xs font-semibold uppercase text-zinc-500">Descripción pública</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{reviewCompany.public_description || "Sin descripción"}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {reviewCompany.public_social_links?.linkedin && <a href={reviewCompany.public_social_links.linkedin} target="_blank" rel="noreferrer" className="text-emerald-700 underline">LinkedIn</a>}
                {reviewCompany.public_social_links?.instagram && <a href={reviewCompany.public_social_links.instagram} target="_blank" rel="noreferrer" className="text-emerald-700 underline">Instagram</a>}
              </div>
              <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                <button type="button" onClick={() => void reviewPublicProfile(reviewCompany.id, false)} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900">Solicitar cambios</button>
                {reviewCompany.public_profile_status !== "approved" && <button type="button" onClick={() => void reviewPublicProfile(reviewCompany.id, true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Aprobar perfil</button>}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
