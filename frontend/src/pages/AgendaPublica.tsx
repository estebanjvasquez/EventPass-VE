import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  AgendaDisplay,
  type AgendaItem,
} from "../components/agenda/AgendaDisplay";
import { resolvePublicEventBrand } from "../lib/eventBranding";
const refreshSeconds = (value: unknown) =>
  Math.min(
    300,
    Math.max(
      10,
      Number.isFinite(Number(value)) ? Math.round(Number(value)) : 15,
    ),
  );
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
  const [eventBranding, setEventBranding] =
    useState<AgendaItem["event_branding"]>(null);
  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    const load = async () => {
      const [{ data, error: requestError }, { data: event }] =
        await Promise.all([
          supabase.rpc("get_public_forum_agenda", { p_event_id: eventId }),
          supabase
            .from("events")
            .select("name,config,organizations(name,branding)")
            .eq("id", eventId)
            .maybeSingle(),
        ]);
      if (!alive) return;
      setLoading(false);
      if (requestError) {
        setError("La agenda pública todavía no está disponible.");
        return;
      }
      const next = (data ?? []) as AgendaItem[];
      const organization = Array.isArray(event?.organizations)
        ? event.organizations[0]
        : event?.organizations;
      const brand = resolvePublicEventBrand(event, organization ?? null);
      setEventBranding({
        logo_url: brand.logo_url ?? undefined,
        color: brand.color,
      });
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
  return (
    <AgendaDisplay
      items={items.map((item) => ({
        ...item,
        event_branding: eventBranding ?? item.event_branding,
      }))}
      error={error}
      loading={loading}
    />
  );
}
