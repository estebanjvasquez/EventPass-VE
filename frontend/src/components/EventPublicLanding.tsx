import { useEffect, useState, type CSSProperties } from "react";
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
import {
  templateBlocks,
  type LandingBlock,
  type LandingBlockType,
  type LandingConfig,
} from "../lib/landingBuilder";
import { resolvePublicEventBrand } from "../lib/eventBranding";
import { supabase } from "../lib/supabase";

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
    | "hero_image_url"
    | "logo_url"
    | "primary_color"
    | "page_background_color"
    | "hero_background_color"
    | "hero_glow_color"
    | "surface_color"
    | "text_color"
    | "muted_text_color"
    | "cta_text_color"
    | "hero_gradient_end"
    | "hero_gradient_angle"
    | "hero_heading_color"
    | "hero_body_color"
    | "hero_heading_size"
    | "card_text_color"
    | "card_muted_text_color"
    | "sponsors_mode"
    | "sponsors_title"
    | "brochure_url"
    | "agenda_scope"
    | "agenda_event_id"
    | "agenda_program_id"
    | "agenda_title"
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
  show_sponsors: false,
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
  // `hero_image_url` es compatibilidad con landings antiguas. Cuando el
  // constructor guarda una lista (aunque esté vacía), esa lista manda.
  if (!Array.isArray(saved.hero_images) && saved.hero_image_url && !heroImages.includes(saved.hero_image_url))
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
  registrationUrl,
  agendaUrl,
  linkedEvents = [],
}: {
  event: LandingEvent;
  registrationUrl?: string;
  agendaUrl?: string;
  linkedEvents?: { id: string; name: string }[];
}) {
  const content = contentFor(event);
  const [slide, setSlide] = useState(0);
  const [sponsors, setSponsors] = useState<{ id: string; name: string; logo_url: string | null }[]>([]);
  const brand = resolvePublicEventBrand(event);
  const accent = brand.color;
  const palette = {
    page: content.page_background_color || "#11131b",
    hero: content.hero_background_color || "#171a24",
    glow: content.hero_glow_color || accent,
    surface: content.surface_color || "#151821",
    text: content.text_color || "#ffffff",
    muted: content.muted_text_color || "#cbd5e1",
    ctaText: content.cta_text_color || "#11131b",
  };
  const heroHeadingColor = content.hero_heading_color || palette.text;
  const heroBodyColor = content.hero_body_color || palette.muted;
  const cardTextColor = content.card_text_color || palette.text;
  const cardMutedColor = content.card_muted_text_color || palette.muted;
  const heroSize = content.hero_heading_size === "xl" ? "sm:text-7xl lg:text-8xl" : content.hero_heading_size === "md" ? "sm:text-5xl lg:text-6xl" : "sm:text-6xl lg:text-7xl";
  const heroGradient = `linear-gradient(${content.hero_gradient_angle ?? 120}deg, ${palette.hero}, ${content.hero_gradient_end || palette.page})`;
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
    "hidden text-sm font-semibold text-[var(--event-muted)] transition hover:text-[var(--event-text)] lg:inline-flex";
  const css = {
    "--event-accent": accent,
    "--event-page": palette.page,
    "--event-hero": palette.hero,
    "--event-glow": palette.glow,
    "--event-surface": palette.surface,
    "--event-text": palette.text,
    "--event-muted": palette.muted,
  } as CSSProperties;
  const registration = registrationUrl ?? `/e/${event.id}`;
  const scheduleUrl = content.agenda_scope === 'event' ? `/e/${content.agenda_event_id ?? event.id}/programa?solo=evento` : content.agenda_program_id ? `/p/${content.agenda_program_id}/agenda` : agendaUrl ?? `/e/${event.id}/programa`;
  useEffect(() => {
    if (!content.show_sponsors) return;
    let active = true;
    void supabase.rpc("get_public_event_sponsors", { p_event_id: event.id }).then(({ data }) => {
      if (active) setSponsors((data ?? []) as { id: string; name: string; logo_url: string | null }[]);
    });
    return () => { active = false; };
  }, [content.show_sponsors, event.id]);
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
          className="py-18 sm:py-24"
          style={{ backgroundColor: palette.surface }}
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
            <p className="max-w-2xl self-end text-lg leading-8" style={{ color: palette.muted }}>
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
          className="border-y border-white/10 py-18 sm:py-24"
          style={{ backgroundColor: palette.page }}
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
                    to={scheduleUrl}
                    className="group p-6 transition hover:brightness-110"
                    style={{ backgroundColor: palette.surface }}
                  >
                    <CalendarDays
                      className="h-6 w-6"
                      style={{ color: accent }}
                    />
                    <h3 className="mt-12 text-xl font-semibold" style={{ color: cardTextColor }}>{content.agenda_title || (scheduleUrl.startsWith('/p/') ? 'Programa general' : 'Agenda de actividades')}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: cardMutedColor }}>
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
                  className="group p-6 transition hover:brightness-110"
                  style={{ backgroundColor: palette.surface }}
                >
                  <Ticket className="h-6 w-6" style={{ color: accent }} />
                  <h3 className="mt-12 text-xl font-semibold" style={{ color: cardTextColor }}>Registro</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: cardMutedColor }}>
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
                      className="group p-6 transition hover:brightness-110 sm:col-span-2"
                      style={{ backgroundColor: palette.surface }}
                    >
                      <Users className="h-6 w-6" style={{ color: accent }} />
                      <h3 className="mt-8 text-xl font-semibold" style={{ color: cardTextColor }}>
                        Empresas y exposición
                      </h3>
                      <p className="mt-2 max-w-lg text-sm leading-6" style={{ color: cardMutedColor }}>
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
          className="py-18 sm:py-24"
          style={{ backgroundColor: palette.surface }}
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
      <section key={item.id} className="py-18 sm:py-24" style={{ backgroundColor: palette.page }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-7">
          <div className="rounded-2xl border border-white/10 p-7 sm:p-12" style={{ backgroundColor: palette.surface }}>
            <Sparkles className="h-6 w-6" style={{ color: accent }} />
            <h2 className="mt-8 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl" style={{ color: cardTextColor }}>
              {item.title || "Tu lugar en el evento empieza aquí."}
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8" style={{ color: cardMutedColor }}>
              {item.body ||
                "Consulta la información, organiza tu visita y completa tu registro."}
            </p>
            <Link
              to={registration}
              className="mt-8 inline-flex items-center gap-2 rounded-md px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:translate-y-px"
              style={{ backgroundColor: accent, color: palette.ctaText }}
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
      className="min-h-[100dvh] selection:bg-white/20"
      style={{ ...css, backgroundColor: palette.page, color: palette.text }}
    >
      <header className="relative z-20 border-b border-white/10 backdrop-blur" style={{ backgroundColor: `${palette.page}eb` }}>
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
              style={{ backgroundColor: accent, color: palette.ctaText }}
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
          <div className="absolute inset-0 -z-10" style={{ backgroundColor: palette.hero }}>
            {heroImage ? (
              <img
                src={heroImage}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full" style={{ backgroundImage: `radial-gradient(circle at 76% 22%, ${palette.glow} 0%, transparent 38%), ${heroGradient}` }} />
            )}
            {heroImage && (
              <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${palette.hero} 97%, transparent) 0%, color-mix(in srgb, ${palette.hero} 85%, transparent) 38%, color-mix(in srgb, ${palette.hero} 30%, transparent) 72%, color-mix(in srgb, ${palette.hero} 42%, transparent) 100%)` }} />
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
              <h1 className={`mt-5 max-w-3xl text-4xl font-semibold leading-[1.03] tracking-[-.045em] ${heroSize}`} style={{ color: heroHeadingColor }}>
                {content.headline}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 sm:text-xl" style={{ color: heroBodyColor }}>
                {content.subheadline}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  to={registration}
                  className="inline-flex items-center gap-2 rounded-md px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:translate-y-px"
                  style={{ backgroundColor: accent, color: palette.ctaText }}
                >
                  {content.cta_label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {content.brochure_url ? (
                  <a
                    href={content.brochure_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/5 px-5 py-3.5 text-sm font-bold transition hover:bg-white/12"
                  >
                    {content.brochure_label}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                ) : (
                  content.show_interest && (
                    <Link
                      to={`/e/${event.id}/interes/solicita-informacion`}
                      className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/5 px-5 py-3.5 text-sm font-bold transition hover:bg-white/12"
                    >
                      Solicitar información
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )
                )}
              </div>
            </div>
            <div className="grid gap-4 border-l border-white/15 pl-5 text-sm lg:mb-2" style={{ color: palette.muted }}>
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
        {content.show_sponsors && sponsors.length > 0 && <section className="overflow-hidden py-14 sm:py-18" style={{ backgroundColor: palette.surface }}><div className="mx-auto max-w-7xl px-4 sm:px-7"><h2 className="text-2xl font-semibold" style={{ color: palette.text }}>{content.sponsors_title || "Patrocinantes"}</h2><div className={content.sponsors_mode === "carousel" ? "mt-7 flex gap-5 overflow-x-auto pb-3" : "mt-7 flex flex-wrap gap-5"}>{sponsors.map((sponsor) => <div key={sponsor.id} className="flex h-24 min-w-44 items-center justify-center rounded-xl border border-black/10 bg-white p-4"><img src={sponsor.logo_url || ""} alt={sponsor.name} className="max-h-full max-w-full object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />{!sponsor.logo_url && <span className="text-sm font-semibold text-zinc-700">{sponsor.name}</span>}</div>)}</div></div></section>}
        {linkedEvents.length > 0 && <section className="mx-auto max-w-7xl px-4 py-10 sm:px-7"><h2 className="text-2xl font-semibold">Eventos del programa</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">{linkedEvents.map(linked => <Link key={linked.id} to={`/e/${linked.id}`} className="rounded-xl border p-5 font-semibold" style={{ backgroundColor: palette.surface, color: cardTextColor }}>{linked.name}<ArrowRight className="mt-3 h-4 w-4" /></Link>)}</div></section>}
        {content.blocks.map(renderBlock)}
      </main>
      <footer className="border-t border-white/10 px-4 py-9 text-sm sm:px-7" style={{ backgroundColor: palette.page, color: palette.muted }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <span>{organization}</span>
          <span>{event.name}</span>
        </div>
      </footer>
    </div>
  );
}
