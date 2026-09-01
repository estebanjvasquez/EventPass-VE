import { useEffect, useState } from "react";
import { Building2, CalendarDays, LogOut, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

type PortalMembership = {
  id: string;
  event_id: string;
  company_id: string;
  role: string;
  company: { name: string; public_profile_status: string | null } | null;
  event: { name: string; status: string; starts_at: string | null; ends_at: string | null } | null;
};

export default function PortalExpositorInicio() {
  const { user, signOut } = useAuth();
  const [memberships, setMemberships] = useState<PortalMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from("exhibitor_portal_members")
      .select("id,event_id,company_id,role,company:companies(name,public_profile_status),event:events(name,status,starts_at,ends_at)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .then(({ data, error }) => {
        if (error) setMessage(error.message);
        setMemberships((data ?? []) as unknown as PortalMembership[]);
        setLoading(false);
      });
  }, [user?.id]);

  const pendingProfiles = memberships.filter((item) => item.company?.public_profile_status !== "approved").length;

  return (
    <main className="min-h-[100dvh] bg-zinc-50 text-zinc-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Store className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">EventPass</p><h1 className="font-bold">Portal de empresas expositoras</h1></div></div>
          <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><LogOut className="h-4 w-4" />Salir</button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8">
        <section className="grid gap-5 rounded-2xl bg-emerald-900 p-6 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div><p className="text-sm text-emerald-200">Área de trabajo</p><h2 className="mt-1 text-3xl font-bold tracking-tight">Tus eventos en un solo lugar</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-100">Gestiona el perfil público, personal autorizado, pendientes, actividades y pagos de cada participación.</p></div>
          <div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-white/10 px-4 py-3"><b className="block text-2xl">{memberships.length}</b><span className="text-xs text-emerald-100">Eventos</span></div><div className="rounded-xl bg-white/10 px-4 py-3"><b className="block text-2xl">{pendingProfiles}</b><span className="text-xs text-emerald-100">Perfiles pendientes</span></div></div>
        </section>
        <section className="mt-7">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Participaciones</p><h2 className="mt-1 text-xl font-bold">Selecciona un evento</h2></div></div>
          {loading ? <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="h-40 animate-pulse rounded-2xl bg-zinc-200" /><div className="h-40 animate-pulse rounded-2xl bg-zinc-200" /></div> : memberships.length ? <div className="mt-4 grid gap-4 md:grid-cols-2">{memberships.map((item) => <article key={item.id} className="rounded-2xl border bg-white p-5"><div className="flex items-start justify-between gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100"><Building2 className="h-5 w-5 text-zinc-700" /></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.company?.public_profile_status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.company?.public_profile_status === "approved" ? "Perfil publicado" : "Perfil por completar"}</span></div><h3 className="mt-4 text-lg font-bold">{item.event?.name ?? "Evento"}</h3><p className="mt-1 text-sm text-zinc-600">{item.company?.name ?? "Empresa expositora"}</p><p className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><CalendarDays className="h-4 w-4" />{item.event?.starts_at ? new Date(item.event.starts_at).toLocaleDateString("es-VE", { dateStyle: "long" }) : "Fecha por confirmar"}</p><Link to={`/portal/expositor/${item.event_id}`} className="mt-5 inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white active:scale-[0.98]">Abrir área de trabajo</Link></article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed bg-white p-8 text-center"><Building2 className="mx-auto h-8 w-8 text-zinc-400" /><h3 className="mt-3 font-semibold">No tienes eventos asignados</h3><p className="mt-1 text-sm text-zinc-500">Solicita al organizador que active tu acceso como empresa expositora.</p></div>}
          {message && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
        </section>
      </div>
    </main>
  );
}
