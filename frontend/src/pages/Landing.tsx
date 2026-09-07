import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  Map,
  QrCode,
  ScanLine,
  Ticket,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useTenant } from "../lib/useTenant";
import { brandColor, brandName, type Tenant } from "../lib/tenantCore";

const capabilities = [
  {
    title: "Registros y pagos locales",
    body: "Inscripciones, comprobantes y credenciales QR en un solo recorrido.",
    icon: ClipboardCheck,
  },
  {
    title: "Operación en el recinto",
    body: "Check-in, impresión, equipo operativo y control de acceso desde cualquier dispositivo.",
    icon: ScanLine,
  },
  {
    title: "Foros y programación",
    body: "Agenda pública, escenarios, ponentes, moderadores y patrocinantes conectados.",
    icon: CalendarDays,
  },
  {
    title: "Exposiciones que se pueden recorrer",
    body: "Planos interactivos, stands, perfiles de expositores y navegación pública.",
    icon: Map,
  },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`grid place-items-center rounded-[14px] bg-emerald-400 text-zinc-950 ${compact ? "h-8 w-8" : "h-10 w-10"}`}
    >
      <Ticket className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.3} />
    </span>
  );
}
function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-3 text-white">
          <BrandMark compact />
          <span className="text-sm font-semibold tracking-tight">
            EventPass VE
          </span>
        </a>
        <nav className="hidden items-center gap-7 text-sm font-medium text-white/72 md:flex">
          <a
            href="#caracteristicas"
            className="transition-colors hover:text-white"
          >
            Características
          </a>
          <a href="#experiencia" className="transition-colors hover:text-white">
            Experiencia pública
          </a>
          <a href="#contacto" className="transition-colors hover:text-white">
            Contacto
          </a>
        </nav>
        <Link
          to="/crear-cuenta"
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:bg-emerald-50 active:scale-[0.98]"
        >
          Crear organización
        </Link>
      </div>
    </header>
  );
}
function Metric({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400 text-zinc-950">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
      <p>
        <b className="font-semibold text-white">{label}</b>
        <span className="block text-white/65">{text}</span>
      </p>
    </div>
  );
}

function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden bg-zinc-950 text-white"
    >
      <img
        src="/images/eventpass-cinematic-event-hall.png"
        alt="Recinto preparado para un evento profesional"
        fetchPriority="high"
        width={1672}
        height={941}
        className="absolute inset-0 h-full w-full object-cover object-[62%_center]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,9,11,.98)_0%,rgba(9,9,11,.84)_34%,rgba(9,9,11,.32)_72%,rgba(9,9,11,.12)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_70%,rgba(16,185,129,.26),transparent_30%)]" />
      <Header />
      <div className="relative mx-auto grid min-h-[min(760px,100dvh)] max-w-7xl items-center gap-8 px-5 pb-12 pt-24 lg:grid-cols-[minmax(0,680px)_1fr]">
        <div className="max-w-2xl animate-float-up">
          <p className="text-sm font-semibold text-emerald-300">
            Eventos que se sienten bien organizados
          </p>
          <h1 className="mt-5 max-w-[620px] text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-white sm:text-6xl">
            Tu evento, en primer plano.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-200 sm:text-xl">
            Diseña exposiciones y conecta registros, agenda y acreditación en
            una experiencia clara para cada persona.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/crear-cuenta"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition-transform hover:bg-emerald-300 active:scale-[0.98]"
            >
              Crear mi organización <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#contacto"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/18"
            >
              Ver una demostración
            </a>
          </div>
        </div>
        <div className="hidden self-end lg:block">
          <div className="ml-auto max-w-sm rounded-[22px] border border-white/20 bg-white/10 p-5 backdrop-blur-xl sm:p-6">
            <p className="text-sm font-semibold text-emerald-200">
              Un solo sistema. Tres experiencias.
            </p>
            <div className="mt-5 grid gap-4 text-sm text-white/88">
              <Metric
                label="Organizador"
                text="Control operativo y comercial"
              />
              <Metric label="Expositor" text="Perfil, personal y pendientes" />
              <Metric label="Asistente" text="Agenda, plano y credencial" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Platform() {
  return (
    <section id="plataforma" className="bg-zinc-950 py-20 text-white sm:py-28">
      <span id="caracteristicas" />
      <div className="mx-auto max-w-7xl px-5">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-emerald-300">
            La operación, conectada
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            Cada equipo ve exactamente lo que necesita.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-300">
            Evita planillas paralelas y herramientas desconectadas. EventPass
            acompaña el recorrido completo del evento.
          </p>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <article className="min-h-[330px] rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,#123b37,#0e1717_62%)] p-7 sm:p-9">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-300 text-zinc-950">
              <Ticket className="h-6 w-6" />
            </div>
            <h3 className="mt-16 max-w-md text-3xl font-semibold tracking-tight">
              De la inscripción al acceso, sin perder el contexto.
            </h3>
            <p className="mt-4 max-w-lg text-zinc-300">
              Pagos, credenciales, asistencia e incidencias forman parte del
              mismo expediente de cada participante.
            </p>
          </article>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {capabilities.slice(0, 2).map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-[24px] border border-white/10 bg-white/[.055] p-6"
              >
                <Icon className="h-5 w-5 text-emerald-300" />
                <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {capabilities.slice(2).map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="flex gap-5 rounded-[24px] border border-white/10 bg-white/[.035] p-6"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/8 text-emerald-300">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Experience() {
  return (
    <section id="experiencia" className="bg-zinc-900 py-20 text-white sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[.78fr_1.22fr] lg:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-300">
            Lo público también comunica calidad
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Un evento fácil de descubrir y seguir.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-300">
            Los asistentes consultan agenda, localizan empresas y guardan
            favoritos desde el navegador. Sin instalar una aplicación.
          </p>
          <a
            href="#contacto"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
          >
            Preparar una experiencia pública <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-[24px] border border-white/10 bg-zinc-800 p-6">
            <Map className="h-6 w-6 text-emerald-300" />
            <h3 className="mt-16 text-xl font-semibold text-white">
              Plano interactivo
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Busca una empresa, toca su stand y abre un perfil con información
              aprobada.
            </p>
          </article>
          <article className="rounded-[24px] bg-emerald-700 p-6 text-white shadow-[0_20px_60px_rgba(4,120,87,.18)]">
            <CalendarDays className="h-6 w-6 text-emerald-100" />
            <h3 className="mt-16 text-xl font-semibold">Agenda que orienta</h3>
            <p className="mt-3 text-sm leading-relaxed text-emerald-50/85">
              Muestra qué ocurre ahora, qué sigue y en qué escenario se realiza.
            </p>
          </article>
          <article className="rounded-[24px] bg-zinc-950 p-6 text-white sm:col-span-2">
            <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <QrCode className="h-6 w-6 text-emerald-300" />
                <h3 className="mt-6 text-xl font-semibold">
                  Preparado para compartir
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                  Enlaces, códigos QR, descarga e inserción en el sitio del
                  organizador mantienen el plano disponible en el momento
                  necesario.
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-emerald-200">
                <Users className="h-6 w-6" />
                <p className="mt-3 font-semibold text-white">
                  Una experiencia coherente para asistentes, expositores y
                  organizadores.
                </p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
function CallToAction() {
  return (
    <section id="contacto" className="bg-zinc-900 px-5 pb-20 sm:pb-28">
      <div className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-[28px] bg-emerald-700 p-8 text-white sm:p-12 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-emerald-100">
            Hablemos de tu evento
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            Tu próximo evento puede sentirse mucho más simple.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-emerald-50/90">
            Cuéntanos si organizas una exposición, foro, congreso o jornada
            corporativa. Te mostramos el recorrido que corresponde.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="mailto:estebanjvasquez@gmail.com?subject=Demo%20EventPass%20VE"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-emerald-900 transition-transform hover:bg-emerald-50 active:scale-[0.98]"
            >
              Solicitar demo <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/crear-cuenta"
              className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/18"
            >
              Crear organización
            </Link>
          </div>
        </div>
        <aside className="rounded-[22px] border border-white/20 bg-white/10 p-6 backdrop-blur">
          <p className="text-lg font-semibold">Elige el recorrido de tu demo</p>
          <div className="mt-5 grid gap-4 text-sm text-emerald-50">
            <Metric
              label="Exposición"
              text="Plano, expositores, stands y portal"
            />
            <Metric
              label="Foro o congreso"
              text="Agenda, ponentes, salas y asientos"
            />
            <Metric
              label="Evento corporativo"
              text="Registro, pagos, credenciales y acceso"
            />
          </div>
          <a
            href="mailto:estebanjvasquez@gmail.com?subject=Consulta%20EventPass%20VE"
            className="mt-6 inline-flex text-sm font-semibold text-white underline underline-offset-4"
          >
            Escribir una consulta
          </a>
        </aside>
      </div>
    </section>
  );
}
function Footer() {
  return (
    <footer className="bg-zinc-950 px-5 py-8 text-zinc-400">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-white">
          <BrandMark compact />
          <span className="text-sm font-semibold">EventPass VE</span>
        </div>
        <p className="text-sm">
          © {new Date().getFullYear()} EventPass VE. Hecho en Venezuela.
        </p>
      </div>
    </footer>
  );
}

type PublicEvent = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
};
function TenantLanding({ tenant }: { tenant: Tenant }) {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const color = brandColor(tenant);
  const name = brandName(tenant);
  const logoUrl = tenant.branding?.logo_url ?? null;
  useEffect(() => {
    let active = true;
    supabase
      .from("events")
      .select("id, name, description, start_date")
      .eq("organization_id", tenant.id)
      .eq("status", "published")
      .order("start_date", { ascending: true })
      .then(({ data }) => {
        if (active) {
          setEvents((data ?? []) as PublicEvent[]);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [tenant.id]);
  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          {logoUrl ? (
            <span className="flex h-10 w-28 items-center justify-center rounded-xl bg-white p-1">
              <img
                src={logoUrl}
                alt={name}
                className="h-full w-full object-contain"
              />
            </span>
          ) : (
            <span
              className="grid h-10 w-10 place-items-center rounded-xl text-white"
              style={{ backgroundColor: color ?? "#18181b" }}
            >
              <Ticket className="h-5 w-5" />
            </span>
          )}
          <span className="text-lg font-semibold tracking-tight text-zinc-950">
            {name}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-14">
        <p
          className="text-sm font-semibold"
          style={{ color: color ?? "#047857" }}
        >
          Eventos abiertos
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
          Elige cómo quieres participar.
        </h1>
        {loading ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-44 animate-pulse rounded-[22px] bg-zinc-200"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="mt-10 rounded-[22px] border border-zinc-200 bg-white p-8 text-zinc-600">
            No hay eventos abiertos por ahora. Vuelve pronto.
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {events.map((event) => (
              <article
                key={event.id}
                className="flex min-h-56 flex-col rounded-[22px] border border-zinc-200 bg-white p-6"
              >
                <p className="text-sm text-zinc-500">
                  {event.start_date
                    ? new Date(event.start_date).toLocaleDateString("es-VE", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "Fecha por confirmar"}
                </p>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950">
                  {event.name}
                </h2>
                {event.description && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-zinc-600">
                    {event.description}
                  </p>
                )}
                <Link
                  to={`/e/${event.id}`}
                  style={color ? { backgroundColor: color } : undefined}
                  className="mt-auto inline-flex w-fit items-center gap-2 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Ver evento <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Landing() {
  const { tenant, loading } = useTenant();
  if (loading) return <div className="min-h-[100dvh] bg-zinc-950" />;
  if (tenant) return <TenantLanding tenant={tenant} />;
  return (
    <div className="min-h-[100dvh] bg-zinc-950">
      <main>
        <Hero />
        <Platform />
        <Experience />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
