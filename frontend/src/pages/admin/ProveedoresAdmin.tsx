import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { resolveActiveOrg } from "../../lib/activeOrg";
import CsvImportPanel from "../../components/CsvImportPanel";
import type { CsvColumn, CsvRow } from "../../lib/csvImport";

type Provider = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  legal_name: string | null;
  tax_id: string | null;
  fiscal_address: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  payment_terms: string | null;
  status: string;
};
type Service = {
  id: string;
  provider_id: string;
  service_name: string;
  description: string | null;
  base_price: number | null;
  currency: string;
};
type Event = { id: string; name: string };
type Contact = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: "active" | "inactive";
};
type Staff = {
  id: string;
  full_name: string;
  identification?: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string;
  source: "provider" | "event";
  event_id?: string;
};
const categories = [
  "Catering",
  "Audiovisual",
  "Seguridad",
  "Mobiliario",
  "Transporte",
  "Impresión",
  "Decoración",
  "Personal",
  "Tecnología",
  "Otro",
];
const field = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const providerColumns: CsvColumn[] = [
  {
    key: "name",
    label: "Nombre comercial",
    required: true,
    aliases: ["nombre", "proveedor"],
  },
  { key: "legal_name", label: "Razón social", aliases: ["razon_social"] },
  { key: "tax_id", label: "RIF", aliases: ["identificacion_fiscal"] },
  { key: "category", label: "Categoría", aliases: ["categoria"] },
  { key: "contact_name", label: "Contacto", aliases: ["contacto_nombre"] },
  {
    key: "contact_email",
    label: "Correo",
    aliases: ["email", "contacto_correo"],
  },
  {
    key: "contact_phone",
    label: "Teléfono",
    aliases: ["telefono", "contacto_telefono"],
  },
];
const staffColumns: CsvColumn[] = [
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

export default function ProveedoresAdmin() {
  const [orgId, setOrgId] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [name, setName] = useState("");
  const [newCategory, setNewCategory] = useState("Catering");
  const [contact, setContact] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null,
  );
  const [draft, setDraft] = useState<Partial<Provider>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [serviceName, setServiceName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffIdentification, setStaffIdentification] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [staffEditing, setStaffEditing] = useState<Staff | null>(null);
  const [eventId, setEventId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const membership = await resolveActiveOrg();
    if (!membership) return;
    setOrgId(membership.organization_id);
    const [p, s, e] = await Promise.all([
      supabase
        .from("providers")
        .select(
          "id,name,category,description,contact_name,contact_email,contact_phone,website,legal_name,tax_id,fiscal_address,billing_email,billing_phone,payment_terms,status",
        )
        .eq("organization_id", membership.organization_id)
        .order("name"),
      supabase
        .from("provider_services")
        .select("id,provider_id,service_name,description,base_price,currency")
        .order("service_name"),
      supabase
        .from("events")
        .select("id,name")
        .eq("organization_id", membership.organization_id)
        .neq("status", "archived")
        .order("start_date", { ascending: false }),
    ]);
    setProviders((p.data ?? []) as Provider[]);
    setServices((s.data ?? []) as Service[]);
    setEvents((e.data ?? []) as Event[]);
    if (p.error || s.error || e.error)
      setMessage(
        p.error?.message ?? s.error?.message ?? e.error?.message ?? null,
      );
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const loadPeople = useCallback(async (id: string) => {
    const [c, own, eventPeople] = await Promise.all([
      supabase
        .from("provider_contacts")
        .select("id,full_name,email,phone,role,status")
        .eq("provider_id", id)
        .order("full_name"),
      supabase
        .from("provider_staff")
        .select("id,full_name,identification,email,phone,role,status")
        .eq("provider_id", id)
        .order("full_name"),
      supabase
        .from("event_personnel")
        .select("id,full_name,email,phone,role,status,event_id")
        .eq("provider_id", id)
        .order("full_name"),
    ]);
    setContacts((c.data ?? []) as Contact[]);
    setStaff([
      ...((own.data ?? []) as Staff[]).map((p) => ({
        ...p,
        source: "provider" as const,
      })),
      ...((eventPeople.data ?? []) as Staff[]).map((p) => ({
        ...p,
        source: "event" as const,
      })),
    ]);
    if (c.error || own.error || eventPeople.error)
      setMessage(
        c.error?.message ??
          own.error?.message ??
          eventPeople.error?.message ??
          null,
      );
  }, []);
  function openProvider(provider: Provider) {
    setSelectedProvider(provider);
    setDraft(provider);
    setStaffEditing(null);
    void loadPeople(provider.id);
  }
  function closeProvider() {
    setSelectedProvider(null);
    setDraft({});
    setContacts([]);
    setStaff([]);
    setStaffEditing(null);
  }
  async function createProvider(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !name.trim()) return;
    const result = await supabase.from("providers").insert({
      organization_id: orgId,
      name: name.trim(),
      category: newCategory,
      contact_name: contact.trim() || null,
    });
    if (result.error) setMessage(result.error.message);
    else {
      setMessage("Proveedor creado.");
      setName("");
      setContact("");
      await load();
    }
  }
  async function saveProvider(e: FormEvent) {
    e.preventDefault();
    if (!selectedProvider || !draft.name?.trim() || !draft.category) return;
    const result = await supabase
      .from("providers")
      .update({
        name: draft.name.trim(),
        category: draft.category,
        description: draft.description?.trim() || null,
        contact_name: draft.contact_name?.trim() || null,
        contact_email: draft.contact_email?.trim() || null,
        contact_phone: draft.contact_phone?.trim() || null,
        legal_name: draft.legal_name?.trim() || null,
        tax_id: draft.tax_id?.trim() || null,
        fiscal_address: draft.fiscal_address?.trim() || null,
        billing_email: draft.billing_email?.trim() || null,
        billing_phone: draft.billing_phone?.trim() || null,
        payment_terms: draft.payment_terms?.trim() || null,
        website: draft.website?.trim() || null,
      })
      .eq("id", selectedProvider.id);
    if (result.error) setMessage(result.error.message);
    else {
      setMessage("Proveedor actualizado.");
      closeProvider();
      await load();
    }
  }
  async function addService(e: FormEvent) {
    e.preventDefault();
    if (!selectedProvider || !serviceName.trim()) return;
    const result = await supabase.from("provider_services").insert({
      provider_id: selectedProvider.id,
      service_name: serviceName.trim(),
    });
    if (result.error) setMessage(result.error.message);
    else {
      setServiceName("");
      setMessage("Servicio añadido.");
      await load();
    }
  }
  async function addContact(e: FormEvent) {
    e.preventDefault();
    if (!selectedProvider || !contactName.trim()) return;
    const result = await supabase.from("provider_contacts").insert({
      provider_id: selectedProvider.id,
      full_name: contactName.trim(),
      email: contactEmail.trim() || null,
      phone: contactPhone.trim() || null,
      role: contactRole.trim() || null,
    });
    if (result.error) setMessage(result.error.message);
    else {
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setContactRole("");
      await loadPeople(selectedProvider.id);
    }
  }
  function editStaff(person: Staff) {
    setStaffEditing(person);
    setStaffName(person.full_name);
    setStaffIdentification(person.identification ?? "");
    setStaffEmail(person.email ?? "");
    setStaffPhone(person.phone ?? "");
    setStaffRole(person.role ?? "");
  }
  async function saveStaff(e: FormEvent) {
    e.preventDefault();
    if (!selectedProvider || !staffName.trim()) return;
    const values = {
      full_name: staffName.trim(),
      email: staffEmail.trim() || null,
      phone: staffPhone.trim() || null,
      role: staffRole.trim() || null,
    };
    const providerValues = {
      ...values,
      identification: staffIdentification.trim() || null,
    };
    const result = staffEditing
      ? await supabase
          .from(
            staffEditing.source === "event"
              ? "event_personnel"
              : "provider_staff",
          )
          .update(staffEditing.source === "event" ? values : providerValues)
          .eq("id", staffEditing.id)
      : await supabase
          .from("provider_staff")
          .insert({ provider_id: selectedProvider.id, ...providerValues });
    if (result.error) setMessage(result.error.message);
    else {
      setMessage(staffEditing ? "Personal actualizado." : "Personal añadido.");
      setStaffEditing(null);
      setStaffName("");
      setStaffIdentification("");
      setStaffEmail("");
      setStaffPhone("");
      setStaffRole("");
      await loadPeople(selectedProvider.id);
    }
  }
  async function removeStaff(person: Staff) {
    if (!window.confirm("¿Eliminar a " + person.full_name + "?")) return;
    const result = await supabase
      .from(person.source === "event" ? "event_personnel" : "provider_staff")
      .delete()
      .eq("id", person.id);
    if (result.error) setMessage(result.error.message);
    else await loadPeople(selectedProvider!.id);
  }
  async function toggleStaff(person: Staff) {
    const result = await supabase
      .from(person.source === "event" ? "event_personnel" : "provider_staff")
      .update({ status: person.status === "active" ? "inactive" : "active" })
      .eq("id", person.id);
    if (result.error) setMessage(result.error.message);
    else await loadPeople(selectedProvider!.id);
  }
  async function notify(type: "quote" | "payment") {
    if (!selectedProvider || !eventId) return;
    setBusy(true);
    const session = await supabase.auth.getSession();
    const api = (
      (import.meta.env.VITE_API_URL as string | undefined) ?? ""
    ).replace(/\/$/, "");
    const result = await fetch(api + "/api/providers/notify", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + (session.data.session?.access_token ?? ""),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider_id: selectedProvider.id,
        event_id: eventId,
        type,
        service_id: serviceId || null,
        notes:
          type === "quote"
            ? "Por favor envía tu propuesta y condiciones."
            : "Revisa las condiciones de pago acordadas.",
      }),
    });
    const body = (await result.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setMessage(
      result.ok
        ? type === "quote"
          ? "Solicitud de cotización enviada."
          : "Notificación de pago enviada."
        : (body.error ?? "No se pudo enviar la notificación."),
    );
  }
  async function importProviders(rows: CsvRow[]) {
    if (!orgId) throw new Error("No se pudo identificar la organización.");
    const known = new Set(
      providers.map((item) => item.name.trim().toLocaleLowerCase("es")),
    );
    const pending = rows
      .filter((row) => {
        const key = row.name.trim().toLocaleLowerCase("es");
        if (!key || known.has(key)) return false;
        known.add(key);
        return true;
      })
      .map((row) => ({
        organization_id: orgId,
        name: row.name.trim(),
        legal_name: row.legal_name || null,
        tax_id: row.tax_id || null,
        category: categories.includes(row.category) ? row.category : "Otro",
        contact_name: row.contact_name || null,
        contact_email: row.contact_email || null,
        contact_phone: row.contact_phone || null,
      }));
    const skipped = rows.length - pending.length;
    if (pending.length) {
      const result = await supabase.from("providers").insert(pending);
      if (result.error) throw new Error(result.error.message);
      await load();
    }
    return { created: pending.length, skipped };
  }
  async function importStaff(rows: CsvRow[]) {
    if (!selectedProvider) throw new Error("Selecciona un proveedor.");
    const known = new Set(
      staff
        .filter((item) => item.source === "provider")
        .map((item) =>
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
        provider_id: selectedProvider.id,
        full_name: row.full_name.trim(),
        identification: row.identification.trim(),
        email: row.email || null,
        phone: row.phone || null,
        role: row.role || null,
      }));
    const skipped = rows.length - pending.length;
    if (pending.length) {
      const result = await supabase.from("provider_staff").insert(pending);
      if (result.error) throw new Error(result.error.message);
      await loadPeople(selectedProvider.id);
    }
    return { created: pending.length, skipped };
  }
  const visible = providers.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      (p.name + " " + p.category + " " + (p.tax_id ?? ""))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const providerServices = services.filter(
    (service) => service.provider_id === selectedProvider?.id,
  );

  if (selectedProvider)
    return (
      <div className="min-h-[100dvh] bg-zinc-50">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
            <button
              type="button"
              onClick={closeProvider}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Directorio de proveedores
            </button>
            <BriefcaseBusiness className="h-5 w-5 text-emerald-700" />
            <span className="font-semibold">Ficha del proveedor</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-500">Proveedor seleccionado</p>
              <h1 className="text-2xl font-bold">{selectedProvider.name}</h1>
            </div>
            <button
              type="button"
              onClick={closeProvider}
              className="rounded-lg border px-3 py-2 text-sm font-semibold"
            >
              Cerrar edición
            </button>
          </div>
          {message && (
            <p
              role="status"
              className="mt-4 rounded-xl bg-zinc-100 p-3 text-sm"
            >
              {message}
            </p>
          )}
          <form
            onSubmit={saveProvider}
            className="mt-6 rounded-2xl border bg-white p-5"
          >
            <h2 className="font-semibold">Datos del proveedor</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                ["name", "Nombre comercial"],
                ["legal_name", "Razón social"],
                ["tax_id", "RIF / identificación fiscal"],
                ["contact_name", "Contacto principal"],
                ["contact_email", "Correo principal"],
                ["contact_phone", "Teléfono principal"],
                ["billing_email", "Correo de facturación"],
                ["billing_phone", "Teléfono de facturación"],
                ["payment_terms", "Condiciones de pago"],
                ["website", "Sitio web"],
              ].map(([key, placeholder]) => (
                <input
                  key={key}
                  className={field}
                  value={(draft[key as keyof Provider] as string | null) ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                  placeholder={placeholder}
                />
              ))}
              <select
                className={field}
                value={draft.category ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                <option value="">Categoría</option>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <textarea
                className={field + " md:col-span-3"}
                value={draft.fiscal_address ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, fiscal_address: e.target.value })
                }
                placeholder="Dirección fiscal"
              />
            </div>
            <button className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
              Guardar proveedor
            </button>
          </form>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">Servicios ofrecidos</h2>
              <form onSubmit={addService} className="mt-3 flex gap-2">
                <input
                  className={field + " min-w-0 flex-1"}
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="Ej.: Coffee break para 100 personas"
                />
                <button className="rounded-lg border px-3 py-2">
                  <Plus className="h-4 w-4" />
                </button>
              </form>
              <ul className="mt-3 space-y-1 text-sm text-zinc-600">
                {providerServices.map((service) => (
                  <li key={service.id}>· {service.service_name}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">Cotizaciones y pagos</h2>
              <div className="mt-3 grid gap-2">
                <select
                  className={field}
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  <option value="">Evento</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
                <select
                  className={field}
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                >
                  <option value="">Servicio</option>
                  {providerServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.service_name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={busy || !eventId}
                onClick={() => void notify("quote")}
                className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Mail className="mr-2 inline h-4 w-4" />
                Invitar a cotizar
              </button>
              <button
                type="button"
                disabled={busy || !eventId}
                onClick={() => void notify("payment")}
                className="ml-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Notificar pago
              </button>
            </section>
          </div>
          <section className="mt-6 rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-semibold">Personal asignado</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Incluye personal creado aquí y desde Equipo operativo.
                </p>
              </div>
            </div>
            <form
              onSubmit={saveStaff}
              className="mt-4 grid gap-2 md:grid-cols-4"
            >
              <input
                required
                className={field}
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Nombre completo"
              />
              <input
                className={field}
                value={staffIdentification}
                onChange={(e) => setStaffIdentification(e.target.value)}
                placeholder="Identificación"
              />
              <input
                className={field}
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="Correo"
              />
              <input
                className={field}
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                placeholder="Teléfono"
              />
              <input
                className={field}
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                placeholder="Cargo o función"
              />
              <button className="inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
                <UserPlus className="h-4 w-4" />
                {staffEditing ? "Guardar cambios" : "Añadir personal"}
              </button>
              {staffEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setStaffEditing(null);
                    setStaffName("");
                    setStaffIdentification("");
                    setStaffEmail("");
                    setStaffPhone("");
                    setStaffRole("");
                  }}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  Cancelar
                </button>
              )}
            </form>
            <div className="mt-5">
              <CsvImportPanel
                title="Importar personal del proveedor"
                description="Carga la nómina básica. Se omiten identificaciones, correos o nombres ya registrados."
                columns={staffColumns}
                example={{
                  full_name: "María González",
                  identification: "V-12345678",
                  email: "maria@proveedor.com",
                  phone: "+58 414 0000000",
                  role: "Técnico de montaje",
                }}
                templateName="plantilla-personal-proveedor.csv"
                onImport={importStaff}
              />
            </div>
            <div className="mt-5 space-y-2">
              {staff.map((person) => (
                <div
                  key={person.source + person.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 text-sm"
                >
                  <div>
                    <strong>{person.full_name}</strong>
                    <span className="ml-2 text-zinc-600">
                      {person.role ?? "Sin cargo"}
                    </span>
                    <div className="text-xs text-zinc-500">
                      {person.identification
                        ? person.identification + " · "
                        : ""}
                      {person.email ?? "Sin correo"}
                      {person.phone ? " · " + person.phone : ""} ·{" "}
                      {person.source === "event"
                        ? "Equipo operativo"
                        : "Proveedor"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleStaff(person)}
                      className="rounded-full bg-white px-2 py-1 text-xs font-semibold"
                    >
                      {person.status === "active" ? "Activo" : "Inactivo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => editStaff(person)}
                      title="Editar"
                      className="rounded-lg border p-2"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeStaff(person)}
                      title="Eliminar"
                      className="rounded-lg border p-2 text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {!staff.length && (
                <p className="text-sm text-zinc-500">
                  No hay personal asignado a este proveedor.
                </p>
              )}
            </div>
          </section>
          <section className="mt-6 rounded-2xl border bg-white p-5">
            <h2 className="font-semibold">Contactos adicionales</h2>
            <form
              onSubmit={addContact}
              className="mt-3 grid gap-2 md:grid-cols-4"
            >
              <input
                required
                className={field}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nombre"
              />
              <input
                className={field}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Correo"
              />
              <input
                className={field}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Teléfono"
              />
              <input
                className={field}
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                placeholder="Cargo"
              />
              <button className="inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
                <UserPlus className="h-4 w-4" />
                Añadir contacto
              </button>
            </form>
            <ul className="mt-4 space-y-1 text-sm">
              {contacts.map((item) => (
                <li key={item.id}>
                  {item.full_name} · {item.role ?? "Contacto"} ·{" "}
                  {item.email ?? "sin correo"}
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    );

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
          <Link to="/admin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <BriefcaseBusiness className="h-5 w-5 text-emerald-700" />
          <span className="font-semibold">Proveedores</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-2xl font-bold">Directorio de proveedores</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Selecciona un proveedor para abrir su ficha de edición y administrar
          personal.
        </p>
        {message && (
          <p role="status" className="mt-4 rounded-xl bg-zinc-100 p-3 text-sm">
            {message}
          </p>
        )}
        <div className="mt-6">
          <CsvImportPanel
            title="Importar proveedores"
            description="Carga proveedores con sus datos comerciales básicos. Los nombres ya existentes se omiten."
            columns={providerColumns}
            example={{
              name: "Servicios Ejemplo",
              legal_name: "Servicios Ejemplo, C.A.",
              tax_id: "J-12345678-9",
              category: "Audiovisual",
              contact_name: "Carlos Pérez",
              contact_email: "carlos@ejemplo.com",
              contact_phone: "+58 412 0000000",
            }}
            templateName="plantilla-proveedores.csv"
            onImport={importProviders}
          />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
          <form
            onSubmit={createProvider}
            className="rounded-2xl border bg-white p-5"
          >
            <h2 className="font-semibold">Nuevo proveedor</h2>
            <div className="mt-4 grid gap-3">
              <input
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre comercial"
              />
              <select
                className={field}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <input
                className={field}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Contacto principal"
              />
            </div>
            <button
              disabled={!name.trim()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Crear proveedor
            </button>
          </form>
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  className={field + " pl-9"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar proveedor o RIF"
                />
              </div>
              <select
                className={field}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">Todas las categorías</option>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {visible.map((provider) => (
                <article key={provider.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{provider.name}</h3>
                      <p className="text-xs font-medium text-emerald-700">
                        {provider.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openProvider(provider)}
                      className="rounded border p-2"
                      title="Abrir ficha de edición"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  {provider.contact_name && (
                    <p className="mt-2 text-sm text-zinc-600">
                      {provider.contact_name}
                    </p>
                  )}
                  {provider.tax_id && (
                    <p className="text-xs text-zinc-500">
                      RIF: {provider.tax_id}
                    </p>
                  )}
                </article>
              ))}
              {!visible.length && (
                <p className="text-sm text-zinc-500">
                  No hay proveedores que coincidan.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
