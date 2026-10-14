import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Check = { done: boolean; note: string; at: string; actor_id: string }
type Acceptance = { id: string; revision: number; valid: boolean; accepted_at: string; statement: string; snapshot: Record<string, unknown>; actor_identity: { user_id: string } }
type Preparation = { event_id: string; event_name: string; scenario: string; needs_printing: boolean; checks: Record<string, Check>; revision: number; required_steps: string[]; configuration_fingerprint: string; configuration_changed: boolean; can_edit: boolean; can_accept: boolean; acceptance: Acceptance | null }
const statement = 'Confirmo las pruebas y responsables registrados. Esta aceptación no reserva soporte presencial ni certifica cumplimiento legal.'
const steps: Record<string, { title: string; detail: string; path?: string }> = {
  registration: { title: 'Registro de principio a fin', detail: 'Comprueba categorías, registro, confirmación y recuperación con datos de ensayo.', path: '/admin/eventos' },
  privacy: { title: 'Privacidad y cobro', detail: 'Revisa textos, consentimiento, medios y conciliación si el registro es pago.' },
  responsibles: { title: 'Responsables y horario', detail: 'Registra responsables por turno, capacitación, contactos y horario acordado de soporte.' },
  contingency: { title: 'Contingencia', detail: 'Documenta respaldo de conectividad, equipo, consumibles y procedimiento ante una interrupción.' },
  agenda: { title: 'Agenda del foro', detail: 'Comprueba sesiones, horarios, aforos y recorrido del participante.' },
  access: { title: 'Accesos', detail: 'Ensaya puntos de acceso, permisos del equipo operativo y rechazo de credenciales no válidas.' },
  exhibitors: { title: 'Exposición', detail: 'Comprueba plano, stands, responsables e ingreso al portal del expositor.' },
  consent: { title: 'Captación con consentimiento', detail: 'Prueba que los perfiles sin permiso estén ocultos y que la revocación se respete.' },
  program: { title: 'Programa vinculado', detail: 'Comprueba eventos vinculados, inscripción y participación por evento.' },
  connector: { title: 'Conector local', detail: 'Descarga el conector, instala el controlador en Windows y vincula la estación. El vínculo dura 8 horas.', path: '/admin/impresion' },
  printer: { title: 'Prueba física de impresora', detail: 'Registra modelo, controlador, consumible, tamaño y orientación. Comprueba legibilidad del QR.', path: '/admin/impresion' },
  batch: { title: 'Prueba de lote', detail: 'Ensaya más de 20 credenciales y registra cantidad, tiempo, errores y resultado.', path: '/admin/impresion' },
  recovery: { title: 'Recuperación de impresión', detail: 'Ensaya cierre del navegador, reinicio y recuperación de la cola sin duplicar credenciales.', path: '/admin/impresion' },
}
const input = 'w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm'

export default function EventPreparation({ eventId, support = false }: { eventId: string; support?: boolean }) {
  const [data, setData] = useState<Preparation | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const load = useCallback(async () => {
    setLoading(true); setError(''); setAccepted(false)
    try {
      const result = await supabase.rpc('get_event_preparation', { p_event: eventId })
      if (result.error) throw new Error(result.error.message)
      setData(result.data as Preparation)
    } catch (e) { setData(null); setError(e instanceof Error ? e.message : 'No se pudo cargar') }
    finally { setLoading(false) }
  }, [eventId])
  useEffect(() => { void load() }, [load])
  async function mutate(action: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await action()
      if (result.error) throw new Error(result.error.message)
      setData(result.data as Preparation); setAccepted(false); setMessage('Guardado correctamente.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') }
    finally { setBusy(false) }
  }
  function save(step: string | null, done: boolean | null, note: string | null, scenario = data?.scenario, printing = data?.needs_printing) {
    if (!data) return
    void mutate(() => supabase.rpc('save_event_preparation', { p_event: eventId, p_revision: data.revision, p_scenario: scenario, p_print: printing, p_step: step, p_done: done, p_note: note }))
  }
  function download() {
    if (!data?.acceptance) return
    const a = data.acceptance
    const text = `ACTA DE PREPARACIÓN — ${data.event_name}\nID: ${a.id}\nRevisión: ${a.revision}\nFecha: ${new Date(a.accepted_at).toLocaleString('es-VE')}\nAceptante: ${a.actor_identity.user_id}\nEstado al descargar: ${a.valid ? 'Vigente' : 'Requiere nueva aceptación'}\n\n${a.statement}\n\n${JSON.stringify(a.snapshot, null, 2)}\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `acta-preparacion-${eventId}.txt`; anchor.click(); URL.revokeObjectURL(url)
  }
  const completed = data?.required_steps.filter(key => data.checks[key]?.done).length ?? 0
  return <section className="mt-5 rounded-xl border bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Asistente de preparación</h2><button disabled={busy} onClick={() => void load()} className="text-sm underline">Actualizar</button></div>
    {error && <p role="alert" className="my-3 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {message && <p role="status" className="my-3 text-emerald-700">{message}</p>}
    {loading ? <p className="py-4">Cargando preparación…</p> : data && <>
      <p className="mt-2 font-semibold">{data.event_name}</p><p className="mt-1 text-sm text-zinc-600">{completed} de {data.required_steps.length} pruebas registradas · revisión {data.revision}. Cada paso guarda resultado, responsable y fecha.</p>
      {data.configuration_changed && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">La configuración del evento cambió. Repite las pruebas y registra una nueva aceptación; el acta anterior se conserva.</p>}
      <progress className="mt-3 h-3 w-full accent-emerald-700" max={data.required_steps.length} value={completed} aria-label="Progreso de preparación" />
      {data.can_edit && <form key={`${eventId}-${data.scenario}-${data.needs_printing}`} className="my-5 grid gap-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); save(null, null, null, String(f.get('scenario')), f.get('printing') === 'on') }}>
        <label>Escenario<select name="scenario" defaultValue={data.scenario} className={input}><option value="simple">Jornada sencilla</option><option value="forum">Foro</option><option value="exhibition">Exposición</option><option value="program">Programa vinculado</option></select></label>
        <label className="flex items-center gap-2"><input name="printing" type="checkbox" defaultChecked={data.needs_printing} />Impresión de credenciales</label>
        <button disabled={busy} className="rounded-lg border p-2">Guardar escenario</button><p className="text-xs text-zinc-500 sm:col-span-3">Cambiar escenario o impresión reinicia las pruebas y requiere nueva aceptación. El escenario organiza la preparación; no habilita módulos del contrato.</p>
      </form>}
      <div className="space-y-3">{data.required_steps.map(key => <form key={`${eventId}-${key}-${data.revision}`} className="rounded-xl border p-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); save(key, f.get('done') === 'on', String(f.get('note') ?? '')) }}>
        <h3 className="font-semibold">{steps[key]?.title ?? key}</h3><p className="my-2 text-sm text-zinc-600">{steps[key]?.detail}</p>
        {!support && steps[key]?.path && <Link className="text-sm text-emerald-700 underline" to={steps[key].path!}>Abrir configuración</Link>}
        <label className="my-3 block text-sm">Evidencia o resultado<textarea disabled={!data.can_edit || busy} name="note" maxLength={2000} defaultValue={data.checks[key]?.note ?? ''} placeholder="Describe lo comprobado, quién participó y el resultado. Sin contraseñas ni datos sensibles." className={`${input} mt-1`} /></label>
        <div className="flex flex-wrap items-center gap-4"><label className="text-sm"><input disabled={!data.can_edit || busy} name="done" type="checkbox" defaultChecked={data.checks[key]?.done ?? false} /> Prueba completada</label>{data.can_edit && <button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white">Guardar paso</button>}</div>
        {data.checks[key]?.at && <p className="mt-2 text-xs text-zinc-500">Último registro: {new Date(data.checks[key].at).toLocaleString('es-VE')}</p>}
      </form>)}</div>
      <div className="mt-5 rounded-xl bg-zinc-50 p-4"><h3 className="font-semibold">Aceptación del organizador</h3><p className="mt-2 text-sm">{statement}</p><p className="mt-2 text-sm">{data.acceptance ? data.acceptance.valid ? 'Acta vigente para esta preparación y configuración.' : 'El acta anterior requiere nueva aceptación por cambios posteriores.' : 'Todavía no hay acta de aceptación.'}</p>
        {data.acceptance && <button onClick={download} className="mt-3 text-sm underline">Descargar acta {data.acceptance.valid ? '' : 'anterior'}</button>}
        {data.can_accept && !data.acceptance?.valid && <><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />He revisado las evidencias y acepto la declaración.</label><button disabled={busy || !accepted || completed !== data.required_steps.length} onClick={() => void mutate(() => supabase.rpc('accept_event_preparation', { p_event: eventId, p_revision: data.revision, p_fingerprint: data.configuration_fingerprint, p_statement: statement }))} className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-40">Registrar aceptación</button></>}
        {!data.can_accept && <p className="mt-3 text-sm">La aceptación corresponde al propietario o administrador de la organización.</p>}
      </div>
    </>}
  </section>
}
