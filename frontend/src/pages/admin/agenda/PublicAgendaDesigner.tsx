import { cloneElement, useEffect, useId, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { agendaPresets, contrastRatio, sponsorMode, type AgendaSettings } from '../../../lib/publicAgendaDesign';
import { AgendaDisplay, type AgendaItem } from '../../../components/agenda/AgendaDisplay';

type Props = { event: { id: string; name: string; organization_id: string; config: Record<string, unknown> }; items: AgendaItem[]; onSaved: () => Promise<void> };
const fieldClass = 'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-emerald-600';
function Field({ title, children }: { title: string; children: ReactElement<{ id?: string }> }) { const id = useId(); return <div className="text-sm font-medium text-zinc-700"><label htmlFor={id} className="block">{title}</label>{cloneElement(children, { id })}</div>; }

export function PublicAgendaDesigner({ event, items, onSaved }: Props) {
  const initial = (event.config.public_agenda ?? {}) as AgendaSettings;
  const [draft, setDraft] = useState<AgendaSettings>(() => ({ ...initial }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [orientation, setOrientation] = useState('landscape');
  const [branding, setBranding] = useState<AgendaItem['event_branding']>(null);
  useEffect(() => {
    let active = true;
    void supabase.from('organizations').select('branding').eq('id', event.organization_id).maybeSingle().then(({ data }) => { if (active) setBranding(data?.branding ?? null); });
    return () => { active = false; };
  }, [event.organization_id]);
  function change<K extends keyof AgendaSettings>(key: K, value: AgendaSettings[K]) { setDraft(current => ({ ...current, [key]: value })); }
  const background = draft.background_color || '#101b24';
  const foreground = draft.text_color || '#f4f7fa';
  const accent = draft.accent_color || '#6ee7b7';
  const contrast = contrastRatio(background, foreground);
  const accentContrast = contrastRatio(background, accent);
  const invalidContrast = !Number.isFinite(contrast) || contrast < 4.5 || !Number.isFinite(accentContrast) || accentContrast < 4.5;
  const modes = [['logos', 'Solo logos'], ['names', 'Solo nombres'], ['both', 'Logos y nombres'], ['none', 'No mencionar']] as const;
  const stages = [...new Set(items.map(item => item.stage_name).filter((name): name is string => Boolean(name)))];
  async function save() {
    if (busy || invalidContrast) return;
    setBusy(true); setMessage('');
    try {
      const latest = await supabase.from('events').select('id,config').eq('id', event.id).single();
      if (latest.error) throw latest.error;
      const previous = latest.data.config ?? {};
      const config = { ...previous, public_agenda: { ...previous.public_agenda, ...draft, background_color: background, text_color: foreground, accent_color: accent } };
      const update = supabase.from('events').update({ config }).eq('id', event.id);
      const saved = await (latest.data.config == null ? update.is('config', null) : update.eq('config', JSON.stringify(previous))).select('id').maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) throw new Error('La configuración cambió en otra ventana o no tienes permiso para guardarla. Recarga antes de intentar de nuevo.');
      setMessage(draft.published ? 'Diseño guardado y pantalla publicada.' : 'Diseño guardado. La publicación conserva su estado actual.');
      await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuración.'); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 space-y-6">
    <div><h2 className="text-xl font-bold">Diseña la pantalla de tu evento</h2><p className="mt-2 max-w-3xl text-sm text-zinc-600">Elige una base visual y personaliza el contenido. La vista previa usa el mismo diseño que la pantalla publicada, sin publicar cambios hasta guardar.</p></div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
      <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <fieldset><legend className="mb-3 font-semibold">Plantilla de colores</legend><div className="space-y-2">{agendaPresets.map(preset => <button key={preset.name} type="button" onClick={() => setDraft(value => ({ ...value, background_color: preset.background_color, text_color: preset.text_color, accent_color: preset.accent_color }))} className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left hover:border-emerald-600"><span className="grid h-10 w-12 place-items-center rounded-lg font-bold" style={{ background: preset.background_color, color: preset.accent_color }}>Aa</span><span><strong className="block text-sm">{preset.name}</strong><span className="text-xs text-zinc-500">{preset.description}</span></span></button>)}</div></fieldset>
        <Field title="Título de la pantalla"><input className={fieldClass} value={draft.title ?? event.name} maxLength={140} onChange={e => change('title', e.target.value)} /></Field>
        <Field title="Subtítulo"><input className={fieldClass} value={draft.subtitle ?? 'Programación del evento'} maxLength={100} onChange={e => change('subtitle', e.target.value)} /></Field>
        <Field title="Distribución"><select className={fieldClass} value={draft.layout ?? 'cards'} onChange={e => change('layout', e.target.value as AgendaSettings['layout'])}><option value="cards">Tarjetas destacadas y programa</option><option value="timeline">Programa editorial en filas</option><option value="split">Panel lateral + programa (pantalla ancha)</option></select></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field title="Tipografía"><select className={fieldClass} value={draft.font_family ?? 'outfit'} onChange={e => change('font_family', e.target.value as AgendaSettings['font_family'])}><option value="outfit">Outfit moderna</option><option value="arial">Arial legible</option><option value="georgia">Georgia editorial</option><option value="mono">Monoespaciada</option></select></Field><Field title="Tamaño de lectura"><select className={fieldClass} value={draft.text_scale ?? 'normal'} onChange={e => change('text_scale', e.target.value as AgendaSettings['text_scale'])}><option value="compact">Compacto</option><option value="normal">Normal</option><option value="large">Grande / proyector</option></select></Field></div>
        <details className="rounded-xl border border-zinc-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Colores personalizados</summary><div className="mt-3 grid grid-cols-3 gap-2">{([['background_color','Fondo',background],['text_color','Texto',foreground],['accent_color','Acento',accent]] as const).map(([key,title,value]) => <Field key={key} title={title}><input type="color" className="mt-2 h-10 w-full" value={value} onChange={e => change(key,e.target.value)} /></Field>)}</div></details>
        <p role="status" className={`rounded-lg p-3 text-xs ${invalidContrast ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>Contraste texto {contrast.toFixed(1)}:1 · acento {accentContrast.toFixed(1)}:1. {invalidContrast ? 'Elige una plantilla o ajusta los colores hasta alcanzar 4.5:1 para guardar.' : 'Combinación apta para texto normal. Comprueba también la distancia real de lectura.'}</p>
        <fieldset className="space-y-2"><legend className="mb-3 font-semibold">Contenido del programa</legend>{([['show_schedule','Programa del día'],['show_current','Actividad en curso'],['show_next','Próxima actividad'],['show_clock','Reloj'],['show_speakers','Ponentes y moderadores'],['show_locations','Escenario o ubicación'],['show_cancelled','Actividades canceladas (con aviso)']] as const).map(([key,title]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft[key] !== false} onChange={e => change(key,e.target.checked)} />{title}</label>)}</fieldset>
        <Field title="Mostrar actividades de"><select className={fieldClass} value={draft.stage_filter ?? ''} onChange={e => change('stage_filter',e.target.value)}><option value="">Todos los escenarios</option>{stages.map(stage => <option key={stage}>{stage}</option>)}</select></Field>
        <fieldset className="space-y-3 border-t border-zinc-200 pt-4"><legend className="font-semibold">Patrocinantes</legend><Field title="En cada actividad"><select className={fieldClass} value={sponsorMode(draft,'activity')} onChange={e => change('activity_sponsors',e.target.value as AgendaSettings['activity_sponsors'])}>{modes.map(([value,title]) => <option key={value} value={value}>{title}</option>)}</select></Field><Field title="En el cintillo general"><select className={fieldClass} value={sponsorMode(draft,'event')} onChange={e => change('event_sponsors',e.target.value as AgendaSettings['event_sponsors'])}>{modes.map(([value,title]) => <option key={value} value={value}>{title}</option>)}</select></Field><p className="text-xs text-zinc-500">Usa los patrocinantes confirmados del evento y de cada actividad. Si falta un logo, se muestra el nombre para evitar un espacio vacío.</p></fieldset>
        <Field title="Mensaje del cintillo"><textarea className={fieldClass} rows={2} maxLength={500} value={draft.ticker_text ?? ''} onChange={e => change('ticker_text',e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.ticker_animated !== false} onChange={e => change('ticker_animated',e.target.checked)} />Logos y mensaje en movimiento</label>
        <div className="grid grid-cols-2 gap-3"><Field title="Velocidad del cintillo"><select className={fieldClass} value={draft.ticker_seconds ?? 45} onChange={e => change('ticker_seconds',Number(e.target.value))}><option value={90}>Lenta (90 s/vuelta)</option><option value={45}>Media (45 s/vuelta)</option><option value={25}>Rápida (25 s/vuelta)</option></select></Field><Field title="Dirección"><select className={fieldClass} value={draft.ticker_direction ?? 'left'} onChange={e => change('ticker_direction',e.target.value as 'left'|'right')}><option value="left">Hacia la izquierda</option><option value="right">Hacia la derecha</option></select></Field></div>
        <Field title="Tamaño de logos del cintillo"><select className={fieldClass} value={draft.logo_size ?? 48} onChange={e => change('logo_size',Number(e.target.value))}><option value={32}>Pequeños</option><option value={48}>Medianos</option><option value={64}>Grandes</option><option value={80}>Muy grandes</option></select></Field>
        <Field title="Consultar cambios cada"><select className={fieldClass} value={draft.refresh_seconds ?? 15} onChange={e => change('refresh_seconds',Number(e.target.value))}>{[10,15,30,60,120,300].map(value => <option key={value} value={value}>{value} segundos</option>)}</select></Field>
        <label className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950"><input type="checkbox" checked={draft.published === true} onChange={e => change('published',e.target.checked)} /><span>Publicar pantalla independientemente del registro. Si el evento ya está publicado, su agenda continúa accesible según las reglas actuales.</span></label>
        <button disabled={busy || invalidContrast} className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar configuración'}</button>
        {message && <p role="status" className="rounded-lg bg-zinc-100 p-3 text-sm">{message}</p>}
      </form>
      <aside className="min-w-0 space-y-3 xl:sticky xl:top-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Vista previa del programa real</h3><select aria-label="Formato de vista previa" value={orientation} onChange={e=>setOrientation(e.target.value)} className="rounded-lg border bg-white p-2 text-sm"><option value="landscape">Horizontal</option><option value="portrait">Vertical</option></select><Link to={`/e/${event.id}/agenda`} target="_blank" className="text-sm font-semibold text-emerald-700">Abrir pantalla guardada</Link></div><p className="text-xs text-zinc-500">El contenido se adapta al ancho disponible. Revisa el resultado en el televisor o proyector de destino antes del evento.</p><div className={`mx-auto max-h-[85dvh] overflow-auto rounded-2xl border border-zinc-300 ${orientation === 'portrait' ? 'max-w-[390px]' : ''}`}><AgendaDisplay items={items.map(item => ({...item, event_branding: branding}))} settings={{...draft, background_color: background, text_color: foreground, accent_color: accent, title: draft.title ?? event.name}} preview /></div>{!items.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Añade sesiones para ver el programa. No se muestran actividades ficticias.</p>}</aside>
    </div>
  </section>;
}
