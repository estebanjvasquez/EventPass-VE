import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCog,
  ChevronRight,
  ClipboardList,
  Handshake,
  IdCard,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import ImpersonationBanner from "../../components/ImpersonationBanner";
import { resolveActiveOrg } from "../../lib/activeOrg";
import { supabase } from "../../lib/supabase";

type EventSummary = {
  id: string;
  name: string;
  event_type: string;
  status: string;
  start_date: string | null;
};

type DashboardMetrics = {
  events: number;
  publishedEvents: number;
  registrations: number;
  companies: number;
};

const modules = [
  { title: "Eventos", description: "Crea exposiciones y foros, configura fechas y publica cada evento.", to: "/admin/eventos", icon: CalendarCog, featured: true },
  { title: "Registros", description: "Consulta participantes, pagos, estados y asignaciones.", to: "/admin/registros", icon: ClipboardList, featured: true },
  { title: "Acreditación", description: "Busca participantes, configura credenciales e imprime en el mostrador.", to: "/admin/acreditacion", icon: IdCard, featured: true },
  { title: "Check-in", description: "Controla accesos y valida credenciales durante el evento.", to: "/admin/checkin", icon: ScanLine, featured: true },
  { title: "Equipo operativo", description: "Administra responsables, proveedores y permisos de trabajo.", to: "/admin/equipo-operativo", icon: Users },
  { title: "Proveedores", description: "Directorio de empresas y personal contratado para la operación.", to: "/admin/proveedores", icon: BriefcaseBusiness },
  { title: "Patrocinantes", description: "Gestiona acuerdos, entregables, pagos y activaciones.", to: "/admin/patrocinantes", icon: Handshake },
  { title: "Programas", description: "Organiza programas, invitados y registros vinculados.", to: "/admin/programas", icon: Ticket },
  { title: "Suscripción", description: "Revisa el plan, límites y estado de la cuenta de la organización.", to: "/admin/suscripcion", icon: ShieldCheck },
];

const eventTypeLabel: Record<string, string> = { exhibition: "Exposición", forum: "Foro", general: "Evento" };

export default function OrganizadorDashboard() {
  const [orgName, setOrgName] = useState("Organización");
  const [role, setRole] = useState("");
  const [metrics, setMetrics] = useState<DashboardMetrics>({ events: 0, publishedEvents: 0, registrations: 0, companies: 0 });
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const active = await resolveActiveOrg();
    if (!active) {
      setError("No se encontró una organización activa para este usuario.");
      setLoading(false);
      return;
    }
    setOrgName(active.organizations?.name ?? "Organización");
    setRole(active.role);
    const [eventsResult, registrationsResult, companiesResult] = await Promise.all([
      supabase.from("events").select("id,name,event_type,status,start_date").eq("organization_id", active.organization_id).order("start_date", { ascending: false, nullsFirst: false }),
      supabase.from("registrations").select("id", { count: "exact", head: true }).eq("organization_id", active.organization_id),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("organization_id", active.organization_id),
    ]);
    if (eventsResult.error || registrationsResult.error || companiesResult.error) {
      setError(eventsResult.error?.message ?? registrationsResult.error?.message ?? companiesResult.error?.message ?? "No se pudo cargar el dashboard.");
    }
    const eventRows = (eventsResult.data ?? []) as EventSummary[];
    setEvents(eventRows.slice(0, 4));
    setMetrics({ events: eventRows.length, publishedEvents: eventRows.filter((item) => item.status === "published").length, registrations: registrationsResult.count ?? 0, companies: companiesResult.count ?? 0 });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-[100dvh] bg-zinc-50 text-zinc-950">
      <ImpersonationBanner />
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Panel de la organización</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{orgName}</h1><p className="mt-1 text-sm text-zinc-600">Gestiona la operación completa de tus eventos desde un solo lugar.</p></div><span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600">Rol: {role || "miembro"}</span></div></div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Eventos", value: metrics.events, icon: CalendarCog },
            { label: "Publicados", value: metrics.publishedEvents, icon: Sparkles },
            { label: "Registros", value: metrics.registrations, icon: ClipboardList },
            { label: "Empresas", value: metrics.companies, icon: BriefcaseBusiness },
          ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm font-medium text-zinc-500">{label}</span><Icon className="h-5 w-5 text-emerald-700" /></div><b className="mt-3 block text-3xl tracking-tight">{loading ? "—" : String(value)}</b></div>)}
        </section>

        <section className="mt-9">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Áreas de trabajo</p><h2 className="mt-1 text-xl font-bold">¿Qué necesitas gestionar?</h2></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => { const Icon = module.icon; return <Link key={module.to} to={module.to} className={`group flex min-h-44 flex-col rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm active:scale-[0.99] ${module.featured ? "bg-white" : "bg-zinc-100/70"}`}><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Icon className="h-5 w-5" /></span><ChevronRight className="h-5 w-5 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-700" /></div><h3 className="mt-4 font-bold">{module.title}</h3><p className="mt-1 text-sm leading-5 text-zinc-600">{module.description}</p></Link> })}
          </div>
        </section>

        <section className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
          <div className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Actividad próxima</p><h2 className="mt-1 font-bold">Eventos recientes</h2></div><Link to="/admin/eventos" className="text-sm font-semibold text-emerald-700">Ver todos</Link></div><div className="mt-4 divide-y">{events.map((event) => <Link key={event.id} to={`/admin/eventos/${event.id}/administrar`} className="flex items-center justify-between gap-4 py-3 first:pt-0"><div><b className="text-sm">{event.name}</b><p className="mt-1 text-xs text-zinc-500">{eventTypeLabel[event.event_type] ?? "Evento"} · {event.start_date ? new Date(event.start_date).toLocaleDateString("es-VE", { dateStyle: "medium" }) : "Fecha por definir"}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${event.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{event.status === "published" ? "Publicado" : event.status === "closed" ? "Cerrado" : "Borrador"}</span></Link>)}{!loading && !events.length && <div className="py-8 text-center"><CalendarCog className="mx-auto h-7 w-7 text-zinc-300" /><p className="mt-2 text-sm text-zinc-500">Todavía no hay eventos.</p><Link to="/admin/eventos" className="mt-3 inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Crear el primero</Link></div>}</div></div>
          <div className="rounded-2xl bg-emerald-900 p-5 text-white"><BarChart3 className="h-6 w-6 text-emerald-300" /><h2 className="mt-4 text-lg font-bold">Centro de crecimiento</h2><p className="mt-2 text-sm leading-6 text-emerald-100">Este inicio queda preparado para incorporar reportes, ventas de stands, alertas y automatizaciones sin saturar la navegación principal.</p><Link to="/admin/eventos" className="mt-5 inline-flex rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900">Administrar eventos</Link></div>
        </section>
      </main>
    </div>
  );
}
