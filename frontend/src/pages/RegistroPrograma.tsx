import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Ticket } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../lib/useTenant'
import { brandColor, brandName } from '../lib/tenantCore'

type Program = { id: string; name: string; description: string | null; venue_name: string | null; starts_at: string | null; registration_config: Record<string, unknown> }
type Pass = { id: string; name: string; access_mode: 'program' | 'day' | 'session' | 'zone'; capacity: number | null }
type LinkedEvent = { event_id: string; component_type: string; events: { id: string; name: string; start_date: string | null } | { id: string; name: string; start_date: string | null }[] | null }

const PROFILE_LABEL: Record<string, string> = { attendee: 'Asistente', guest: 'Invitado', vip: 'Invitado VIP', speaker: 'Ponente', exhibitor: 'Expositor' }
const ACCESS_LABEL: Record<Pass['access_mode'], string> = { program: 'Evento completo', day: 'Por día', session: 'Por sesión', zone: 'Por zona' }

export default function RegistroPrograma() {
  const { programId } = useParams()
  const { tenant, loading: tenantLoading } = useTenant()
  const [program, setProgram] = useState<Program | null>(null)
  const [passes, setPasses] = useState<Pass[]>([])
  const [events, setEvents] = useState<LinkedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', cedula: '', company: '', job_title: '', city: '', country: 'Venezuela', participation_type: 'attendee', pass_id: '', event_id: '' })

  useEffect(() => {
    if (!programId) return
    let alive = true
    Promise.all([
      supabase.from('event_programs').select('id, name, description, venue_name, starts_at, registration_config').eq('id', programId).maybeSingle(),
      supabase.from('passes').select('id, name, access_mode, capacity').eq('program_id', programId).eq('is_public', true).order('created_at'),
      supabase.from('program_events').select('event_id, component_type, events(id, name, start_date)').eq('program_id', programId).order('sort_order'),
    ]).then(([p, pa, ev]) => {
      if (!alive) return
      if (p.error || !p.data) setError('Este programa no está disponible.')
      else setProgram(p.data as Program)
      setPasses((pa.data ?? []) as Pass[])
      const list = (ev.data ?? []) as unknown as LinkedEvent[]
      setEvents(list)
      setForm((f) => ({ ...f, pass_id: (pa.data?.[0] as Pass | undefined)?.id ?? '', event_id: list[0]?.event_id ?? '' }))
      setLoading(false)
    })
    return () => { alive = false }
  }, [programId])

  const profiles = useMemo(() => {
    const configured = program?.registration_config?.public_profiles
    return Array.isArray(configured) && configured.length ? configured.filter((x): x is string => typeof x === 'string' && !!PROFILE_LABEL[x]) : ['attendee', 'guest', 'vip', 'speaker', 'exhibitor']
  }, [program])

  function change(key: keyof typeof form, value: string) { setForm((f) => ({ ...f, [key]: value })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!programId || !form.pass_id || !form.first_name.trim() || !form.email.trim()) return
    setSaving(true); setError(null)
    const { error: rpcError } = await supabase.rpc('register_program_participant', {
      p_program_id: programId, p_event_id: form.event_id || null, p_pass_id: form.pass_id,
      p_first_name: form.first_name, p_last_name: form.last_name, p_email: form.email, p_phone: form.phone,
      p_cedula: form.cedula || null, p_company: form.company || null, p_job_title: form.job_title || null,
      p_city: form.city || null, p_country: form.country || null, p_participation_type: form.participation_type,
      p_profile_data: {},
    })
    setSaving(false)
    if (rpcError) setError(rpcError.message)
    else setDone(true)
  }

  if (tenantLoading || loading) return <div className="grid min-h-[100dvh] place-items-center text-sm text-zinc-500">Cargando…</div>
  if (error && !program) return <div className="grid min-h-[100dvh] place-items-center px-5 text-center text-sm text-red-700">{error}</div>
  if (!program) return null
  const accent = brandColor(tenant) ?? '#059669'

  return <main className="min-h-[100dvh] bg-zinc-50 px-5 py-10">
    <section className="mx-auto max-w-2xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
      <p className="text-sm font-semibold" style={{ color: accent }}>{brandName(tenant)}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">{program.name}</h1>
      {program.description && <p className="mt-3 text-zinc-600">{program.description}</p>}
      <p className="mt-3 text-sm text-zinc-500">{program.venue_name ?? 'Sede por confirmar'}{program.starts_at ? ` · ${new Date(program.starts_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</p>
      {done ? <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-800"><CheckCircle2 className="mx-auto h-10 w-10" /><h2 className="mt-3 text-xl font-bold">Registro recibido</h2><p className="mt-2 text-sm">Te enviaremos la confirmación y tu credencial cuando corresponda.</p></div> :
        <form className="mt-8 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Perfil"><select value={form.participation_type} onChange={(e) => change('participation_type', e.target.value)}>{profiles.map((p) => <option key={p} value={p}>{PROFILE_LABEL[p]}</option>)}</select></Field>
          <Field label="Acceso"><select value={form.pass_id} onChange={(e) => change('pass_id', e.target.value)}>{passes.map((p) => <option key={p.id} value={p.id}>{p.name} · {ACCESS_LABEL[p.access_mode]}</option>)}</select></Field>
          {events.length > 1 && <Field label="Componente inicial"><select value={form.event_id} onChange={(e) => change('event_id', e.target.value)}>{events.map((e) => <option key={e.event_id} value={e.event_id}>{(Array.isArray(e.events) ? e.events[0] : e.events)?.name ?? e.component_type}</option>)}</select></Field>}
          <Field label="Nombre"><input required value={form.first_name} onChange={(e) => change('first_name', e.target.value)} /></Field>
          <Field label="Apellido"><input value={form.last_name} onChange={(e) => change('last_name', e.target.value)} /></Field>
          <Field label="Correo"><input required type="email" value={form.email} onChange={(e) => change('email', e.target.value)} /></Field>
          <Field label="Teléfono"><input required value={form.phone} onChange={(e) => change('phone', e.target.value)} /></Field>
          <Field label="Cédula / documento"><input value={form.cedula} onChange={(e) => change('cedula', e.target.value)} /></Field>
          <Field label="Empresa / organización"><input value={form.company} onChange={(e) => change('company', e.target.value)} /></Field>
          <Field label="Cargo"><input value={form.job_title} onChange={(e) => change('job_title', e.target.value)} /></Field>
          <Field label="Ciudad"><input value={form.city} onChange={(e) => change('city', e.target.value)} /></Field>
          <Field label="País"><input value={form.country} onChange={(e) => change('country', e.target.value)} /></Field>
          {error && <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button disabled={saving || !passes.length} className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: accent }}><Ticket className="h-4 w-4" />{saving ? 'Enviando…' : 'Registrarme'}</button>
        </form>}
    </section>
  </main>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800">{label}<span className="[&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-zinc-300 [&>input]:px-3 [&>input]:py-2.5 [&>input]:font-normal [&>input]:outline-none [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-zinc-300 [&>select]:bg-white [&>select]:px-3 [&>select]:py-2.5 [&>select]:font-normal">{children}</span></label> }
