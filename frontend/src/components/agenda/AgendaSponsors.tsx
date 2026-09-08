import { useEffect, useRef, useState } from 'react';
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
  const trackRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const pausedRef = useRef(false);
  const [loopDistance, setLoopDistance] = useState(0);
  const visible = mode === 'none' ? [] : sponsors;
  const animated = settings.ticker_animated !== false;
  const staticAlign = settings.ticker_static_align === 'left' ? 'left' : 'center';
  const duration = boundedNumber(settings.ticker_seconds, 45, 20, 120) * 1_000;
  const direction = settings.ticker_direction === 'right' ? 'right' : 'left';

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const measure = () => {
      const nextDistance = Math.round(group.getBoundingClientRect().width);
      setLoopDistance(currentDistance => currentDistance === nextDistance ? currentDistance : nextDistance);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => observer.disconnect();
  }, [visible.length, settings.ticker_text, settings.logo_size, mode]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) animationRef.current?.pause();
    else animationRef.current?.play();
  }, [paused]);

  useEffect(() => {
    const track = trackRef.current;
    if (!animated || !track || loopDistance <= 0) return;
    const keyframes = direction === 'right'
      ? [{ transform: `translate3d(-${loopDistance}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }]
      : [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(-${loopDistance}px, 0, 0)` }];
    const animation = track.animate(keyframes, { duration, iterations: Infinity, easing: 'linear' });
    animationRef.current = animation;
    if (pausedRef.current) animation.pause();
    return () => { animation.cancel(); animationRef.current = null; };
  }, [animated, direction, duration, loopDistance]);

  function togglePause() {
    const nextPaused = !paused;
    setPaused(nextPaused);
  }

  if (!visible.length && !settings.ticker_text?.trim()) return null;
  const content = <>{settings.ticker_text?.trim() && <span className="agenda-ticker-message">{settings.ticker_text}</span>}{visible.map((sponsor, i) => <SponsorBadge key={`${sponsor.name}-${sponsor.logo_url}-${i}`} sponsor={sponsor} mode={mode} size={boundedNumber(settings.logo_size, 48, 32, 80)} />)}</>;
  return <footer className={`agenda-sponsor-footer ${preview ? 'is-preview' : ''} ${!animated ? 'is-static' : ''}`} aria-label="Cintillo del evento">
    {animated && <button type="button" className="agenda-motion-toggle" onClick={togglePause} aria-label={paused ? 'Reanudar cintillo' : 'Pausar cintillo'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>}
    <div className={`agenda-marquee ${animated ? 'is-animated' : `is-static is-${staticAlign}`} ${paused ? 'is-paused' : ''}`}>
      <div ref={trackRef} className="agenda-marquee-track"><div ref={groupRef} className="agenda-marquee-group">{content}</div>{animated && <div className="agenda-marquee-group agenda-marquee-copy" aria-hidden="true">{content}</div>}</div>
    </div>
  </footer>;
}
