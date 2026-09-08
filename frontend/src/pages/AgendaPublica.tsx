import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AgendaDisplay, type AgendaItem } from "../components/agenda/AgendaDisplay";
const refreshSeconds = (value: unknown) => Math.min(300, Math.max(10, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 15));
export default function AgendaPublica() {
  const { eventId } = useParams();
  return <AgendaScreen key={eventId} />;
}

function AgendaScreen() {
  const { eventId } = useParams();
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshEvery, setRefreshEvery] = useState(15);
  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    const load = async () => {
      const { data, error: requestError } = await supabase.rpc(
        "get_public_forum_agenda",
        { p_event_id: eventId },
      );
      if (!alive) return;
      setLoading(false);
      if (requestError) {
        setError("La agenda pública todavía no está disponible.");
        return;
      }
      const next = (data ?? []) as AgendaItem[];
      setItems(next);
      setRefreshEvery((current) => {
        const configured = refreshSeconds(
          next[0]?.public_agenda_config?.refresh_seconds,
        );
        return current === configured ? current : configured;
      });
      setError(
        next.length
          ? null
          : "El organizador aún no ha publicado sesiones para esta pantalla.",
      );
    };
    void load();
    const refresh = window.setInterval(() => void load(), refreshEvery * 1_000);
    return () => {
      alive = false;
      window.clearInterval(refresh);
    };
  }, [eventId, refreshEvery]);
  return <AgendaDisplay items={items} error={error} loading={loading} />;
}
