import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Armchair, ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Seat = {
  id: string
  row_label: string | null
  column_number: number | null
  seat_number: string | null
  price: number | null
  status: 'available' | 'reserved' | 'confirmed'
}

const STATUS_STYLE: Record<Seat['status'], string> = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  reserved: 'border-amber-300 bg-amber-50 text-amber-700',
  confirmed: 'border-zinc-300 bg-zinc-200 text-zinc-500',
}

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export default function AsientosAdmin() {
  const { eventId } = useParams()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [eventName, setEventName] = useState('')
  const [seats, setSeats] = useState<Seat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rowsN, setRowsN] = useState(5)
  const [colsN, setColsN] = useState(10)
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)

  const loadSeats = useCallback(async () => {
    if (!eventId) return
    const { data, error } = await supabase
      .from('seats')
      .select('id, row_label, column_number, seat_number, price, status')
      .eq('event_id', eventId)
      .order('row_label', { ascending: true })
      .order('column_number', { ascending: true })
    if (error) setError(error.message)
    else setSeats((data ?? []) as Seat[])
  }, [eventId])

  useEffect(() => {
    let active = true
    async function init() {
      setLoading(true)
      setError(null)
      const { data: ev, error: evErr } = await supabase
        .from('events')
        .select('name, organization_id')
        .eq('id', eventId)
        .maybeSingle()
      if (!active) return
      if (evErr || !ev) {
        setError(evErr?.message ?? 'Evento no encontrado.')
        setLoading(false)
        return
      }
      setOrgId((ev as { organization_id: string }).organization_id)
      setEventName((ev as { name: string }).name)
      await loadSeats()
      if (active) setLoading(false)
    }
    init()
    return () => {
      active = false
    }
  }, [eventId, loadSeats])

  async function generate() {
    if (!orgId || !eventId) return
    if (seats.length > 0) {
      setError('Ya existe un mapa. Elimínalo antes de generar uno nuevo.')
      return
    }
    setBusy(true)
    setError(null)
    const priceVal = price ? Number(price) : null
    const toInsert: Record<string, unknown>[] = []
    for (let r = 0; r < rowsN; r++) {
      const label = ROW_LETTERS[r] ?? `R${r + 1}`
      for (let c = 1; c <= colsN; c++) {
        toInsert.push({
          organization_id: orgId,
          event_id: eventId,
          row_label: label,
          column_number: c,
          seat_number: `${label}${c}`,
          price: priceVal,
          status: 'available',
        })
      }
    }
    const { error } = await supabase.from('seats').insert(toInsert)
    setBusy(false)
    if (error) setError(error.message)
    else await loadSeats()
  }

  async function clearAll() {
    if (!eventId) return
    if (!window.confirm('¿Eliminar todo el mapa de asientos de este evento?')) return
    setBusy(true)
    const { error } = await supabase.from('seats').delete().eq('event_id', eventId)
    setBusy(false)
    if (error) setError(error.message)
    else await loadSeats()
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Seat[]>()
    for (const s of seats) {
      const key = s.row_label ?? '—'
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [seats])

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/admin/eventos" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" />
            Eventos
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Armchair className="h-4 w-4 text-emerald-600" />
            Asientos
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Mapa de asientos</h1>
        <p className="mt-1 text-sm text-zinc-600">{eventName}</p>

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        {!loading && seats.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-6">
            <p className="text-sm font-medium text-zinc-800">Generar mapa</p>
            <p className="mt-1 text-sm text-zinc-600">
              Crea una cuadrícula de filas (A, B, C…) × asientos por fila.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-800">Filas</span>
                <input type="number" min={1} max={26} value={rowsN} onChange={(e) => setRowsN(Number(e.target.value))} className={inputCls} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-800">Asientos por fila</span>
                <input type="number" min={1} max={40} value={colsN} onChange={(e) => setColsN(Number(e.target.value))} className={inputCls} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-800">Precio (opcional)</span>
                <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
              </label>
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Generando…' : `Generar ${rowsN * colsN} asientos`}
            </button>
          </div>
        )}

        {seats.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-zinc-600">
              <Legend cls={STATUS_STYLE.available} label="Disponible" />
              <Legend cls={STATUS_STYLE.reserved} label="Reservado" />
              <Legend cls={STATUS_STYLE.confirmed} label="Confirmado" />
              <button
                type="button"
                onClick={clearAll}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar mapa
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="mx-auto mb-4 w-full rounded bg-zinc-900 py-1.5 text-center text-xs font-medium uppercase tracking-widest text-zinc-300">
                Escenario
              </div>
              <div className="flex flex-col gap-2">
                {grouped.map(([label, rowSeats]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-5 text-xs font-semibold text-zinc-400">{label}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {rowSeats.map((s) => (
                        <span
                          key={s.id}
                          title={`${s.seat_number ?? ''} · ${s.status}`}
                          className={`grid h-7 w-7 place-items-center rounded-md border text-[10px] font-semibold ${STATUS_STYLE[s.status]}`}
                        >
                          {s.column_number}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-sm text-zinc-500">
              {seats.filter((s) => s.status === 'available').length} disponibles de {seats.length}.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-4 w-4 rounded border ${cls}`} />
      {label}
    </span>
  )
}

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
