import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { ArrowLeft, CheckCircle2, ScanLine, TriangleAlert, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolveActiveOrg } from '../../lib/activeOrg'

type Outcome = {
  kind: 'success' | 'warning' | 'error'
  title: string
  subtitle?: string
}

type RegRow = {
  id: string
  first_name: string
  last_name: string | null
  status: string
  attendance_status: string
  events: { name?: string } | { name?: string }[] | null
}
type AccessPoint = { id: string; name: string; event_id: string }
type CheckinSession = { id: string; name: string; session_type: 'lecture' | 'workshop' | 'break' }

const READER_ID = 'checkin-reader'

function eventName(events: RegRow['events']): string {
  if (!events) return ''
  const row = Array.isArray(events) ? events[0] : events
  return row?.name ?? ''
}

export default function CheckinEvento() {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [count, setCount] = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([])
  const [accessPointId, setAccessPointId] = useState('')
  const [sessions, setSessions] = useState<CheckinSession[]>([])
  const [sessionId, setSessionId] = useState('')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    const online = () => setIsOnline(true); const offline = () => setIsOnline(false)
    window.addEventListener('online', online); window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])

  useEffect(() => {
    void resolveActiveOrg().then(async (membership) => {
      if (!membership) return
      const { data } = await supabase.from('access_points').select('id,name,event_id').eq('organization_id', membership.organization_id).order('name')
      const points = (data ?? []) as AccessPoint[]
      setAccessPoints(points)
      if (points[0]) setAccessPointId(points[0].id)
    })
  }, [])

  useEffect(() => {
    const point = accessPoints.find((item) => item.id === accessPointId)
    if (!point) { setSessions([]); setSessionId(''); return }
    void supabase.from('event_sessions').select('id,name,session_type').eq('event_id', point.event_id).neq('session_type', 'break').order('starts_at').then(({ data }) => {
      const rows = (data ?? []) as CheckinSession[]
      setSessions(rows)
      setSessionId('')
    })
  }, [accessPointId, accessPoints])

  const process = useCallback(async (rawToken: string) => {
    const token = rawToken.trim()
    if (!token || busyRef.current) return
    busyRef.current = true
    try {
      scannerRef.current?.pause(true)
    } catch {
      // el escáner puede no estar corriendo (ingreso manual)
    }

    if (accessPointId && sessionId) {
      const { data, error } = await supabase.rpc('validate_session_checkin', { p_credential_token: token, p_access_point_id: accessPointId, p_session_id: sessionId, p_device_label: navigator.userAgent.slice(0, 120) })
      const validation = Array.isArray(data) ? data[0] : null
      if (!error && validation) {
        if (validation.result === 'allowed') { setCount((current) => current + 1); setOutcome({ kind: 'success', title: `¡Bienvenido, ${validation.participant_name}!`, subtitle: validation.reason }); return }
        setOutcome({ kind: 'warning', title: validation.result === 'duplicate' ? 'Acceso ya registrado' : 'Acceso no autorizado', subtitle: validation.reason }); return
      }
      setOutcome({ kind: 'error', title: 'No se pudo validar la sesión', subtitle: error?.message ?? 'La sesión no devolvió una respuesta válida.' }); return
    }
    if (accessPointId) {
      const { data, error } = await supabase.rpc('validate_program_checkin', { p_credential_token: token, p_access_point_id: accessPointId, p_device_label: navigator.userAgent.slice(0, 120) })
      const validation = Array.isArray(data) ? data[0] : null
      if (!error && validation) {
        if (validation.result === 'allowed') {
          setCount((current) => current + 1)
          setOutcome({ kind: 'success', title: `¡Bienvenido, ${validation.participant_name}!`, subtitle: validation.reason })
        } else {
          setOutcome({ kind: 'warning', title: validation.result === 'duplicate' ? 'Acceso ya registrado' : 'Acceso no autorizado', subtitle: validation.reason })
        }
        return
      }
    }

    const { data, error } = await supabase
      .from('registrations')
      .select('id, first_name, last_name, status, attendance_status, events(name)')
      .eq('credential_token', token)
      .maybeSingle()
    const reg = data as RegRow | null

    if (error || !reg) {
      setOutcome({ kind: 'error', title: 'Código no válido', subtitle: 'No corresponde a un registro de tu organización.' })
      return
    }
    const name = `${reg.first_name} ${reg.last_name ?? ''}`.trim()
    const ev = eventName(reg.events)

    if (reg.status !== 'confirmed') {
      setOutcome({ kind: 'warning', title: 'Registro no confirmado', subtitle: `${name} — el pago aún no está confirmado.` })
      return
    }
    if (reg.attendance_status === 'checked_in') {
      setOutcome({ kind: 'warning', title: 'Ya había ingresado', subtitle: `${name}${ev ? ` · ${ev}` : ''}` })
      return
    }

    const { error: upErr } = await supabase
      .from('registrations')
      .update({ attendance_status: 'checked_in' })
      .eq('id', reg.id)
    if (upErr) {
      setOutcome({ kind: 'error', title: 'No se pudo registrar', subtitle: upErr.message })
      return
    }
    setCount((c) => c + 1)
    setOutcome({ kind: 'success', title: `¡Bienvenido, ${reg.first_name}!`, subtitle: `Ingreso registrado${ev ? ` · ${ev}` : ''}` })
  }, [accessPointId, sessionId])

  function nextScan() {
    setOutcome(null)
    busyRef.current = false
    scannerRef.current?.resume()
  }

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID)
    scannerRef.current = scanner
    let cancelled = false
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          void process(decoded)
        },
        undefined,
      )
      .catch(() => {
        if (!cancelled)
          setCameraError(
            'No pudimos acceder a la cámara. Revisa los permisos o usa el ingreso manual.',
          )
      })
    return () => {
      cancelled = true
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {})
    }
  }, [process])

  const badge =
    outcome?.kind === 'success'
      ? { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
      : outcome?.kind === 'warning'
        ? { icon: TriangleAlert, cls: 'border-amber-200 bg-amber-50 text-amber-700' }
        : { icon: XCircle, cls: 'border-red-200 bg-red-50 text-red-700' }
  const BadgeIcon = badge.icon

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Registros
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <ScanLine className="h-4 w-4 text-emerald-600" />
            Check-in
          </span>
          <Link to="/admin/checkin/control" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700">Control</Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        {!isOnline && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><strong>Sin conexión.</strong> No cierres esta pantalla; recupera la red antes de validar el siguiente pase. Las validaciones no se confirman localmente para evitar duplicados.</div>}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Escanear credenciales</h1>
            <p className="mt-1 text-sm text-zinc-600">Apunta la cámara al código QR del asistente.</p>
          </div>
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
            {count} ingresos
          </span>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-black">
          <div id={READER_ID} className="mx-auto w-full [&_video]:w-full" />
        </div>

        {accessPoints.length > 0 && <label className="mt-4 grid gap-1.5 text-sm font-medium text-zinc-800">Punto de acceso<select value={accessPointId} onChange={(event) => setAccessPointId(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500">{accessPoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}</select></label>}
        {sessions.length > 0 && <label className="mt-4 grid gap-1.5 text-sm font-medium text-zinc-800">Validar sesión (opcional)<select value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500"><option value="">Ingreso general del evento</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}{session.session_type === 'workshop' ? ' · Taller con cupo' : ''}</option>)}</select></label>}

        {cameraError && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <p className="font-semibold">La cámara no está disponible; puedes continuar sin ella.</p>
            <p className="mt-1">{cameraError}</p>
            <a href="#ingreso-manual" className="mt-2 inline-flex font-semibold underline underline-offset-2">Ir al ingreso manual</a>
          </div>
        )}

        {outcome && (
          <div className={`mt-6 rounded-2xl border p-6 text-center ${badge.cls}`}>
            <BadgeIcon className="mx-auto h-10 w-10" />
            <h2 className="mt-3 text-xl font-bold">{outcome.title}</h2>
            {outcome.subtitle && <p className="mt-1 text-sm opacity-90">{outcome.subtitle}</p>}
            <button
              type="button"
              onClick={nextScan}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
            >
              Escanear siguiente
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (manual.trim()) {
              void process(manual)
              setManual('')
            }
          }}
          id="ingreso-manual"
          className="mt-8 scroll-mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
        >
          <label className="text-sm font-semibold text-emerald-950">Ingreso manual (código de la credencial)</label>
          <div className="mt-2 flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Pega o escribe el código"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400"
            >
              Validar
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
