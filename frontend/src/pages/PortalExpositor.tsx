import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImagePlus,
  LogOut,
  Upload,
  Users,
  ScanLine,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { usePersistentDraft } from "../lib/usePersistentDraft";
import CsvImportPanel from "../components/CsvImportPanel";
import type { CsvColumn, CsvRow } from "../lib/csvImport";

type EventRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown> | null;
};
type CompanyProfile = {
  name: string;
  contact_email: string | null;
  public_logo_url?: string | null;
  public_description?: string | null;
  public_category?: string | null;
  public_social_links?: Record<string, string> | null;
  public_contact_email?: string | null;
  public_contact_phone?: string | null;
  public_profile_status?: string | null;
  public_profile_review_notes?: string | null;
};
type Membership = {
  id: string;
  company_id: string;
  role: string;
  status: string;
  company: CompanyProfile | null;
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: string;
};
type Payment = {
  id: string;
  amount: number;
  currency: string;
  payment_date: string;
  reference: string | null;
  status: string;
  receipt_path: string | null;
};
type Staff = { id: string; role: string; status: string; user_id: string };
type Personnel = {
  id: string;
  full_name: string;
  identification: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string;
};
type Activity = {
  id: string;
  title: string;
  details: string | null;
  activity_at: string;
};
type PersonnelDraft = Omit<Personnel, "id" | "status">;
type PublicProfile = {
  logo_url: string;
  description: string;
  category: string;
  website: string;
  linkedin: string;
  instagram: string;
  contact_email: string;
  contact_phone: string;
};
const personnelColumns: CsvColumn[] = [
  {
    key: "full_name",
    label: "Nombre completo",
    required: true,
    aliases: ["nombre"],
  },
  {
    key: "identification",
    label: "Identificación",
    required: true,
    aliases: ["identificacion", "cedula"],
  },
  { key: "email", label: "Correo", aliases: ["email"] },
  { key: "phone", label: "Teléfono", aliases: ["telefono"] },
  { key: "role", label: "Cargo", aliases: ["funcion", "rol"] },
];

export default function PortalExpositor() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const { user, signOut } = useAuth();
  const userId = user?.id;
  const requestedCompanyId = searchParams.get("companyId");
  const [event, setEvent] = useState<EventRow | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [platformPreview, setPlatformPreview] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [publicElementId, setPublicElementId] = useState<string | null>(null);
  const [personnelDraft, setPersonnelDraft] = useState<PersonnelDraft>({
    full_name: "",
    identification: "",
    email: "",
    phone: "",
    role: "",
  });
  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState({ title: "", description: "", due_at: "" });
  const [activityDraft, setActivityDraft] = useState({ title: "", details: "", activity_at: "" });
  const [profile, setProfile] = useState<PublicProfile>({
    logo_url: "",
    description: "",
    category: "",
    website: "",
    linkedin: "",
    instagram: "",
    contact_email: "",
    contact_phone: "",
  });
  const [profileStatus, setProfileStatus] = useState("draft");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const savedProfile = membership
    ? {
        logo_url: membership.company?.public_logo_url ?? "",
        description: membership.company?.public_description ?? "",
        category: membership.company?.public_category ?? "",
        website: membership.company?.public_social_links?.website ?? "",
        linkedin: membership.company?.public_social_links?.linkedin ?? "",
        instagram: membership.company?.public_social_links?.instagram ?? "",
        contact_email: membership.company?.public_contact_email ?? "",
        contact_phone: membership.company?.public_contact_phone ?? "",
      }
    : profile;
  const profileDraftState = usePersistentDraft({
    key:
      eventId && membership
        ? `exhibitor-profile:${eventId}:${membership.company_id}`
        : null,
    value: profile,
    savedValue: savedProfile,
    enabled: Boolean(membership),
    restore: setProfile,
  });

  const load = useCallback(async () => {
    if (!eventId || !userId) return;
    setMessage(null);
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("id,organization_id,name,description,config")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError || !eventData) {
      setMessage(eventError?.message ?? "Evento no encontrado.");
      return;
    }
    setEvent(eventData as EventRow);
    const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
    let member: Membership | null = null;
    setPlatformPreview(Boolean(isPlatformAdmin && requestedCompanyId));
    if (isPlatformAdmin && requestedCompanyId) {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select(
          "id,name,contact_email,public_logo_url,public_description,public_category,public_social_links,public_contact_email,public_contact_phone,public_profile_status,public_profile_review_notes",
        )
        .eq("id", requestedCompanyId)
        .eq("event_id", eventId)
        .maybeSingle();
      if (companyError || !company) {
        setMessage(companyError?.message ?? "Expositor no encontrado.");
        return;
      }
      member = {
        id: "platform-preview",
        company_id: company.id,
        role: "owner",
        status: "active",
        company: company as CompanyProfile,
      };
    } else {
      const { data: portalMember, error: memberError } = await supabase
        .from("exhibitor_portal_members")
        .select(
          "id,company_id,role,status,company:companies(name,contact_email,public_logo_url,public_description,public_category,public_social_links,public_contact_email,public_contact_phone,public_profile_status,public_profile_review_notes)",
        )
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (memberError || !portalMember) {
        setMessage(
          memberError?.message ?? "Tu usuario no tiene acceso a este portal.",
        );
        return;
      }
      member = portalMember as unknown as Membership;
    }
    setMembership(member);
    const social = member.company?.public_social_links ?? {};
    const serverProfile: PublicProfile = {
      logo_url: member.company?.public_logo_url ?? "",
      description: member.company?.public_description ?? "",
      category: member.company?.public_category ?? "",
      website: social.website ?? "",
      linkedin: social.linkedin ?? "",
      instagram: social.instagram ?? "",
      contact_email: member.company?.public_contact_email ?? "",
      contact_phone: member.company?.public_contact_phone ?? "",
    };
    let nextProfile = serverProfile;
    let recoveredLocalDraft = false;
    try {
      const stored = localStorage.getItem(
        `eventpass:draft:exhibitor-profile:${eventId}:${member.company_id}`,
      );
      if (stored) {
        nextProfile = {
          ...serverProfile,
          ...(JSON.parse(stored) as Partial<PublicProfile>),
        };
        recoveredLocalDraft = true;
      }
    } catch {
      localStorage.removeItem(
        `eventpass:draft:exhibitor-profile:${eventId}:${member.company_id}`,
      );
    }
    setProfile(nextProfile);
    if (recoveredLocalDraft)
      setMessage(
        "Se recuperó un borrador local de este dispositivo. Todavía no se ha guardado ni enviado al servidor.",
      );
    setProfileStatus(member.company?.public_profile_status ?? "draft");
    const companyId = member.company_id;
    const [taskResult, paymentResult, staffResult, personnelResult, activityResult, publicLinkResult] =
      await Promise.all([
        supabase
          .from("exhibitor_portal_tasks")
          .select("id,title,description,due_at,status")
          .eq("event_id", eventId)
          .eq("company_id", companyId)
          .order("due_at"),
        supabase
          .from("exhibitor_portal_payments")
          .select(
            "id,amount,currency,payment_date,reference,status,receipt_path",
          )
          .eq("event_id", eventId)
          .eq("company_id", companyId)
          .order("payment_date", { ascending: false }),
        supabase
          .from("exhibitor_portal_members")
          .select("id,role,status,user_id")
          .eq("event_id", eventId)
          .eq("company_id", companyId)
          .order("created_at"),
        supabase
          .from("exhibitor_staff")
          .select("id,full_name,identification,email,phone,role,status")
          .eq("event_id", eventId)
          .eq("company_id", companyId)
          .order("full_name"),
        supabase
          .from("exhibitor_portal_activities")
          .select("id,title,details,activity_at")
          .eq("event_id", eventId)
          .eq("company_id", companyId)
          .order("activity_at", { ascending: false }),
        supabase
          .from("published_exhibition_directory")
          .select("element_id")
          .eq("company_id", companyId)
          .limit(1)
          .maybeSingle(),
      ]);
    if (
      taskResult.error ||
      paymentResult.error ||
      staffResult.error ||
      personnelResult.error ||
      activityResult.error
    )
      setMessage(
        taskResult.error?.message ??
          paymentResult.error?.message ??
          staffResult.error?.message ??
          personnelResult.error?.message ??
          activityResult.error?.message ??
          "No se pudo cargar el portal.",
      );
    setTasks((taskResult.data ?? []) as Task[]);
    setPayments((paymentResult.data ?? []) as Payment[]);
    setStaff((staffResult.data ?? []) as Staff[]);
    setPersonnel((personnelResult.data ?? []) as Personnel[]);
    setActivities((activityResult.data ?? []) as Activity[]);
    setPublicElementId((publicLinkResult.data as { element_id?: string } | null)?.element_id ?? null);
  }, [eventId, requestedCompanyId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function completeTask(task: Task) {
    const { error } = await supabase
      .from("exhibitor_portal_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", task.id);
    if (error) setMessage(error.message);
    else await load();
  }

  function resetPersonnelDraft() {
    setEditingPersonnelId(null);
    setPersonnelDraft({ full_name: "", identification: "", email: "", phone: "", role: "" });
  }

  async function savePersonnel(eventSubmit: React.FormEvent) {
    eventSubmit.preventDefault();
    if (!eventId || !membership || !personnelDraft.full_name.trim()) return;
    setBusy(true);
    setMessage(null);
    const payload = {
      event_id: eventId,
      company_id: membership.company_id,
      full_name: personnelDraft.full_name.trim(),
      identification: personnelDraft.identification?.trim() || null,
      email: personnelDraft.email?.trim() || null,
      phone: personnelDraft.phone?.trim() || null,
      role: personnelDraft.role?.trim() || null,
    };
    const result = editingPersonnelId
      ? await supabase.from("exhibitor_staff").update(payload).eq("id", editingPersonnelId).select("id,full_name,identification,email,phone,role,status").single()
      : await supabase.from("exhibitor_staff").insert(payload).select("id,full_name,identification,email,phone,role,status").single();
    if (result.error) setMessage(result.error.message);
    else {
      const saved = result.data as Personnel;
      setPersonnel((current) => editingPersonnelId
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved].sort((a, b) => a.full_name.localeCompare(b.full_name, "es")));
      resetPersonnelDraft();
      setMessage(editingPersonnelId ? "Datos del personal actualizados." : "Personal agregado correctamente.");
    }
    setBusy(false);
  }

  async function togglePersonnel(item: Personnel) {
    const nextStatus = item.status === "active" ? "inactive" : "active";
    const { data, error } = await supabase.from("exhibitor_staff").update({ status: nextStatus }).eq("id", item.id).select("id,full_name,identification,email,phone,role,status").single();
    if (error) setMessage(error.message);
    else setPersonnel((current) => current.map((person) => person.id === item.id ? data as Personnel : person));
  }

  async function deletePersonnel(item: Personnel) {
    if (!window.confirm(`¿Eliminar definitivamente a ${item.full_name}?`)) return;
    const { data, error } = await supabase.from("exhibitor_staff").delete().eq("id", item.id).select("id").single();
    if (error) setMessage(error.message);
    else {
      if (!data?.id) {
        setMessage("No se eliminó ningún registro. Recarga la página e inténtalo de nuevo.");
        return;
      }
      setPersonnel((current) => current.filter((person) => person.id !== data.id));
      if (editingPersonnelId === item.id) resetPersonnelDraft();
      setMessage("Registro de personal eliminado.");
    }
  }

  async function createTask(eventSubmit: React.FormEvent) {
    eventSubmit.preventDefault();
    if (!eventId || !membership || !taskDraft.title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("exhibitor_portal_tasks").insert({
      event_id: eventId,
      company_id: membership.company_id,
      title: taskDraft.title.trim(),
      description: taskDraft.description.trim() || null,
      due_at: taskDraft.due_at ? new Date(taskDraft.due_at).toISOString() : null,
      created_by: userId,
    });
    if (error) setMessage(error.message);
    else {
      setTaskDraft({ title: "", description: "", due_at: "" });
      setMessage("Tarea pendiente agregada.");
      await load();
    }
    setBusy(false);
  }

  async function createActivity(eventSubmit: React.FormEvent) {
    eventSubmit.preventDefault();
    if (!eventId || !membership || !activityDraft.title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("exhibitor_portal_activities").insert({
      event_id: eventId,
      company_id: membership.company_id,
      title: activityDraft.title.trim(),
      details: activityDraft.details.trim() || null,
      activity_at: activityDraft.activity_at ? new Date(activityDraft.activity_at).toISOString() : new Date().toISOString(),
      created_by: userId,
    });
    if (error) setMessage(error.message);
    else {
      setActivityDraft({ title: "", details: "", activity_at: "" });
      setMessage("Actividad registrada.");
      await load();
    }
    setBusy(false);
  }

  async function deleteActivity(activity: Activity) {
    if (!window.confirm(`¿Eliminar la actividad “${activity.title}”?`)) return;
    const { error } = await supabase.from("exhibitor_portal_activities").delete().eq("id", activity.id);
    if (error) setMessage(error.message);
    else await load();
  }

  async function copyLink(url: string, successMessage: string) {
    await navigator.clipboard.writeText(url);
    setMessage(successMessage);
  }

  async function submitPayment(eventSubmit: React.FormEvent) {
    eventSubmit.preventDefault();
    const currentEvent = event;
    if (!eventId || !membership || !amount || !currentEvent) return;
    setBusy(true);
    setMessage(null);
    let receiptPath: string | null = null;
    if (receipt) {
      const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      receiptPath = `${currentEvent.organization_id}/${eventId}/portal/${membership.company_id}/${Date.now()}-${safeName}`;
      const upload = await supabase.storage
        .from("agenda-attachments")
        .upload(receiptPath, receipt, { upsert: false });
      if (upload.error) {
        setMessage(upload.error.message);
        setBusy(false);
        return;
      }
    }
    const { error } = await supabase
      .from("exhibitor_portal_payments")
      .insert({
        event_id: eventId,
        company_id: membership.company_id,
        amount: Number(amount),
        reference: reference.trim() || null,
        receipt_path: receiptPath,
        status: "pending",
      });
    if (error) setMessage(error.message);
    else {
      setAmount("");
      setReference("");
      setReceipt(null);
      await load();
    }
    setBusy(false);
  }

  async function download(path: string) {
    const { data, error } = await supabase.storage
      .from("agenda-attachments")
      .createSignedUrl(path, 300);
    if (error) setMessage(error.message);
    else if (data?.signedUrl)
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function profilePayload() {
    if (!eventId || !membership) return null;
    return {
      p_event_id: eventId,
      p_company_id: membership.company_id,
      p_logo_url: profile.logo_url,
      p_description: profile.description,
      p_category: profile.category,
      p_social_links: {
        website: profile.website,
        linkedin: profile.linkedin,
        instagram: profile.instagram,
      },
      p_contact_email: profile.contact_email,
      p_contact_phone: profile.contact_phone,
    };
  }

  async function saveProfileDraft() {
    const payload = profilePayload();
    if (!payload) return;
    setBusy(true);
    setMessage(null);
    setProfileError(null);
    const { error } = await supabase.rpc(
      "save_exhibitor_public_profile",
      payload,
    );
    if (error) setMessage(error.message);
    else {
      profileDraftState.clear();
      setProfileStatus("draft");
      setMessage("Borrador guardado. Puedes continuar completándolo después.");
    }
    setBusy(false);
  }

  async function submitProfile(eventSubmit: React.FormEvent) {
    eventSubmit.preventDefault();
    if (!eventId || !membership) return;
    if (!profile.description.trim() || !profile.category.trim()) {
      setProfileError("Completa la descripción y la categoría antes de enviar el perfil a revisión.");
      return;
    }
    if (!profile.contact_email.trim() && !profile.contact_phone.trim()) {
      setProfileError("Agrega al menos un correo o teléfono público antes de enviar el perfil.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setProfileError(null);
    const rpcName = platformPreview
      ? "admin_submit_exhibitor_public_profile"
      : "submit_exhibitor_public_profile";
    const { error } = await supabase.rpc(rpcName, profilePayload()!);
    if (error) setProfileError(error.message);
    else {
      profileDraftState.clear();
      setProfileStatus("pending");
      setMessage("Perfil guardado y enviado para aprobación del organizador.");
    }
    setBusy(false);
  }

  async function importPersonnel(rows: CsvRow[]) {
    if (!eventId || !membership)
      throw new Error("No se pudo identificar la empresa expositora.");
    const known = new Set(
      personnel.map((item) =>
        (item.identification || item.email || item.full_name)
          .trim()
          .toLocaleLowerCase("es"),
      ),
    );
    const pending = rows
      .filter((row) => {
        const key = (row.identification || row.email || row.full_name)
          .trim()
          .toLocaleLowerCase("es");
        if (!key || known.has(key)) return false;
        known.add(key);
        return true;
      })
      .map((row) => ({
        event_id: eventId,
        company_id: membership.company_id,
        full_name: row.full_name.trim(),
        identification: row.identification.trim(),
        email: row.email || null,
        phone: row.phone || null,
        role: row.role || null,
      }));
    const skipped = rows.length - pending.length;
    if (pending.length) {
      const result = await supabase.from("exhibitor_staff").insert(pending).select("id,full_name,identification,email,phone,role,status");
      if (result.error) throw new Error(result.error.message);
      const created = (result.data ?? []) as Personnel[];
      if (created.length !== pending.length) throw new Error("Supabase no confirmó todas las filas importadas.");
      setPersonnel((current) => [...current, ...created].sort((a, b) => a.full_name.localeCompare(b.full_name, "es")));
    }
    return { created: pending.length, skipped };
  }

  const config = event?.config ?? {};
  const branding =
    (config.branding as
      | { logo_url?: string; primary_color?: string }
      | undefined) ?? {};
  const manualPath =
    typeof config.exhibitor_manual_path === "string"
      ? config.exhibitor_manual_path
      : null;
  const total = useMemo(
    () => payments.reduce((sum, item) => sum + Number(item.amount), 0),
    [payments],
  );
  const pendingTasks = tasks.filter((task) => task.status !== "completed").length;
  const activePersonnel = personnel.filter((item) => item.status === "active").length;
  const portalUrl = `${window.location.origin}/portal/expositor/${eventId}`;
  const publicProfileUrl = publicElementId
    ? `${window.location.origin}/expo/${eventId}/plano?element=${publicElementId}`
    : null;
  if (!event || !membership)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-zinc-50 p-6">
        <div className="max-w-md rounded-2xl border bg-white p-6 text-center">
          <h1 className="text-xl font-bold">Portal del expositor</h1>
          <p className="mt-2 text-sm text-zinc-600">{message ?? "Cargando…"}</p>
        </div>
      </main>
    );

  return (
    <div
      className="min-h-[100dvh] bg-zinc-50"
      style={{
        ["--portal-primary" as string]: branding.primary_color ?? "#047857",
      }}
    >
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            {branding.logo_url && (
              <img
                src={branding.logo_url}
                alt=""
                className="h-9 w-9 rounded object-contain"
              />
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Portal del expositor
              </p>
              <h1 className="font-semibold">{event.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2"><Link to="/portal/expositor" className="rounded-lg border px-3 py-2 text-sm font-semibold">Mis eventos</Link><button type="button" onClick={() => { void signOut(); }} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><LogOut className="h-4 w-4" />Salir</button></div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="rounded-2xl bg-[var(--portal-primary)] p-6 text-white">
          <p className="text-sm opacity-80">Empresa</p>
          <h2 className="text-2xl font-bold">
            {membership.company?.name ?? "Expositor"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm opacity-90">
            {event.description ??
              "Consulta tus tareas, documentos, personal y pagos del evento."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyLink(portalUrl, "Enlace de acceso al portal copiado.")} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900"><Copy className="h-4 w-4" />Copiar acceso al portal</button>
            {publicProfileUrl ? <><a href={publicProfileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-3 py-2 text-sm font-semibold"><ExternalLink className="h-4 w-4" />Ver perfil público</a><button type="button" onClick={() => void copyLink(publicProfileUrl, "Enlace público de la empresa copiado.")} className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-3 py-2 text-sm font-semibold"><Copy className="h-4 w-4" />Copiar enlace público</button></> : <span className="rounded-lg bg-black/15 px-3 py-2 text-sm text-emerald-50">El enlace público aparecerá cuando el plano esté publicado y la empresa tenga un stand asignado.</span>}
          </div>
        </div>
        {message && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {message}
          </p>
        )}
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a href="#tareas" className="rounded-xl border bg-white p-4 active:scale-[0.99]"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pendientes</span><b className="mt-1 block text-2xl">{pendingTasks}</b><span className="text-xs text-emerald-700">Revisar tareas</span></a>
          <a href="#personal" className="rounded-xl border bg-white p-4 active:scale-[0.99]"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Personal activo</span><b className="mt-1 block text-2xl">{activePersonnel}</b><span className="text-xs text-emerald-700">Gestionar acreditados</span></a>
          <a href="#perfil-publico" className="rounded-xl border bg-white p-4 active:scale-[0.99]"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Perfil público</span><b className="mt-1 flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5" />{profileStatus === "approved" ? "Publicado" : profileStatus === "pending" ? "En revisión" : profileStatus === "rejected" ? "Cambios solicitados" : "Por completar"}</b><span className="text-xs text-emerald-700">Abrir configuración</span></a>
          <Link to={`/portal/expositor/${eventId}/visitantes${requestedCompanyId ? `?companyId=${encodeURIComponent(requestedCompanyId)}` : ""}`} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 active:scale-[0.99]"><span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Captación comercial</span><b className="mt-1 flex items-center gap-2 text-base"><ScanLine className="h-5 w-5" />Escanear visitantes</b><span className="text-xs text-emerald-700">Abrir cámara y listado</span></Link>
        </section>
        <nav aria-label="Secciones del portal" className="mt-4 flex gap-2 overflow-x-auto rounded-xl border bg-white p-2 text-sm font-semibold"><a href="#perfil-publico" className="whitespace-nowrap rounded-lg px-3 py-2 hover:bg-zinc-100">Perfil público</a><a href="#personal" className="whitespace-nowrap rounded-lg px-3 py-2 hover:bg-zinc-100">Personal</a><a href="#tareas" className="whitespace-nowrap rounded-lg px-3 py-2 hover:bg-zinc-100">Pendientes</a><a href="#actividades" className="whitespace-nowrap rounded-lg px-3 py-2 hover:bg-zinc-100">Actividades</a><a href="#pagos" className="whitespace-nowrap rounded-lg px-3 py-2 hover:bg-zinc-100">Pagos</a></nav>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section id="perfil-publico" className="scroll-mt-4 rounded-xl border bg-white p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-emerald-700" />
              <h2 className="font-semibold">Perfil público en el plano</h2>
              <span
                className={`ml-auto rounded-full px-2 py-1 text-xs font-semibold ${profileStatus === "approved" ? "bg-emerald-100 text-emerald-800" : profileStatus === "pending" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600"}`}
              >
                {profileStatus === "approved"
                  ? "Aprobado"
                  : profileStatus === "pending"
                    ? "En revisión"
                    : profileStatus === "rejected"
                      ? "Requiere cambios"
                      : "Borrador"}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Completa cómo debe aparecer tu empresa para visitantes y el
              organizador aprobará la publicación.
            </p>
            {profileStatus === "rejected" && membership?.company?.public_profile_review_notes && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-950">Cambios solicitados por el organizador</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">{membership.company.public_profile_review_notes}</p>
                <p className="mt-2 text-xs text-amber-800">Realiza los ajustes y vuelve a enviar el perfil para revisión.</p>
              </div>
            )}
            <form
              onSubmit={submitProfile}
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              <input
                value={profile.logo_url}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, logo_url: event.target.value }))
                }
                placeholder="URL del logo (PNG o SVG)"
                className="rounded-lg border p-2 text-sm"
              />
              <input
                value={profile.category}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, category: event.target.value }))
                }
                placeholder="Categoría o sector"
                className="rounded-lg border p-2 text-sm"
              />
              <textarea
                value={profile.description}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Descripción pública de la empresa"
                rows={3}
                className="rounded-lg border p-2 text-sm sm:col-span-2"
              />
              <input
                type="url"
                value={profile.website}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, website: event.target.value }))
                }
                placeholder="Sitio web"
                className="rounded-lg border p-2 text-sm"
              />
              <input
                value={profile.contact_email}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, contact_email: event.target.value }))
                }
                placeholder="Correo público"
                className="rounded-lg border p-2 text-sm"
              />
              <input
                value={profile.linkedin}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, linkedin: event.target.value }))
                }
                placeholder="LinkedIn"
                className="rounded-lg border p-2 text-sm"
              />
              <input
                value={profile.instagram}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, instagram: event.target.value }))
                }
                placeholder="Instagram"
                className="rounded-lg border p-2 text-sm"
              />
              <input
                value={profile.contact_phone}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, contact_phone: event.target.value }))
                }
                placeholder="Teléfono público"
                className="rounded-lg border p-2 text-sm"
              />
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveProfileDraft()}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                >
                  {busy ? "Guardando…" : "Guardar borrador"}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Enviando…" : "Enviar perfil a revisión"}
                </button>
                {profileDraftState.dirty && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      profileDraftState.discard(savedProfile);
                      setMessage(
                        "Borrador local descartado. Se restauraron los últimos datos guardados.",
                      );
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    Descartar cambios locales
                  </button>
                )}
              </div>
              {profileError && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800 sm:col-span-2">
                  No se envió a revisión: {profileError}
                </p>
              )}
            </form>
          </section>
          <section className="rounded-xl border bg-white p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-700" />
              <h2 className="font-semibold">Documentos</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Material entregado por el organizador.
            </p>
            {manualPath ? (
              <button
                type="button"
                onClick={() => {
                  void download(manualPath);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <Download className="h-4 w-4" />
                Descargar manual del expositor
              </button>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                El manual aún no está disponible.
              </p>
            )}
          </section>
          <section id="personal" className="scroll-mt-4 rounded-xl border bg-white p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-700" />
              <h2 className="font-semibold">Personal autorizado</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Carga la nómina que asistirá al evento. Los usuarios con acceso al
              portal se muestran por separado.
            </p>
            <form onSubmit={savePersonnel} className="mt-4 rounded-xl border bg-zinc-50 p-4">
              <h3 className="font-semibold">{editingPersonnelId ? "Editar persona" : "Agregar una persona"}</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <input required value={personnelDraft.full_name} onChange={(event) => setPersonnelDraft((current) => ({ ...current, full_name: event.target.value }))} placeholder="Nombre completo" className="rounded-lg border bg-white p-2 text-sm" />
                <input value={personnelDraft.identification ?? ""} onChange={(event) => setPersonnelDraft((current) => ({ ...current, identification: event.target.value }))} placeholder="Cédula o identificación" className="rounded-lg border bg-white p-2 text-sm" />
                <input type="email" value={personnelDraft.email ?? ""} onChange={(event) => setPersonnelDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Correo" className="rounded-lg border bg-white p-2 text-sm" />
                <input value={personnelDraft.phone ?? ""} onChange={(event) => setPersonnelDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Teléfono" className="rounded-lg border bg-white p-2 text-sm" />
                <input value={personnelDraft.role ?? ""} onChange={(event) => setPersonnelDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Cargo o función" className="rounded-lg border bg-white p-2 text-sm" />
                <div className="flex gap-2">
                  <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{editingPersonnelId ? "Guardar cambios" : "Agregar"}</button>
                  {editingPersonnelId && <button type="button" onClick={resetPersonnelDraft} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Cancelar</button>}
                </div>
              </div>
            </form>
            <div className="mt-4">
              <CsvImportPanel
                title="Importar personal expositor"
                description="Una fila por persona. Se omiten identificaciones, correos o nombres ya registrados."
                columns={personnelColumns}
                example={{
                  full_name: "María González",
                  identification: "V-12345678",
                  email: "maria@empresa.com",
                  phone: "+58 414 0000000",
                  role: "Representante comercial",
                }}
                templateName="plantilla-personal-expositor.csv"
                onImport={importPersonnel}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {personnel.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg bg-zinc-50 p-3 text-sm"
                >
                  <b>{item.full_name}</b>
                  <p className="text-xs text-zinc-500">
                    {item.identification ?? "Sin identificación"} ·{" "}
                    {item.role ?? "Sin cargo"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {item.email ?? "Sin correo"}
                    {item.phone ? ` · ${item.phone}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.status === "active" ? "Activo" : "Suspendido"}</span>
                    <button type="button" onClick={() => { setEditingPersonnelId(item.id); setPersonnelDraft({ full_name: item.full_name, identification: item.identification ?? "", email: item.email ?? "", phone: item.phone ?? "", role: item.role ?? "" }); }} className="text-xs font-semibold text-blue-700">Editar</button>
                    <button type="button" onClick={() => void togglePersonnel(item)} className="text-xs font-semibold text-amber-700">{item.status === "active" ? "Suspender" : "Reactivar"}</button>
                    <button type="button" onClick={() => void deletePersonnel(item)} className="text-xs font-semibold text-red-700">Eliminar</button>
                  </div>
                </div>
              ))}
              {!personnel.length && (
                <p className="text-sm text-zinc-500">
                  No hay personal cargado.
                </p>
              )}
            </div>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-semibold">
                Usuarios con acceso al portal ({staff.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {staff.map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between rounded-lg bg-zinc-50 p-3"
                  >
                    <span>
                      {item.user_id === user?.id ? "Tú" : "Miembro del equipo"}
                    </span>
                    <span className="text-zinc-500">
                      {item.status === "active" ? item.role : "Invitado"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <section id="tareas" className="scroll-mt-4 rounded-xl border bg-white p-5">
            <h2 className="font-semibold">Tareas del evento</h2>
            <p className="mt-1 text-sm text-zinc-600">Anota pendientes de montaje, materiales, reuniones o entregas.</p>
            <form onSubmit={createTask} className="mt-4 grid gap-2 rounded-xl bg-zinc-50 p-3">
              <input required value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} placeholder="¿Qué queda pendiente?" className="rounded-lg border bg-white p-2 text-sm" />
              <textarea value={taskDraft.description} onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Notas o instrucciones (opcional)" rows={2} className="rounded-lg border bg-white p-2 text-sm" />
              <div className="flex flex-wrap items-center gap-2">
                <input type="datetime-local" value={taskDraft.due_at} onChange={(event) => setTaskDraft((current) => ({ ...current, due_at: event.target.value }))} className="rounded-lg border bg-white p-2 text-sm" />
                <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Agregar pendiente</button>
              </div>
            </form>
            <div className="mt-4 space-y-3">
              {tasks.length ? (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-xs text-zinc-600">
                        {task.description ?? "Sin instrucciones adicionales"}
                        {task.due_at
                          ? ` · vence ${new Date(task.due_at).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    {task.status === "completed" ? (
                      <span className="text-xs font-semibold text-emerald-700">
                        Completada
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          void completeTask(task);
                        }}
                        className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Marcar lista
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">
                  No tienes tareas pendientes.
                </p>
              )}
            </div>
          </section>
          <section id="actividades" className="scroll-mt-4 rounded-xl border bg-white p-5">
            <h2 className="font-semibold">Bitácora de actividades</h2>
            <p className="mt-1 text-sm text-zinc-600">Registra reuniones, avances, visitas o acciones realizadas por tu equipo.</p>
            <form onSubmit={createActivity} className="mt-4 grid gap-2 rounded-xl bg-zinc-50 p-3">
              <input required value={activityDraft.title} onChange={(event) => setActivityDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Actividad realizada" className="rounded-lg border bg-white p-2 text-sm" />
              <textarea value={activityDraft.details} onChange={(event) => setActivityDraft((current) => ({ ...current, details: event.target.value }))} placeholder="Descripción o resultado (opcional)" rows={2} className="rounded-lg border bg-white p-2 text-sm" />
              <div className="flex flex-wrap items-center gap-2">
                <input type="datetime-local" value={activityDraft.activity_at} onChange={(event) => setActivityDraft((current) => ({ ...current, activity_at: event.target.value }))} className="rounded-lg border bg-white p-2 text-sm" />
                <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar actividad</button>
              </div>
            </form>
            <div className="mt-4 space-y-2">
              {activities.map((activity) => <div key={activity.id} className="rounded-lg border p-3 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{activity.title}</p><p className="text-xs text-zinc-500">{new Date(activity.activity_at).toLocaleString()}</p>{activity.details && <p className="mt-1 text-xs text-zinc-600">{activity.details}</p>}</div><button type="button" onClick={() => void deleteActivity(activity)} className="text-xs font-semibold text-red-700">Eliminar</button></div></div>)}
              {!activities.length && <p className="text-sm text-zinc-500">Todavía no hay actividades registradas.</p>}
            </div>
          </section>
          <section id="pagos" className="scroll-mt-4 rounded-xl border bg-white p-5">
            <h2 className="font-semibold">Pagos y comprobantes</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Total reportado: {total.toFixed(2)} USD
            </p>
            <form onSubmit={submitPayment} className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Monto"
                  className="rounded-lg border p-2 text-sm"
                />
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Referencia bancaria"
                  className="rounded-lg border p-2 text-sm"
                />
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm">
                <Upload className="h-4 w-4" />
                {receipt ? receipt.name : "Adjuntar comprobante PDF o imagen"}
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(event) =>
                    setReceipt(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              <button
                disabled={busy}
                className="w-fit rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Enviando…" : "Registrar pago"}
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex justify-between rounded-lg bg-zinc-50 p-3 text-sm"
                >
                  <span>
                    {payment.amount} {payment.currency} · {payment.payment_date}
                  </span>
                  <span className="text-zinc-500">{payment.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
