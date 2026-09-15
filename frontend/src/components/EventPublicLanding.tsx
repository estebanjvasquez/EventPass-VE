import { useState, type CSSProperties } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Menu,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { type Tenant } from "../lib/tenantCore";
import {
  templateBlocks,
  type LandingBlock,
  type LandingBlockType,
  type LandingConfig,
} from "../lib/landingBuilder";
import { resolvePublicEventBrand } from "../lib/eventBranding";

export type {
  LandingTemplate,
  LandingBlockType,
  LandingBlock,
  LandingConfig,
} from "../lib/landingBuilder";
export type LandingEvent = {
  id: string;
  name: string;
  description: string | null;
  event_type: string;
  start_date: string | null;
  config: Record<string, unknown> | null;
};
const defaults: Required<
  Omit<
    LandingConfig,
    "hero_image_url" | "logo_url" | "primary_color" | "brochure_url"
  >
> = {
  template: "summit",
  brand_name: "",
  eyebrow: "Próximamente",
  headline: "",
  subheadline: "",
  cta_label: "Registrarme",
  hero_images: [],
  gallery_images: [],
  location: "",
  intro_title: "",
  intro_body: "",
  brochure_label: "Descargar información",
  show_agenda: true,
  show_exhibition: true,
  show_interest: true,
  blocks: templateBlocks.summit,
};
const validImages = (items: unknown) =>
  Array.isArray(items)
    ? items
        .filter(
          (item): item is string =>
            typeof item === "string" && /^https?:\/\//i.test(item),
        )
        .slice(0, 6)
    : [];
function contentFor(event: LandingEvent) {
  const saved = (event.config?.public_landing ?? {}) as LandingConfig;
  const heroImages = validImages(saved.hero_images);
  if (saved.hero_image_url && !heroImages.includes(saved.hero_image_url))
    heroImages.unshift(saved.hero_image_url);
  const template = saved.template ?? "summit";
  return {
    ...defaults,
    ...saved,
    template,
    hero_images: heroImages,
    gallery_images: validImages(saved.gallery_images),
    blocks: saved.blocks?.length ? saved.blocks : templateBlocks[template],
    headline: saved.headline?.trim() || event.name,
    subheadline:
      saved.subheadline?.trim() ||
      event.description ||
      "Una experiencia creada para conectar personas, conocimiento y oportunidades.",
  };
}
function EventLogo({
  logoUrl,
  name,
}: {
  logoUrl?: string | null;
  name: string;
}) {
  return logoUrl ? (
    <img
      src={logoUrl}
      alt={name}
      className="h-10 max-w-40 object-contain object-left"
    />
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
      <Ticket className="h-5 w-5" />
    </span>
  );
}

export default function EventPublicLanding({
  event,
  tenant,
}: {
  event: LandingEvent;
  tenant: Tenant;
}) {
  const content = contentFor(event);
  const [slide, setSlide] = useState(0);
  const brand = resolvePublicEventBrand(event, tenant);
  const accent = brand.color;
  const organization = brand.name;
  const logoUrl = brand.logo_url;
  const date = event.start_date
    ? new Date(event.start_date).toLocaleDateString("es-VE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Fecha por confirmar";
  const heroImage = content.hero_images[slide] ?? null;
  const hasGallery = content.gallery_images.length > 0;
  const navClass =
    "hidden text-sm font-semibold text-white/75 transition hover:text-white lg:inline-flex";
  const css = { "--event-accent": accent } as CSSProperties;
  const registration = `/e/${event.id}`;
  const go = (direction: number) =>
    setSlide((current) =>
      content.hero_images.length
        ? (current + direction + content.hero_images.length) %
          content.hero_images.length
        : 0,
    );
  const visible = (type: LandingBlockType) =>
    content.blocks.some((block) => block.type === type && block.enabled);
  const renderBlock = (item: LandingBlock) => {
    if (!item.enabled) return null;
    if (item.type === "event_intro")
      return (
        <section
          key={item.id}
          id="evento"
          className="bg-[#151821] py-18 sm:py-24"
        >
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-7 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <p className="text-sm font-bold" style={{ color: accent }}>
                Sobre el evento
              </p>
              <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight sm:text-5xl">
                {item.title ||
                  content.intro_title ||
                  "Una plataforma creada para conversaciones que importan."}
              </h2>
            </div>
            <p className="max-w-2xl self-end text-lg leading-8 text-white/70">
              {item.body ||
                content.intro_body ||
                event.description ||
                "Conecta a las personas adecuadas, presenta oportunidades y convierte cada encuentro en una relación de valor."}
            </p>
          </div>
        </section>
      );
    if (item.type === "program")
      return (
        <section
          key={item.id}
          id="programa"
          className="border-y border-white/10 bg-[#11131b] py-18 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-7">
            <p className="text-sm font-bold" style={{ color: accent }}>
              Planifica tu experiencia
            </p>
            <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
                {item.title || "Información clara antes de llegar."}
              </h2>
              <div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2">
                {content.show_agenda && (
                  <Link
                    to={`/e/${event.id}/agenda`}
                    className="group bg-[#171a24] p-6 transition hover:bg-[#202534]"
                  >
                    <CalendarDays
                      className="h-6 w-6"
                      style={{ color: accent }}
                    />
                    <h3 className="mt-12 text-xl font-semibold">Agenda</h3>
                    <p className="mt-2 text-sm leading-6 text-white/65">
                      Sesiones, actividades y horarios en un solo lugar.
                    </p>
                    <span
                      className="mt-5 inline-flex items-center gap-2 text-sm font-bold"
                      style={{ color: accent }}
                    >
                      Ver programa{" "}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </Link>
                )}
                <Link
                  to={registration}
                  className="group bg-[#171a24] p-6 transition hover:bg-[#202534]"
                >
                  <Ticket className="h-6 w-6" style={{ color: accent }} />
                  <h3 className="mt-12 text-xl font-semibold">Registro</h3>
                  <p className="mt-2 text-sm leading-6 text-white/65">
                    Confirma tu participación desde cualquier dispositivo.
                  </p>
                  <span
                    className="mt-5 inline-flex items-center gap-2 text-sm font-bold"
                    style={{ color: accent }}
                  >
                    Registrarme{" "}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </span>
                </Link>
                {event.event_type === "exhibition" &&
                  content.show_exhibition && (
                    <Link
                      to={`/expo/${event.id}/plano`}
                      className="group bg-[#171a24] p-6 transition hover:bg-[#202534] sm:col-span-2"
                    >
                      <Users className="h-6 w-6" style={{ color: accent }} />
                      <h3 className="mt-8 text-xl font-semibold">
                        Empresas y exposición
                      </h3>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-white/65">
                        Recorre el plano, encuentra expositores y descubre
                        oportunidades de colaboración.
                      </p>
                      <span
                        className="mt-5 inline-flex items-center gap-2 text-sm font-bold"
                        style={{ color: accent }}
                      >
                        Explorar exposición{" "}
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                      </span>
                    </Link>
                  )}
              </div>
            </div>
          </div>
        </section>
      );
    if (item.type === "gallery")
      return hasGallery ? (
        <section
          key={item.id}
          id="galeria"
          className="bg-[#151821] py-18 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-7">
            <div className="max-w-2xl">
              <p className="text-sm font-bold" style={{ color: accent }}>
                La experiencia
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
                {item.title || "Una historia que se reconoce a primera vista."}
              </h2>
            </div>
            <div className="mt-10 flex snap-x gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]">
              {content.gallery_images.map((image, index) => (
                <article
                  key={image}
                  className={`snap-start shrink-0 overflow-hidden rounded-xl ${index === 0 ? "w-[min(82vw,660px)]" : "w-[min(68vw,440px)]"}`}
                >
                  <img
                    src={image}
                    alt={`Imagen del evento ${index + 1}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition duration-500 hover:scale-[1.025]"
                  />
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null;
    return (
      <section key={item.id} className="bg-[#11131b] py-18 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-7">
          <div className="rounded-2xl border border-white/10 bg-[#1b1f2a] p-7 sm:p-12">
            <Sparkles className="h-6 w-6" style={{ color: accent }} />
            <h2 className="mt-8 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
              {item.title || "Tu lugar en el evento empieza aquí."}
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/70">
              {item.body ||
                "Consulta la información, organiza tu visita y completa tu registro."}
            </p>
            <Link
              to={registration}
              className="mt-8 inline-flex items-center gap-2 rounded-md px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:translate-y-px"
              style={{ backgroundColor: accent }}
            >
              {content.cta_label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    );
  };
  return (
    <div
      style={css}
      className="min-h-[100dvh] bg-[#11131b] text-white selection:bg-white/20"
    >
      <header className="relative z-20 border-b border-white/10 bg-[#11131b]/92 backdrop-blur">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-7">
          <Link to="/" className="min-w-0">
            <EventLogo logoUrl={logoUrl} name={organization} />
          </Link>
          <nav className="flex items-center gap-6">
            <a href="#evento" className={navClass}>
              El evento
            </a>
            {visible("program") && (
              <a href="#programa" className={navClass}>
                Programa
              </a>
            )}
            {visible("gallery") && hasGallery && (
              <a href="#galeria" className={navClass}>
                Galería
              </a>
            )}
            <Link
              to={registration}
              className="hidden rounded-md px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:translate-y-px sm:inline-flex"
              style={{ backgroundColor: accent }}
            >
              {content.cta_label}
            </Link>
            <span className="inline-flex lg:hidden">
              <Menu className="h-5 w-5" />
            </span>
          </nav>
        </div>
      </header>
      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 -z-10 bg-[#171a24]">
            {heroImage ? (
              <img
                src={heroImage}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full bg-[radial-gradient(circle_at_76%_22%,color-mix(in_srgb,var(--event-accent)_45%,transparent),transparent_29%),linear-gradient(120deg,#10151f,#253148)]" />
            )}
            {heroImage && (
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,14,20,.97)_0%,rgba(12,14,20,.85)_38%,rgba(12,14,20,.3)_72%,rgba(12,14,20,.42)_100%)]" />
            )}
          </div>
          <div className="mx-auto grid min-h-[min(760px,100dvh)] max-w-7xl items-end gap-12 px-4 pb-14 pt-16 sm:px-7 lg:grid-cols-[minmax(0,1fr)_290px] lg:pb-20">
            <div className="max-w-3xl self-center">
              <p
                className="text-sm font-bold tracking-wide"
                style={{ color: accent }}
              >
                {content.eyebrow}
              </p>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.03] tracking-[-.045em] sm:text-6xl lg:text-7xl">
                {content.headline}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/76 sm:text-xl">
                {content.subheadline}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  to={registration}
                  className="inline-flex items-center gap-2 rounded-md px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:translate-y-px"
                  style={{ backgroundColor: accent }}
                >
                  {content.cta_label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {content.brochure_url ? (
                  <a
                    href={content.brochure_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/5 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-white/12"
                  >
                    {content.brochure_label}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                ) : (
                  content.show_interest && (
                    <Link
                      to={`/e/${event.id}/interes/solicita-informacion`}
                      className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/5 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-white/12"
                    >
                      Solicitar información
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )
                )}
              </div>
            </div>
            <div className="grid gap-4 border-l border-white/15 pl-5 text-sm text-white/75 lg:mb-2">
              {content.location && (
                <p className="flex items-center gap-2">
                  <MapPin
                    className="h-4 w-4 shrink-0"
                    style={{ color: accent }}
                  />
                  {content.location}
                </p>
              )}
              <p className="flex items-center gap-2">
                <CalendarDays
                  className="h-4 w-4 shrink-0"
                  style={{ color: accent }}
                />
                {date}
              </p>
              {content.hero_images.length > 1 && (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label="Imagen anterior"
                    className="rounded-md border border-white/20 p-2 hover:bg-white/10"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span>
                    {slide + 1} / {content.hero_images.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label="Imagen siguiente"
                    className="rounded-md border border-white/20 p-2 hover:bg-white/10"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
        {content.blocks.map(renderBlock)}
      </main>
      <footer className="border-t border-white/10 bg-[#11131b] px-4 py-9 text-sm text-white/50 sm:px-7">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <span>{organization}</span>
          <span>{event.name}</span>
        </div>
      </footer>
    </div>
  );
}
