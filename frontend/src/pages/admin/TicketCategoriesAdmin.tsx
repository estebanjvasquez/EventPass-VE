import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { purchasePrice, type TicketCategory } from "../../lib/participant";
import { agendaInstant, agendaWallTime } from "../../lib/programAgenda";
import { supabase } from "../../lib/supabase";

type Draft = { id?: string; name: string; description: string; benefits: string; price: string; currency: string; capacity: string; sales_start: string; sales_end: string; published: boolean };
const empty: Draft = { name: "", description: "", benefits: "", price: "0", currency: "USD", capacity: "", sales_start: "", sales_end: "", published: false };
const input = "mt-1 w-full rounded-lg border p-3";

export default function TicketCategoriesAdmin() {
  const { eventId } = useParams();
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [enabled, setEnabled] = useState(false);
  const [timezone, setTimezone] = useState("America/Caracas");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setReady(false);
    void Promise.all([
      supabase.from("event_ticket_categories").select("*").eq("event_id", eventId!).order("name"),
      supabase.from("events").select("config").eq("id", eventId!).single(),
    ]).then(([categoryResult, eventResult]) => {
      if (!active) return;
      if (categoryResult.error || eventResult.error) {
        setMessage(categoryResult.error?.message ?? eventResult.error?.message ?? "No se pudo cargar");
        return;
      }
      setCategories(categoryResult.data as TicketCategory[]);
      setEnabled(eventResult.data.config?.ticket_categories_enabled === true);
      setTimezone(typeof eventResult.data.config?.timezone === "string" ? eventResult.data.config.timezone : "America/Caracas");
      setReady(true);
    });
    return () => { active = false; };
  }, [eventId, revision]);

  function edit(category: TicketCategory) {
    setDraft({ id: category.id, name: category.name, description: category.description, benefits: category.benefits.join("\n"), price: String(category.price), currency: category.currency, capacity: category.capacity == null ? "" : String(category.capacity), sales_start: category.sales_start ? agendaWallTime(category.sales_start, timezone) : "", sales_end: category.sales_end ? agendaWallTime(category.sales_end, timezone) : "", published: category.published === true });
  }

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const values = { ...draft, price: Number(draft.price), capacity: draft.capacity === "" ? null : Number(draft.capacity), benefits: draft.benefits.split("\n").map((text) => text.trim()).filter(Boolean), sales_start: draft.sales_start ? agendaInstant(draft.sales_start, timezone) : null, sales_end: draft.sales_end ? agendaInstant(draft.sales_end, timezone) : null };
      if (values.sales_start && values.sales_end && values.sales_end <= values.sales_start) { setMessage("El fin de venta debe ser posterior al inicio."); return; }
      const { error, data } = await supabase.rpc("save_ticket_category", { p_event_id: eventId, p_category_id: draft.id ?? null, p_values: values });
      if (error || !data) { setMessage(error?.message ?? "No se pudo guardar"); return; }
      setDraft(empty); setRevision((value) => value + 1); setMessage("Categoría guardada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar. Revisa las fechas y la conexión.");
    } finally { setBusy(false); }
  }

  async function toggle() {
    setBusy(true);
    try {
      const { error, data } = await supabase.rpc("set_ticket_categories_enabled", { p_event_id: eventId, p_enabled: !enabled });
      if (error) { setMessage(error.message); return; }
      setEnabled(data === true);
      setMessage(data ? "Categorías activadas. Su precio sustituye al precio del asiento." : "Categorías desactivadas para nuevos registros.");
    } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-4xl p-5 sm:p-8">
    <h1 className="text-2xl font-bold">Categorías de entradas</h1>
    <p className="mt-3 text-zinc-600">Una categoría por participante. Su precio sustituye al precio del asiento; no se suman.</p>
    {message && <p role="status" className="mt-4 rounded-lg bg-zinc-100 p-4">{message}</p>}
    <button disabled={!ready || busy} onClick={() => void toggle()} className="mt-5 rounded-lg border px-4 py-3 disabled:opacity-50">{enabled ? "Desactivar categorías" : "Activar categorías"}</button>
    {!ready ? <div className="mt-5 h-28 animate-pulse rounded-xl bg-zinc-100" /> : <div className="mt-5 grid gap-4 sm:grid-cols-2">{categories.map((category) => <article key={category.id} className="rounded-xl border bg-white p-4"><h2 className="font-semibold">{category.name}</h2><p>{purchasePrice(category.price, category.currency)} · {category.published ? "Publicada" : "Borrador"}</p><p>Cupo: {category.capacity ?? "Sin límite propio"}</p><button disabled={busy} onClick={() => edit(category)} className="mt-3 font-semibold text-emerald-700">Editar</button></article>)}</div>}
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="mt-8 grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
      <h2 className="font-bold sm:col-span-2">{draft.id ? "Editar categoría" : "Nueva categoría"}</h2>
      <label>Nombre<input required minLength={2} maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={input} /></label>
      <label>Precio<input required type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} className={input} /></label>
      <label>Moneda<select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} className={input}>{["USD", "VES", "COP"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      <label>Cupo (vacío: sin límite propio)<input type="number" min="0" step="1" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} className={input} /></label>
      <label className="sm:col-span-2">Descripción<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={input} /></label>
      <label className="sm:col-span-2">Beneficios (uno por línea)<textarea value={draft.benefits} onChange={(event) => setDraft({ ...draft, benefits: event.target.value })} className={input} /></label>
      <p className="text-sm text-zinc-600 sm:col-span-2">Las ventanas usan la zona horaria del evento: <strong>{timezone}</strong>.</p>
      <label>Inicio de venta<input type="datetime-local" value={draft.sales_start} onChange={(event) => setDraft({ ...draft, sales_start: event.target.value })} className={input} /></label>
      <label>Fin de venta<input type="datetime-local" value={draft.sales_end} onChange={(event) => setDraft({ ...draft, sales_end: event.target.value })} className={input} /></label>
      <label className="sm:col-span-2"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /> Publicada para venta</label>
      <div className="flex gap-3 sm:col-span-2"><button disabled={!ready || busy} className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar categoría"}</button><button type="button" onClick={() => setDraft(empty)} className="rounded-lg border px-4 py-3">Cancelar edición</button></div>
    </form>
  </main>;
}
