import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Home } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function PlanoPublicarAdmin() {
  const { eventId } = useParams<{ eventId: string }>();
  const [mapId, setMapId] = useState("");
  const [published, setPublished] = useState(false);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Cargando…");

  useEffect(() => {
    if (!eventId) return;
    void Promise.all([
      supabase.from("venue_maps").select("id,published").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("events").select("config").eq("id", eventId).maybeSingle(),
    ]).then(([mapResult, eventResult]) => {
      if (mapResult.error || eventResult.error) {
        setMessage(mapResult.error?.message ?? eventResult.error?.message ?? "No se pudo cargar.");
        return;
      }
      setMapId(mapResult.data?.id ?? "");
      setPublished(Boolean(mapResult.data?.published));
      setPublicEnabled(eventResult.data?.config?.public_floorplan_visible === true);
      setMessage("");
    });
  }, [eventId]);

  async function toggle() {
    if (!mapId) return;
    const nextPublished = !(published && publicEnabled);
    setBusy(true);
    const result = await supabase.rpc("publish_floor_plan", { p_map_id: mapId, p_published: nextPublished });
    if (result.error) {
      setMessage(result.error.message);
      setBusy(false);
      return;
    }
    const [mapCheck, eventCheck] = await Promise.all([
      supabase.from("venue_maps").select("published").eq("id", mapId).maybeSingle(),
      supabase.from("events").select("config").eq("id", eventId).maybeSingle(),
    ]);
    const mapMatches = Boolean(mapCheck.data?.published) === nextPublished;
    const eventMatches = (eventCheck.data?.config?.public_floorplan_visible === true) === nextPublished;
    setBusy(false);
    if (mapCheck.error || eventCheck.error || !mapMatches || !eventMatches) {
      setMessage(mapCheck.error?.message ?? eventCheck.error?.message ?? "La publicación no quedó sincronizada. No se mostrará como completada.");
      return;
    }
    setPublished(nextPublished);
    setPublicEnabled(nextPublished);
    setMessage(nextPublished ? "Plano publicado y acceso público habilitado." : "Plano retirado y acceso público deshabilitado.");
  }

  const fullyPublished = published && publicEnabled;
  const inconsistent = published !== publicEnabled;
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6">
        <Link to={`/admin/eventos/${eventId}/administrar`} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Home className="h-4 w-4" /> Admin del evento
        </Link>
        <h1 className="mt-6 text-2xl font-bold">Publicación del plano</h1>
        <p className="mt-2 text-sm text-slate-600">Esta acción publica el mapa y habilita su acceso público en una sola operación.</p>
        {inconsistent && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">Se detectó una publicación incompleta anterior. Pulsa “Corregir publicación”.</p>}
        <button type="button" disabled={!mapId || busy} onClick={() => void toggle()} className={`mt-6 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 ${fullyPublished ? "bg-slate-700" : "bg-emerald-700"}`}>
          {busy ? "Verificando…" : fullyPublished ? "Retirar publicación" : inconsistent ? "Corregir publicación" : "Publicar plano"}
        </button>
        {fullyPublished && <Link to={`/expo/${eventId}/plano`} target="_blank" className="ml-3 rounded-lg border px-4 py-3 text-sm font-semibold">Abrir vista pública</Link>}
        {message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
      </div>
    </main>
  );
}
