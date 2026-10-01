import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type Counts = { visits: number; starts: number; completions: number; form_only: number };
type Campaign = { id: string; name: string; source: string; medium: string; site_id: string | null; archived: boolean };
type Destination = { site_id: string | null; program_id: string | null; label: string; url: string };
type Breakdown = Counts & { campaign_id: string | null; campaign: string | null; source: string; medium: string | null };
type Report = { totals: Counts; campaigns: Campaign[]; breakdown: Breakdown[]; legacy_events: number; tracking_since: string | null };
const zero: Counts = { visits: 0, starts: 0, completions: 0, form_only: 0 };
const sources: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', x: 'X', whatsapp: 'WhatsApp', email: 'Correo', other: 'Otro', direct: 'Directo / sin origen identificado', utm_sin_origen: 'Enlace etiquetado sin origen' };
const media: Record<string, string> = { social: 'Publicación orgánica', paid_social: 'Anuncio pagado', email: 'Correo', referral: 'Referencia' };
const rate = (counts: Counts) => counts.visits ? `${(counts.completions / counts.visits * 100).toLocaleString('es-VE', { maximumFractionDigits: 1 })}%` : '—';
const inputClass = 'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2';

export default function EventConversions() {
  const { eventId } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [source, setSource] = useState('instagram');
  const [medium, setMedium] = useState('social');
  const [siteId, setSiteId] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError('');
    const [metrics, targets] = await Promise.all([
      supabase.rpc('get_event_campaign_dashboard', { p_event_id: eventId, p_from: period === 'all' ? null : new Date(Date.now() - Number(period) * 86400000).toISOString() }),
      supabase.rpc('event_promotion_destinations', { p_event_id: eventId }),
    ]);
    if (current !== generation.current) return;
    setLoading(false);
    if (metrics.error || targets.error) { setError(metrics.error?.message ?? targets.error!.message); setReport(null); return; }
    setReport(metrics.data as Report);
    const available = (targets.data ?? []) as Destination[];
    setDestinations(available);
    setSiteId(previous => available.some(item => (item.site_id ?? '') === previous) ? previous : available[0]?.site_id ?? '');
  }, [eventId, period]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void load(); return invalidate; }, [load, invalidate]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const result = await supabase.rpc('create_event_campaign', { p_event_id: eventId, p_name: name, p_source: source, p_medium: medium, p_site_id: siteId || null });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setName(''); await load(); setMessage('Campaña creada. Copia su enlace y úsalo en la publicación o anuncio de la red social.');
  }
  async function archive(campaign: Campaign) {
    setBusy(true); setError('');
    const result = await supabase.rpc('archive_event_campaign', { p_campaign_id: campaign.id, p_archived: !campaign.archived });
    setBusy(false);
    if (result.error) setError(result.error.message); else await load();
  }
  function urlFor(campaign: Campaign) {
    const target = campaign.site_id ? destinations.find(item => item.site_id === campaign.site_id) : { url: `https://eventosfacil.net/evento/${eventId}`, program_id: null };
    if (!target) return null;
    const url = new URL(target.url);
    url.searchParams.set('utm_campaign', campaign.id); url.searchParams.set('utm_source', campaign.source); url.searchParams.set('utm_medium', campaign.medium);
    if (target.program_id) url.searchParams.set('ep_event', eventId!);
    return url.href;
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setMessage('Enlace copiado.'); }
    catch { setMessage('Selecciona y copia el enlace del campo de texto.'); }
  }
  const counts = report?.totals ?? zero;
  const rows = [
    ...(report?.campaigns ?? []).map(campaign => ({ key: campaign.id, label: campaign.name + (campaign.archived ? ' (archivada)' : ''), source: campaign.source, medium: campaign.medium, ...(report?.breakdown.find(row => row.campaign_id === campaign.id) ?? zero) })),
    ...(report?.breakdown ?? []).filter(row => !row.campaign_id).map((row, index) => ({ key: `origin-${index}`, label: row.campaign ? `Enlace UTM externo: ${row.campaign}` : 'Sin campaña', ...row })),
  ];
  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-7">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">Promoción y conversiones</h1><p className="mt-2 text-sm text-zinc-600">Crea enlaces de campaña que llevan a la página principal del evento y mide cuántas visitas terminan en registro.</p></div><Link className="font-semibold text-emerald-700" to={`/admin/eventos/${eventId}/registros`}>Revisar registros</Link></header>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-4">{message}</p>}
    <div className="my-5 flex flex-wrap items-end gap-4"><label className="text-sm">Periodo de llegada<select className={inputClass} value={period} onChange={event => setPeriod(event.target.value)}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="all">Desde el inicio de la medición</option></select></label><button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={loading} onClick={() => void load()}>Actualizar</button>{loading && <p role="status">Cargando resultados…</p>}</div>
    {report && !loading && <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[{ label: 'Visitas a la página principal', value: counts.visits }, { label: 'Visitas que abrieron el registro', value: counts.starts }, { label: 'Visitas que completaron el registro', value: counts.completions }, { label: 'Conversión de la página', value: rate(counts) }].map(item => <article key={item.label} className="rounded-xl border bg-white p-5"><h2 className="text-sm text-zinc-600">{item.label}</h2><p className="mt-3 text-3xl font-bold">{item.value}</p></article>)}</section>
      <p className="mt-4 text-sm leading-6 text-zinc-600">Una visita es una sesión de 30 minutos en la misma pestaña y evento; recargar no suma otra visita. El origen se conserva hasta completar el registro. Cambiar de campaña inicia otra sesión. Registro completado significa inscripción creada, aunque el pago o la aprobación estén pendientes. Las visitas pueden incluir bots y no equivalen a personas únicas.</p>
      <p className="mt-2 text-sm text-zinc-600">Registros desde un enlace directo al formulario, sin visita a la página principal: <strong>{counts.form_only}</strong>. Se muestran aparte y no se incluyen en la conversión de la página.</p>
      <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">Resultados por campaña y origen</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Campaña', 'Origen', 'Medio', 'Visitas', 'Abrieron registro', 'Completaron', 'Conversión', 'Sólo formulario'].map(label => <th key={label} className="whitespace-nowrap border-b p-2">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.key}><td className="border-b p-2">{row.label}</td><td className="border-b p-2">{sources[row.source] ?? row.source}</td><td className="border-b p-2">{media[row.medium ?? ''] ?? row.medium ?? '—'}</td>{[row.visits, row.starts, row.completions, rate(row), row.form_only].map((value, index) => <td key={index} className="border-b p-2">{value}</td>)}</tr>)}</tbody></table></div>{!rows.length && <p className="mt-4 text-sm text-zinc-500">Todavía no hay visitas medidas ni campañas creadas.</p>}</section>
    </>}
    <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">Crear campaña</h2><p className="mt-2 text-sm text-zinc-600">Genera un enlace para compartir en una publicación o anuncio. La publicación y el presupuesto se gestionan en la propia red social.</p><form onSubmit={event => void create(event)} className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">Nombre de campaña<input className={inputClass} required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="Lanzamiento · Instagram · octubre" /></label><label className="text-sm">Red u origen<select className={inputClass} value={source} onChange={event => setSource(event.target.value)}>{Object.entries(sources).filter(([key]) => !['direct', 'utm_sin_origen'].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">Medio<select className={inputClass} value={medium} onChange={event => setMedium(event.target.value)}>{Object.entries(media).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">Página de destino<select className={inputClass} value={siteId} onChange={event => setSiteId(event.target.value)}>{destinations.map(target => <option key={target.site_id ?? 'default'} value={target.site_id ?? ''}>{target.label}</option>)}</select></label><button disabled={busy || loading || !destinations.length} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Crear campaña y enlace'}</button></form></section>
    <section className="mt-6 space-y-4"><h2 className="text-lg font-bold">Enlaces de campañas</h2>{report?.campaigns.map(campaign => { const url = urlFor(campaign); return <article key={campaign.id} className="rounded-xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">{campaign.name}{campaign.archived && ' · Archivada'}</h3><button disabled={busy} onClick={() => void archive(campaign)} className="text-sm text-zinc-600 underline">{campaign.archived ? 'Reactivar' : 'Archivar'}</button></div><p className="mt-1 text-sm text-zinc-500">{sources[campaign.source]} · {media[campaign.medium]}</p>{url ? <div className="mt-3 flex flex-wrap gap-2"><input aria-label={`Enlace de ${campaign.name}`} className="min-w-0 flex-1 rounded-lg border p-2 text-sm" readOnly value={url} onFocus={event => event.target.select()} /><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => void copy(url)}>Copiar enlace</button></div> : <p className="mt-3 text-sm text-amber-800">La página de destino ya no está activa. Reactívala antes de compartir esta campaña.</p>}</article>; })}<p className="text-xs text-zinc-500">Archivar organiza la lista; los enlaces ya compartidos siguen atribuyendo resultados a su campaña.</p></section>
    {!!report?.legacy_events && <aside className="mt-6 rounded-xl bg-amber-50 p-4 text-sm">Hay {report.legacy_events} interacciones históricas del contador anterior. No se mezclan con este embudo: antes se contaba la apertura del formulario como visita y no se conservaba todo el recorrido.</aside>}
  </main>;
}
