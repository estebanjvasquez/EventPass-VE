import { supabase } from './supabase';

type Visit = { id: string; eventId: string; programId: string | null; campaign?: string; source?: string; medium?: string; expires: number };
const memory = new Map<string, Visit>();
const pending = new Map<string, Promise<boolean>>();
const clean = (value: string | null) => value?.trim().slice(0, 100) || undefined;

export function campaignVisit(eventId: string, programId: string | null = null): Visit {
  const key = `event-funnel:${eventId}:${programId ?? ''}`;
  const activeKey = `event-funnel-active:${eventId}`;
  const params = new URLSearchParams(window.location.search);
  const incoming = { campaign: clean(params.get('utm_campaign')), source: clean(params.get('utm_source')), medium: clean(params.get('utm_medium')) };
  let previous = memory.get(key);
  try { previous = JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? previous; } catch { /* Memory fallback for restricted storage. */ }
  // An individual registration can continue the most recent visit to this
  // same event's shared landing. Never inherit another event's visit.
  if (!programId) {
    let recent = memory.get(activeKey);
    try { recent = JSON.parse(sessionStorage.getItem(activeKey) ?? 'null') ?? recent; } catch { /* Memory fallback. */ }
    if (recent?.eventId === eventId && recent.expires > Date.now()) previous = recent;
  }
  const hasTags = !!(incoming.campaign || incoming.source || incoming.medium);
  if (previous && previous.expires > Date.now() && (!hasTags || (previous.campaign === incoming.campaign && (!incoming.source || previous.source === incoming.source) && (!incoming.medium || previous.medium === incoming.medium)))) return previous;
  let referral: string | undefined;
  try { const host = new URL(document.referrer).hostname; if (host !== window.location.hostname) referral = host; } catch { /* No referrer. */ }
  const visit: Visit = { id: crypto.randomUUID(), eventId, programId, ...incoming, source: incoming.source ?? (hasTags ? 'utm_sin_origen' : referral ?? 'direct'), medium: incoming.medium ?? (referral && !hasTags ? 'referral' : undefined), expires: Date.now() + 30 * 60_000 };
  memory.set(key, visit);
  memory.set(activeKey, visit);
  try { sessionStorage.setItem(key, JSON.stringify(visit)); } catch { /* Continue with memory. */ }
  try { sessionStorage.setItem(activeKey, JSON.stringify(visit)); } catch { /* Continue with memory. */ }
  return visit;
}

export async function trackVisit(eventId: string, programId: string | null, stage: 'landing' | 'form') {
  const visit = campaignVisit(eventId, programId);
  const key = `${visit.id}:${stage}`;
  if (stage === 'form') await pending.get(`${visit.id}:landing`);
  if (!pending.has(key)) pending.set(key, (async () => {
    try {
      const { error } = await supabase.rpc('track_event_visit', { p_visit_id: visit.id, p_event_id: eventId, p_program_id: visit.programId, p_stage: stage, p_campaign: visit.campaign, p_source: visit.source, p_medium: visit.medium });
      return !error;
    } catch { return false; }
  })());
  const ok = await pending.get(key);
  if (!ok) pending.delete(key);
  return ok ? visit.id : null;
}

export function registrationCampaignUrl(url: string, eventId: string, programId: string | null) {
  const visit = campaignVisit(eventId, programId);
  const target = new URL(url, window.location.origin);
  for (const [key, value] of Object.entries({ utm_campaign: visit.campaign, utm_source: visit.source, utm_medium: visit.medium })) if (value) target.searchParams.set(key, value);
  if (programId) target.searchParams.set('ep_event', eventId);
  return target.origin === window.location.origin ? target.pathname + target.search + target.hash : target.href;
}
