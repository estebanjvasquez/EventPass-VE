import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { ArrowLeft, Camera, IdCard, Printer, Search } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../../lib/supabase'
import { resolveActiveOrg } from '../../lib/activeOrg'
import ImpersonationBanner from '../../components/ImpersonationBanner'

type SeatInfo = { seat_number: string | null; row_label: string | null; column_number: number | null }
type Reg = {
  id: string
  first_name: string
  last_name: string | null
  cedula: string | null
  status: string
  attendance_status: string
  credential_token: string
  seats: SeatInfo | SeatInfo[] | null
}
type EventOption = { id: string; name: string }

function seatLabel(seats: Reg['seats']): string | null {
  if (!seats) return null
  const s = Array.isArray(seats) ? seats[0] : seats
  if (!s) return null
  return s.seat_number ?? ([s.row_label, s.column_number].filter((x) => x != null).join('') || null)
}

// Formatos de gafete (mm). El navegador permite elegir la impresora al imprimir.
const SIZES = {
  etiqueta: { label: 'Etiqueta 10 × 6 cm', w: 100, h: 60 },
  credencial: { label: 'Credencial 9 × 13 cm', w: 90, h: 130 },
  a6: { label: 'A6 · 10.5 × 14.8 cm', w: 105, h: 148 },
  media_carta: { label: 'Media carta · 14 × 21.6 cm', w: 140, h: 216 },
} as const
type SizeKey = keyof typeof SIZES

const READER_ID = 'acred-reader'

export default function AcreditacionEvento() {
  const [orgName, setOrgName] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Reg[]>([])
  const [selected, setSelected] = useState<Reg | null>(null)
  const [size, setSize] = useState<SizeKey>('etiqueta')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    let active = true
    async function init() {
      const m = await resolveActiveOrg()
      if (!active || !m) return
      setOrgName(m.organizations?.name ?? '')
      setOrgId(m.organization_id)
      const { data } = await supabase
        .from('events')
        .select('id, name')
        .eq('organization_id', m.organization_id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      if (!active) return
      const evs = (data ?? []) as EventOption[]
      setEvents(evs)
      if (evs[0]) setEventId(evs[0].id)
    }
    init()
    return () => {
      active = false
    }
  }, [])

  const eventName = events.find((e) => e.id === eventId)?.name ?? ''

  async function search(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!eventId || query.trim().length < 2) return
    const q = query.trim().replace(/[%,]/g, '')
    const { data, error } = await supabase
      .from('registrations')
      .select('id, first_name, last_name, cedula, status, attendance_status, credential_token, seats(seat_number, row_label, column_number)')
      .eq('event_id', eventId)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,cedula.ilike.%${q}%`)
      .limit(20)
    if (error) setError(error.message)
    else setResults((data ?? []) as Reg[])
  }

  const pickByToken = useCallback(async (token: string) => {
    const t = token.trim()
    if (!t) return
    const { data } = await supabase
      .from('registrations')
      .select('id, first_name, last_name, cedula, status, attendance_status, credential_token, seats(seat_number, row_label, column_number)')
      .eq('credential_token', t)
      .maybeSingle()
    if (!data) {
      setError('Código no válido para tu organización.')
      return
    }
    setResults([])
    setSelected(data as Reg)
  }, [])

  // Escáner opcional (bajo demanda).
  useEffect(() => {
    if (!scanning) return
    const scanner = new Html5Qrcode(READER_ID)
    scannerRef.current = scanner
    let cancelled = false
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          void pickByToken(decoded)
          setScanning(false)
        },
        undefined,
      )
      .catch(() => {
        if (!cancelled) setError('No pudimos acceder a la cámara. Usa la búsqueda por nombre.')
      })
    return () => {
      cancelled = true
      scanner.stop().then(() => scanner.clear()).catch(() => {})
    }
  }, [scanning, pickByToken])

  async function printBadge() {
    if (!selected) return
    setError(null)
    if (selected.status !== 'confirmed') {
      setError('Este registro no está confirmado; no se puede acreditar aún.')
      return
    }
    const { count: previousPrints, error: historyError } = await supabase
      .from('badge_print_logs')
      .select('id', { count: 'exact', head: true })
      .eq('registration_id', selected.id)
      .eq('event_id', eventId)
    if (historyError) { setError(historyError.message); return }
    const printKind = previousPrints ? 'reprint' : 'initial'
    const reason = printKind === 'reprint' ? window.prompt('Indica el motivo de la reimpresión')?.trim() : null
    if (printKind === 'reprint' && !reason) { setError('La reimpresión requiere indicar un motivo.'); return }

    // Marca el ingreso (si no estaba), registra la impresión y luego imprime.
    if (selected.attendance_status !== 'checked_in') {
      const { error } = await supabase
        .from('registrations')
        .update({ attendance_status: 'checked_in' })
        .eq('id', selected.id)
      if (error) {
        setError(error.message)
        return
      }
      setSelected({ ...selected, attendance_status: 'checked_in' })
    }
    const { error: logError } = await supabase.from('badge_print_logs').insert({
      organization_id: orgId,
      event_id: eventId,
      registration_id: selected.id,
      print_kind: printKind,
      reason,
      device_label: navigator.userAgent.slice(0, 120),
    })
    if (logError) { setError(logError.message); return }
    setInfo(printKind === 'reprint' ? 'Reimpresión registrada y enviada a la impresora.' : 'Impresión registrada y enviada a la impresora.')
    window.print()
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <ImpersonationBanner />
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" />
            Registros
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <IdCard className="h-4 w-4 text-emerald-600" />
            Acreditación
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Imprimir gafete</h1>
        <p className="mt-1 text-sm text-zinc-600">Busca al asistente y imprime su credencial en el mostrador.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <select
            aria-label="Evento"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-emerald-500"
          >
            {events.length === 0 && <option value="">Sin eventos publicados</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setScanning((s) => !s)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
          >
            <Camera className="h-4 w-4" />
            {scanning ? 'Cerrar cámara' : 'Escanear QR'}
          </button>
        </div>

        {scanning && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-black">
            <div id={READER_ID} className="mx-auto w-full [&_video]:w-full" />
          </div>
        )}

        <form onSubmit={search} className="mt-4 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, apellido o cédula"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">
            <Search className="h-4 w-4" />
            Buscar
          </button>
        </form>

        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {info && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</p>}

        {results.length > 0 && !selected && (
          <ul className="mt-4 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(r)
                    setResults([])
                  }}
                  className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-zinc-50"
                >
                  <span>
                    <span className="font-medium text-zinc-900">{r.first_name} {r.last_name ?? ''}</span>
                    {r.cedula && <span className="ml-2 text-xs text-zinc-500">{r.cedula}</span>}
                  </span>
                  <span className={`text-xs font-medium ${r.status === 'confirmed' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {r.status === 'confirmed' ? (r.attendance_status === 'checked_in' ? 'Ingresó' : 'Confirmado') : 'Sin confirmar'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">{eventName}</p>
                <h2 className="mt-1 text-xl font-bold text-zinc-900">{selected.first_name} {selected.last_name ?? ''}</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {selected.cedula ?? 'Sin cédula'}
                  {seatLabel(selected.seats) && <> · Asiento <strong>{seatLabel(selected.seats)}</strong></>}
                </p>
                <p className={`mt-1 text-xs font-medium ${selected.status === 'confirmed' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {selected.status === 'confirmed'
                    ? selected.attendance_status === 'checked_in' ? 'Confirmado · ya ingresó' : 'Confirmado'
                    : 'Pago sin confirmar'}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-zinc-500 hover:text-zinc-800">Cambiar</button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-700">Tamaño del gafete</span>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value as SizeKey)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-emerald-500"
                >
                  {Object.entries(SIZES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={printBadge}
                disabled={selected.status !== 'confirmed'}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Imprimir gafete
              </button>
            </div>
            <p className="mt-3 text-xs text-zinc-500">Al imprimir se registra el ingreso. En el diálogo del navegador elige la impresora.</p>
          </div>
        )}
      </main>

      {selected && <BadgePrint reg={selected} eventName={eventName} orgName={orgName} sizeKey={size} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gafete imprimible (portal fuera de #root, aislado por CSS de impresión).
// ---------------------------------------------------------------------------
function BadgePrint({ reg, eventName, orgName, sizeKey }: { reg: Reg; eventName: string; orgName: string; sizeKey: SizeKey }) {
  const size = SIZES[sizeKey]
  const landscape = size.w > size.h
  const seat = seatLabel(reg.seats)
  const qr = Math.round(Math.min(size.w, size.h) * (landscape ? 0.72 : 0.5) * 3.78)

  return createPortal(
    <div id="badge-print-root">
      <style>{`@page{size:${size.w}mm ${size.h}mm;margin:0}`}</style>
      <div
        style={{ width: `${size.w}mm`, height: `${size.h}mm` }}
        className={`box-border flex ${landscape ? 'flex-row items-center gap-3' : 'flex-col items-center text-center'} justify-between overflow-hidden border border-zinc-300 p-3`}
      >
        <div className={landscape ? 'min-w-0 flex-1' : 'w-full'}>
          {orgName && <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{orgName}</p>}
          <p className="mt-0.5 truncate text-[9px] text-zinc-500">{eventName}</p>
          <p className={`mt-1 font-bold leading-tight text-zinc-900 ${landscape ? 'text-lg' : 'text-xl'}`}>
            {reg.first_name} {reg.last_name ?? ''}
          </p>
          {reg.cedula && <p className="mt-0.5 text-[11px] text-zinc-600">{reg.cedula}</p>}
          {seat && (
            <p className="mt-1 inline-block rounded bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white">Asiento {seat}</p>
          )}
        </div>
        <div className={landscape ? 'shrink-0' : 'mt-2'}>
          <QRCodeSVG value={reg.credential_token} size={qr} level="M" marginSize={0} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
