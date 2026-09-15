import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Globe2,
  ImagePlus,
  LayoutTemplate,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  templateBlocks,
  type LandingBlock,
  type LandingBlockType,
  type LandingConfig,
  type LandingTemplate,
} from "../../lib/landingBuilder";
import { supabase } from "../../lib/supabase";

const initial: LandingConfig = {
  template: "summit",
  eyebrow: "Próximamente",
  headline: "",
  subheadline: "",
  cta_label: "Registrarme",
  hero_image_url: "",
  hero_images: [],
  gallery_images: [],
  primary_color: "",
  logo_url: "",
  location: "",
  brochure_label: "Descargar información",
  brochure_url: "",
  show_agenda: true,
  show_exhibition: true,
  show_interest: true,
  blocks: templateBlocks.summit,
};
const blockMeta: Record<LandingBlockType, { label: string; detail: string }> = {
  event_intro: {
    label: "Presentación del evento",
    detail: "Título y texto de apertura.",
  },
  program: {
    label: "Programa y registro",
    detail: "Agenda, registro y exposición cuando aplique.",
  },
  gallery: {
    label: "Galería visual",
    detail: "Carrusel de imágenes del evento.",
  },
  cta: {
    label: "Llamado a registro",
    detail: "Cierre comercial y botón de registro.",
  },
};
type Event = {
  id: string;
  name: string;
  organization_id: string;
  config: Record<string, unknown> | null;
};
type Domain = { slug: string; custom_hostname: string | null };
const cloneBlocks = (template: LandingTemplate) =>
  templateBlocks[template].map((block) => ({ ...block }));
const input =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-normal text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function EventLandingAdmin() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [domain, setDomain] = useState<Domain | null>(null);
  const [draft, setDraft] = useState<LandingConfig>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoState, setLogoState] = useState<"idle" | "verifying" | "ready" | "failed">("idle");
  const load = useCallback(async () => {
    if (!eventId) return;
    const { data, error } = await supabase
      .from("events")
      .select("id,name,organization_id,config")
      .eq("id", eventId)
      .maybeSingle();
    if (error || !data) {
      setMessage(error?.message ?? "Evento no encontrado.");
      return;
    }
    const loaded = data as Event;
    const config = loaded.config ?? {};
    const source = (config.public_landing_draft ??
      config.public_landing ??
      {}) as LandingConfig;
    const template = source.template ?? "summit";
    setEvent(loaded);
    setDraft({
      ...initial,
      ...source,
      template,
      blocks: source.blocks?.length ? source.blocks : cloneBlocks(template),
    });
    setLogoState(source.logo_url ? "ready" : "idle");
    const { data: org } = await supabase
      .from("organizations")
      .select("slug,custom_hostname")
      .eq("id", loaded.organization_id)
      .maybeSingle();
    setDomain(org as Domain | null);
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  function set<K extends keyof LandingConfig>(key: K, value: LandingConfig[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function applyTemplate(template: LandingTemplate) {
    setDraft((current) => ({
      ...current,
      template,
      blocks: cloneBlocks(template),
    }));
  }
  function updateBlock(id: string, patch: Partial<LandingBlock>) {
    setDraft((current) => ({
      ...current,
      blocks: (current.blocks ?? []).map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    }));
  }
  function moveBlock(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const blocks = [...(current.blocks ?? [])];
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return current;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, blocks };
    });
  }
  function addBlock(type: LandingBlockType) {
    setDraft((current) => ({
      ...current,
      blocks: [
        ...(current.blocks ?? []),
        { id: `${type}-${Date.now()}`, type, enabled: true },
      ],
    }));
  }
  function removeBlock(id: string) {
    setDraft((current) => ({
      ...current,
      blocks: (current.blocks ?? []).filter((block) => block.id !== id),
    }));
  }
  async function save(mode: "draft" | "publish") {
    if (!event) return;
    setSaving(true);
    setMessage(null);
    const current = event.config ?? {};
    const config =
      mode === "publish"
        ? { ...current, public_landing: draft, public_landing_draft: draft }
        : { ...current, public_landing_draft: draft };
    const { error } = await supabase
      .from("events")
      .update({ config })
      .eq("id", event.id);
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setEvent({ ...event, config });
      setMessage(
        mode === "publish"
          ? "Landing publicada. El público ya verá esta versión."
          : "Borrador guardado. La página pública no ha cambiado.",
      );
    }
  }
  async function uploadImage(
    file: File | undefined,
    target: "hero" | "gallery" | "logo",
  ) {
    if (!file || !event) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type) || (target === "logo" && (file.type === "image/svg+xml" || extension === "svg"));
    if (
      !allowed ||
      file.size > 8 * 1024 * 1024
    ) {
      setMessage(target === "logo" ? "Usa SVG, JPG, PNG o WebP de máximo 8 MB." : "Usa JPG, PNG o WebP de máximo 8 MB.");
      return;
    }
    setUploading(true);
    setMessage(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${event.organization_id}/${event.id}/${Date.now()}-${safeName}`;
    const result = await supabase.storage
      .from("event-landing-assets")
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    const url = supabase.storage.from("event-landing-assets").getPublicUrl(path)
      .data.publicUrl;
    if (target === "logo") {
      setLogoState("verifying");
      const verified = await new Promise<boolean>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = url;
      });
      if (!verified) {
        setLogoState("failed");
        setMessage("El archivo se subió, pero no pudo verificarse como logo. Prueba un SVG simple, PNG o WebP.");
        return;
      }
      setLogoState("ready");
    }
    setDraft((current) =>
      target === "logo"
        ? { ...current, logo_url: url }
        : target === "hero"
          ? {
              ...current,
              hero_image_url: url,
              hero_images: [...(current.hero_images ?? []), url].slice(0, 6),
            }
          : {
              ...current,
              gallery_images: [...(current.gallery_images ?? []), url].slice(
                0,
                6,
              ),
            },
    );
    setMessage(target === "logo" ? "Logo verificado y cargado al borrador. Pulsa Publicar para mostrarlo al público." : "Imagen cargada al borrador. Guarda o publica para confirmar el cambio.");
  }
  const subdomain = domain?.slug
    ? `https://${domain.slug}.eventosfacil.net`
    : null;
  const customDomain = domain?.custom_hostname
    ? `https://${domain.custom_hostname}`
    : null;
  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setMessage("Enlace copiado.");
  }
  const imageList = (
    key: "hero_images" | "gallery_images",
    title: string,
    target: "hero" | "gallery",
  ) => (
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Hasta 6 imágenes. JPG, PNG o WebP, máximo 8 MB.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-700">
          <ImagePlus className="h-4 w-4" />
          {uploading ? "Cargando…" : "Subir imagen"}
          <input
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => void uploadImage(e.target.files?.[0], target)}
          />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(draft[key] ?? []).map((url) => (
          <article
            key={url}
            className="relative overflow-hidden rounded-xl border bg-zinc-100"
          >
            <img
              src={url}
              alt="Recurso de landing"
              className="aspect-[4/3] w-full object-cover"
            />
            <button
              type="button"
              onClick={() =>
                set(
                  key,
                  (draft[key] ?? []).filter((image) => image !== url),
                )
              }
              className="absolute right-2 top-2 rounded-lg bg-white/95 p-2 text-zinc-700 shadow-sm"
              aria-label="Quitar imagen"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </article>
        ))}
        {!(draft[key] ?? []).length && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-zinc-500 sm:col-span-3">
            Aún no hay imágenes. La plantilla conservará un fondo de marca hasta
            que cargues recursos.
          </p>
        )}
      </div>
    </section>
  );
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">
            Comunicación pública
          </p>
          <h1 className="mt-1 text-2xl font-bold">Constructor de landing</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Crea una página con bloques responsive, imágenes y branding. El
            borrador no modifica lo que ve el público.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save("draft")}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Guardar borrador
          </button>
          <button
            type="button"
            onClick={() => void save("publish")}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {saving ? "Guardando…" : "Publicar"}
          </button>
        </div>
      </header>
      {message && (
        <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </p>
      )}
      <section className="mt-6 rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold">
              <Globe2 className="h-5 w-5 text-emerald-700" />
              Direcciones públicas
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              La versión publicada aparece en estas direcciones.
            </p>
          </div>
          <Link
            to="/admin/eventos"
            className="text-sm font-semibold text-emerald-700"
          >
            Configurar dominio de organización
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { label: "Subdominio EventPass", url: subdomain },
            { label: "Dominio propio", url: customDomain },
          ].map(({ label, url }) => (
            <article
              key={label}
              className="rounded-xl border border-zinc-200 p-4"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                {label}
              </p>
              {url ? (
                <>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all font-semibold text-emerald-700 hover:underline"
                  >
                    {url}
                  </a>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void copyUrl(url)}
                      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver publicada
                    </a>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No configurado.</p>
              )}
            </article>
          ))}
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,.8fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-emerald-700" />
              <h2 className="font-bold">Plantilla base</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["summit", "Cumbre", "Editorial para congresos"],
                  ["expo", "Exposición", "Comercial para feria y expo"],
                  ["minimal", "Minimal", "Convocatoria directa"],
                ] as const
              ).map(([value, title, detail]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyTemplate(value)}
                  className={`rounded-xl border p-4 text-left ${draft.template === value ? "border-emerald-600 bg-emerald-50" : "border-zinc-200 hover:border-emerald-300"}`}
                >
                  <b className="block">{title}</b>
                  <span className="mt-1 block text-xs text-zinc-600">
                    {detail}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Cambiar plantilla reemplaza el orden de bloques. Tus textos e
              imágenes se conservan.
            </p>
          </section>
          <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-bold">Identidad del evento</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Este logo y color se aplican a la landing, registro, mapa y pantallas públicas.
          </p>
          <label className="mt-4 block text-sm font-semibold">
            Nombre visible del evento
            <input
              placeholder={event?.name}
              value={draft.brand_name ?? ''}
              onChange={(e) => set('brand_name', e.target.value)}
              className={input}
            />
          </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Antetítulo
                <input
                  value={draft.eyebrow ?? ""}
                  onChange={(e) => set("eyebrow", e.target.value)}
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                Botón de registro
                <input
                  value={draft.cta_label ?? ""}
                  onChange={(e) => set("cta_label", e.target.value)}
                  className={input}
                />
              </label>
            </div>
            <label className="mt-4 block text-sm font-semibold">
              Titular
              <input
                placeholder={event?.name}
                value={draft.headline ?? ""}
                onChange={(e) => set("headline", e.target.value)}
                className={input}
              />
            </label>
            <label className="mt-4 block text-sm font-semibold">
              Texto principal
              <textarea
                value={draft.subheadline ?? ""}
                onChange={(e) => set("subheadline", e.target.value)}
                className={`${input} min-h-24`}
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Color principal
                <span className="mt-2 flex items-center gap-2"><input type="color" value={draft.primary_color || "#00875a"} onChange={(e) => set("primary_color", e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border p-1" /><input value={draft.primary_color || "#00875a"} onChange={(e) => set("primary_color", e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 font-mono text-sm" aria-label="Código hexadecimal del color principal" /></span>
                <span className="mt-2 block rounded-md px-3 py-2 text-xs font-medium text-white" style={{ backgroundColor: draft.primary_color || "#00875a" }}>Color público activo: {draft.primary_color || "#00875a"}</span>
              </label>
              <label className="text-sm font-semibold">
                Ubicación
                <input
                  value={draft.location ?? ""}
                  onChange={(e) => set("location", e.target.value)}
                  className={input}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold">
                <ImagePlus className="h-4 w-4" />
                {uploading ? "Cargando…" : "Subir logo"}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/svg+xml,image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) =>
                    void uploadImage(e.target.files?.[0], "logo")
                  }
                />
              </label>
              {draft.logo_url ? <div className="flex min-w-0 items-center gap-3"><img src={draft.logo_url} alt="Vista previa del logo del evento" onLoad={() => setLogoState("ready")} onError={() => setLogoState("failed")} className="h-12 max-w-44 rounded bg-white p-1 object-contain" /><div className="min-w-0 text-xs"><p className={logoState === "failed" ? "font-bold text-red-700" : "font-bold text-emerald-700"}>{logoState === "verifying" ? "Verificando logo…" : logoState === "failed" ? "No se pudo mostrar el logo" : "Logo cargado y visible en el borrador"}</p><p className="mt-1 break-all text-zinc-500">{draft.logo_url}</p></div></div> : <p className="text-sm text-zinc-600">Aún no hay logo propio. No se usará el logo de la organización.</p>}
            </div>
          </section>
          {imageList("hero_images", "Imágenes del hero", "hero")}
          {imageList("gallery_images", "Galería", "gallery")}
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Bloques de la página</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Activa, edita y ordena las secciones visibles.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(blockMeta) as LandingBlockType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addBlock(type)}
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold text-emerald-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {blockMeta[type].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {(draft.blocks ?? []).map((block, index) => (
                <article
                  key={block.id}
                  className="rounded-xl border border-zinc-200 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={block.enabled}
                        onChange={(e) =>
                          updateBlock(block.id, { enabled: e.target.checked })
                        }
                        className="mt-1"
                      />
                      <span>
                        <b className="block">{blockMeta[block.type].label}</b>
                        <span className="mt-1 block text-xs text-zinc-600">
                          {blockMeta[block.type].detail}
                        </span>
                      </span>
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveBlock(index, -1)}
                        disabled={index === 0}
                        className="rounded border p-1.5 disabled:opacity-30"
                        aria-label="Subir bloque"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(index, 1)}
                        disabled={index === (draft.blocks ?? []).length - 1}
                        className="rounded border p-1.5 disabled:opacity-30"
                        aria-label="Bajar bloque"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(block.id)}
                        className="rounded border p-1.5 text-red-700"
                        aria-label="Eliminar bloque"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      Título del bloque
                      <input
                        value={block.title ?? ""}
                        onChange={(e) =>
                          updateBlock(block.id, { title: e.target.value })
                        }
                        className={input}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Texto del bloque
                      <textarea
                        value={block.body ?? ""}
                        onChange={(e) =>
                          updateBlock(block.id, { body: e.target.value })
                        }
                        className={`${input} min-h-20`}
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="sticky top-5 rounded-2xl border bg-zinc-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-300">
              Control de publicación
            </p>
            <h2 className="mt-2 text-xl font-bold">
              Diseña con libertad. Publica con control.
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Los cambios quedan en borrador hasta que publiques. Las secciones
              se conectan a la agenda, registro y exposición reales.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={() => void save("draft")}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Guardar borrador
              </button>
              <button
                type="button"
                onClick={() => void save("publish")}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Publicar cambios
              </button>
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="font-bold">Opciones conectadas</h2>
            <fieldset className="mt-4 grid gap-3 text-sm font-semibold">
              <label>
                <input
                  checked={draft.show_agenda !== false}
                  onChange={(e) => set("show_agenda", e.target.checked)}
                  type="checkbox"
                />{" "}
                Mostrar agenda
              </label>
              <label>
                <input
                  checked={draft.show_exhibition !== false}
                  onChange={(e) => set("show_exhibition", e.target.checked)}
                  type="checkbox"
                />{" "}
                Mostrar exposición
              </label>
              <label>
                <input
                  checked={draft.show_interest !== false}
                  onChange={(e) => set("show_interest", e.target.checked)}
                  type="checkbox"
                />{" "}
                Mostrar solicitud de información
              </label>
            </fieldset>
            <label className="mt-5 block text-sm font-semibold">
              URL de folleto
              <input
                type="url"
                value={draft.brochure_url ?? ""}
                onChange={(e) => set("brochure_url", e.target.value)}
                className={input}
                placeholder="https://…"
              />
            </label>
            <label className="mt-4 block text-sm font-semibold">
              Texto del folleto
              <input
                value={draft.brochure_label ?? ""}
                onChange={(e) => set("brochure_label", e.target.value)}
                className={input}
              />
            </label>
          </section>
        </aside>
      </div>
    </main>
  );
}
