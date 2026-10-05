import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type Program = { id: string; organization_id: string; name: string; description: string | null; venue_name: string | null; starts_at: string | null; status: string; registration_config: Record<string, unknown> }
type Event = { id: string; name: string; event_type: string }
type RegistrationMode = 'separate' | 'unified' | 'modular' | 'hybrid'
type RegistrationPolicy = 'included' | 'optional_free' | 'optional_paid' | 'independent' | 'invite_only'
type ComponentConfig = { policy: RegistrationPolicy; price: string; currency: string; capacity: string }
const input = 'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900'
const emptyComponent = (): ComponentConfig => ({ policy: 'independent', price: '0', currency: 'USD', capacity: '' })

export default function ProgramaConfiguracionAdmin() {
  const { programId } = useParams()
  const [program, setProgram] = useState<Program | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [savedSelected, setSavedSelected] = useState<string[]>([])
  const [webEvent, setWebEvent] = useState('')
  const [savedWebEvent, setSavedWebEvent] = useState('')
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('separate')
  const [components, setComponents] = useState<Record<string, ComponentConfig>>({})
  const [siteUrl, setSiteUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.all([
      supabase.from('event_programs').select('id,organization_id,name,description,venue_name,starts_at,status,registration_config').eq('id', programId!).single(),
      supabase.from('program_events').select('event_id,registration_policy,registration_price,registration_currency,registration_capacity,events(id,name)').eq('program_id', programId!).order('event_id'),
      supabase.from('public_sites').select('slug,custom_hostname').eq('program_id', programId!).maybeSingle(),
    ]).then(async ([p, links, site]) => {
      if (!active) return
      if (p.error || links.error || site.error) { setMessage(p.error?.message ?? links.error?.message ?? site.error?.message ?? 'No se pudo cargar.'); return }
      const loaded = p.data as Program
      const linked = (links.data ?? []).flatMap(link => link.events ? [link.events] : []) as unknown as Event[]
      const available = await supabase.from('events').select('id,name,event_type').eq('organization_id', loaded.organization_id).order('name')
      if (!active) return
      if (available.error) { setMessage(available.error.message); return }
      setProgram(loaded); setEvents((available.data ?? []) as Event[])
      const ids = (links.data ?? []).map(link => link.event_id)
      setSelected(ids); setSavedSelected(ids)
      const mode = typeof loaded.registration_config?.registration_mode === 'string' ? loaded.registration_config.registration_mode : 'separate'
      setRegistrationMode((['separate', 'unified', 'modular', 'hybrid'].includes(mode) ? mode : 'separate') as RegistrationMode)
      setComponents(Object.fromEntries((links.data ?? []).map(link => [link.event_id, {
        policy: (link.registration_policy ?? 'independent') as RegistrationPolicy,
        price: String(link.registration_price ?? 0),
        currency: link.registration_currency ?? 'USD',
        capacity: link.registration_capacity == null ? '' : String(link.registration_capacity),
      }])))
      const primary = typeof loaded.registration_config?.web_event_id === 'string' && linked.some(event => event.id === loaded.registration_config.web_event_id) ? loaded.registration_config.web_event_id : linked[0]?.id ?? ''
      setWebEvent(primary); setSavedWebEvent(primary)
      setSiteUrl(site.data?.custom_hostname ? `https://${site.data.custom_hostname}` : site.data?.slug ? `https://${site.data.slug}.eventosfacil.net` : null)
    })
    return () => { active = false }
  }, [programId])
  async function save() {
    if (!program) return
    setBusy(true); setMessage('')
    if (selected.length && !selected.includes(webEvent)) { setBusy(false); setMessage('Selecciona el evento relacionado que administra la web.'); return }
    const additions = selected.filter(id => !savedSelected.includes(id))
    const removals = savedSelected.filter(id => !selected.includes(id))
    if (additions.length) {
      const added = await supabase.from('program_events').insert(additions.map(event_id => ({ program_id: program.id, event_id, component_type: events.find(event => event.id === event_id)?.event_type === 'forum' ? 'forum' : 'exhibition' }))).select('event_id')
      if (added.error || added.data?.length !== additions.length) { setBusy(false); setMessage(added.error?.message ?? 'No se pudieron vincular todos los eventos.'); return }
      setSavedSelected(current => [...current, ...additions])
    }
    if (removals.length) {
      const removed = await supabase.from('program_events').delete().eq('program_id', program.id).in('event_id', removals).select('event_id')
      if (removed.error || removed.data?.length !== removals.length) { setBusy(false); setMessage(removed.error?.message ?? 'No se pudieron desvincular todos los eventos.'); return }
      setSavedSelected(current => current.filter(id => !removals.includes(id)))
    }
    const values = { name: program.name.trim(), description: program.description, venue_name: program.venue_name, starts_at: program.starts_at, status: program.status, registration_config: { ...program.registration_config, web_event_id: webEvent, registration_mode: registrationMode } }
    const { data, error } = await supabase.from('event_programs').update(values).eq('id', program.id).select('id').single()
    if (!error && data) {
      const componentValues = selected.map(eventId => {
        const config = components[eventId] ?? emptyComponent()
        return { event_id: eventId, policy: config.policy, price: Number(config.price || 0), currency: config.currency.trim().toUpperCase() || 'USD', capacity: config.capacity === '' ? null : Number(config.capacity) }
      })
      const configured = await supabase.rpc('save_program_registration_config', { p_program_id: program.id, p_mode: registrationMode, p_components: componentValues })
      if (configured.error) { setBusy(false); setMessage(configured.error.message); return }
    }
    setBusy(false)
    if (!error && data) setSavedWebEvent(webEvent)
    setMessage(error?.message ?? (data ? 'Configuración guardada.' : 'No se pudo guardar.'))
  }
  const editUrl = savedWebEvent ? `/admin/programas/${programId}/landing` : null
  return <main className="mx-auto max-w-4xl px-5 py-8">
    <nav className="flex flex-wrap gap-4 text-sm font-semibold text-emerald-700"><Link to="/admin/programas">Todos los programas</Link><Link to={`/admin/programas/${programId}/accesos`}>Centro del programa</Link></nav>
    <h1 className="mt-6 text-2xl font-bold">Configuración del programa</h1>
    <Link className="mt-4 inline-block rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white" to={`/admin/programas/${programId}/agenda`}>Programa y agenda</Link>
    {message && <p role="status" className="mt-4 rounded-lg bg-zinc-100 p-3 text-sm">{message}</p>}
    {program && <form onSubmit={e => { e.preventDefault(); void save() }} className="mt-6 space-y-4 rounded-xl border bg-white p-5">
      <label className="block text-sm font-semibold">Nombre<input required className={input} value={program.name} onChange={e => setProgram({ ...program, name: e.target.value })} /></label>
      <label className="block text-sm font-semibold">Descripción<textarea className={input} value={program.description ?? ''} onChange={e => setProgram({ ...program, description: e.target.value })} /></label>
      <label className="block text-sm font-semibold">Sede<input className={input} value={program.venue_name ?? ''} onChange={e => setProgram({ ...program, venue_name: e.target.value })} /></label>
      <fieldset className="rounded-lg border p-4"><legend className="px-1 text-sm font-semibold">Eventos relacionados</legend>{events.map(event => <label key={event.id} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(event.id)} onChange={e => { setSelected(current => e.target.checked ? [...current, event.id] : current.filter(id => id !== event.id)); if (e.target.checked) { setComponents(current => ({ ...current, [event.id]: current[event.id] ?? emptyComponent() })); if (!webEvent) setWebEvent(event.id); } }} />{event.name}</label>)}</fieldset>
      <label className="block text-sm font-semibold">Estado<select className={input} value={program.status} onChange={e => setProgram({ ...program, status: e.target.value })}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <h2 className="font-bold">Registro del programa</h2>
        <p className="mt-1 text-sm text-zinc-600">Decide si los componentes se registran por separado o si el visitante arma un acceso conjunto. Un precio de cero crea una reserva gratuita y mantiene el control de cupo.</p>
        <label className="mt-4 block text-sm font-semibold">Modalidad<select className={input} value={registrationMode} onChange={e => setRegistrationMode(e.target.value as RegistrationMode)}><option value="separate">Separado · cada evento conserva su registro</option><option value="unified">Unificado · una inscripción incluye los componentes obligatorios</option><option value="modular">Modular · el visitante elige cada componente</option><option value="hybrid">Híbrido · base incluida y complementos opcionales</option></select></label>
        {registrationMode !== 'separate' && <div className="mt-4 space-y-3">{events.filter(event => selected.includes(event.id)).map(event => {
          const config = components[event.id] ?? emptyComponent()
          const update = (values: Partial<ComponentConfig>) => setComponents(current => ({ ...current, [event.id]: { ...(current[event.id] ?? emptyComponent()), ...values } }))
          return <article key={event.id} className="rounded-lg border bg-white p-4"><h3 className="font-semibold">{event.name}</h3><div className="mt-3 grid gap-3 sm:grid-cols-4"><label className="text-sm">Participación<select className={input} value={config.policy} onChange={e => update({ policy: e.target.value as RegistrationPolicy })}><option value="included">Incluido obligatoriamente</option><option value="optional_free">Opcional gratuito</option><option value="optional_paid">Opcional de pago</option><option value="independent">Registro independiente</option><option value="invite_only">Solo invitación</option></select></label><label className="text-sm">Precio<input className={input} type="number" min="0" step="0.01" disabled={config.policy !== 'optional_paid'} value={config.policy === 'optional_paid' ? config.price : '0'} onChange={e => update({ price: e.target.value })} /></label><label className="text-sm">Moneda<input className={input} maxLength={3} value={config.currency} onChange={e => update({ currency: e.target.value.toUpperCase() })} /></label><label className="text-sm">Cupo<input className={input} type="number" min="0" placeholder="Sin límite" value={config.capacity} onChange={e => update({ capacity: e.target.value })} /></label></div></article>
        })}</div>}
        <p className="mt-3 text-xs text-zinc-500">El cupo puede ampliarse después. Si ya existen reservas, no podrá reducirse por debajo de las plazas ocupadas.</p>
      </section>
      <section className="rounded-lg border bg-zinc-50 p-4"><h2 className="font-bold">Web compartida del programa</h2><p className="mt-2 text-sm text-zinc-600">Elige un único evento relacionado desde el que se diseña y activa la web. Todos los eventos del programa comparten esa dirección.</p>
        <label className="mt-3 block text-sm font-semibold">Evento que administra la web<select className={input} value={webEvent} onChange={e => setWebEvent(e.target.value)}><option value="">Selecciona un evento</option>{events.filter(event => selected.includes(event.id)).map(event => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
        {siteUrl && <a className="mt-3 block break-all font-semibold text-emerald-700" href={siteUrl} target="_blank" rel="noreferrer">{siteUrl}</a>}
        <p className="mt-3 text-sm">Guarda la configuración antes de abrir el constructor.</p>
        {editUrl && <Link className="mt-3 inline-block font-semibold text-emerald-700" to={editUrl}>Crear o editar web del programa</Link>}
      </section>
      <button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar configuración'}</button>
    </form>}
  </main>
}
