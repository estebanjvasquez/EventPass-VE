import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { AgendaSettings, SponsorMode } from '../../lib/publicAgendaDesign';
import { boundedNumber } from '../../lib/publicAgendaDesign';
export type AgendaSponsor = { name: string; logo_url?: string | null };

function SponsorBadge({ sponsor, mode, size }: { sponsor: AgendaSponsor; mode: SponsorMode; size: number }) {
  const [failed, setFailed] = useState(false);
  const logo = mode !== 'names' && sponsor.logo_url && !failed;
  return <span className="agenda-sponsor-badge">
    {logo && <img src={sponsor.logo_url!} alt={mode === 'logos' ? sponsor.name : ''} onError={() => setFailed(true)} style={{ height: size, width: size * 2.5 }} />}
    {(mode !== 'logos' || !logo) && <span>{sponsor.name}</span>}
  </span>;
}
export function AgendaSponsors({ sponsors, mode, size = 40 }: { sponsors: AgendaSponsor[]; mode: SponsorMode; size?: number }) {
  if (mode === 'none' || !sponsors.length) return null;
  return <div className="agenda-sponsors" aria-label="Patrocinantes de la actividad">{sponsors.map((sponsor, i) => <SponsorBadge key={`${sponsor.name}-${sponsor.logo_url}-${i}`} sponsor={sponsor} mode={mode} size={size} />)}</div>;
}
export function SponsorTicker({ sponsors, mode, settings, preview }: { sponsors: AgendaSponsor[]; mode: SponsorMode; settings: AgendaSettings; preview: boolean }) {
  const [paused, setPaused] = useState(false);
  const visible = mode === 'none' ? [] : sponsors;
  if (!visible.length && !settings.ticker_text?.trim()) return null;
  const animated = settings.ticker_animated !== false;
  const staticAlign = settings.ticker_static_align === 'left' ? 'left' : 'center';
  const content = <>{settings.ticker_text?.trim() && <span className="agenda-ticker-message">{settings.ticker_text}</span>}{visible.map((sponsor, i) => <SponsorBadge key={`${sponsor.name}-${sponsor.logo_url}-${i}`} sponsor={sponsor} mode={mode} size={boundedNumber(settings.logo_size, 48, 32, 80)} />)}</>;
  return <footer className={`agenda-sponsor-footer ${preview ? 'is-preview' : ''} ${!animated ? 'is-static' : ''}`} aria-label="Cintillo del evento">
    {animated && <button type="button" className="agenda-motion-toggle" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Reanudar cintillo' : 'Pausar cintillo'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>}
    <div className={`agenda-marquee ${animated ? 'is-animated' : `is-static is-${staticAlign}`} ${paused ? 'is-paused' : ''}`} style={{ ['--ticker-duration' as string]: `${boundedNumber(settings.ticker_seconds, 45, 20, 120)}s`, ['--ticker-direction' as string]: settings.ticker_direction === 'right' ? 'reverse' : 'normal' }}>
      <div className="agenda-marquee-track"><div className="agenda-marquee-group">{content}</div>{animated && <div className="agenda-marquee-group agenda-marquee-copy" aria-hidden="true">{content}</div>}</div>
    </div>
  </footer>;
}
