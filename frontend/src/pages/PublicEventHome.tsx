import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import EventPublicLanding, { type LandingEvent } from '../components/EventPublicLanding';
import { supabase } from '../lib/supabase';
import { useTenant } from '../lib/useTenant';

export default function PublicEventHome() {
  const { eventId } = useParams();
  const { tenant, loading: tenantLoading } = useTenant();
  const [event, setEvent] = useState<LandingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (tenantLoading) return;
    let active = true;
    setLoading(true);
    let query = supabase.from('events').select('id,name,description,event_type,start_date,config').eq('id', eventId).eq('status', 'published');
    if (tenant) query = query.eq('organization_id', tenant.id);
    void query.maybeSingle().then(({ data }) => {
      if (active) { setEvent(data as LandingEvent | null); setLoading(false); }
    });
    return () => { active = false; };
  }, [eventId, tenant, tenantLoading]);
  if (loading) return <main className="p-8">Cargando evento…</main>;
  if (!event) return <main className="p-8"><h1>Evento no disponible</h1></main>;
  return <EventPublicLanding event={event} />;
}
