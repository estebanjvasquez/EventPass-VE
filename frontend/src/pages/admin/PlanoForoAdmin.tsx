import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Armchair, Columns3, Rows3, Presentation } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { FloorplanCanvas } from './floorplan/FloorplanCanvas'
import { fromVenueElement } from './floorplan/adapter'
import type { FloorplanElement } from './floorplan/model'

type MapRow = { id: string; metadata: { grid_columns?: number; grid_rows?: number } | null }
type Seat = { id: string; map_element_id: string | null; status: 'available' | 'reserved' | 'confirmed'; reserved_for: string | null }

export default function PlanoForoAdmin() {
  const { eventId } = useParams()
  const [map, setMap] = useState<MapRow | null>(null)
  const [elements, setElements] = useState<FloorplanElement[]>([])
  const [seatsByElement, setSeatsByElement] = useState<Record<string, Seat>>({})
  const [eventName, setEventName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!eventId) return
    const [{ data: event }, { data: found, error: mapError }, { data: seats }] = await Promise.all([
      supabase.from('events').select('name').eq('id', eventId).maybeSingle(),
      supabase.from('venue_maps').select('id, metadata').eq('event_id', eventId).eq('name', 'Plano de foro').maybeSingle(),
      supabase.from('seats').select('id,map_element_id,status,reserved_for').eq('event_id', eventId),
    ])
    if (mapError) { setError(mapError.message); return }
    setEventName((event as { name?: string } | null)?.name ?? '')
    setMap(found as MapRow | null)
    const index = Object.fromEntries(((seats ?? []) as Seat[]).filter(s => s.map_element_id).map(s => [s.map_element_id as string, s]))
    setSeatsByElement(index)
    if (!found) { setElements([]); return }
    const { data, error: elementError } = await supabase.from('venue_map_elements').select('id,label,element_type,status,x,y,width,height,metadata').eq('map_id', found.id)
    if (elementError) { setError(elementError.message); return }
    setElements((data ?? []).map((row: any) => {
      const item = fromVenueElement(row)
      const seat = index[item.id]
      return seat ? { ...item, status: seat.status === 'confirmed' ? 'assigned' : seat.status, label: row.label.replace('Asiento ', '') } : item
    }))
  }, [eventId])

  useEffect(() => { void load() }, [load])

  async function createPlan() {
    if (!eventId) return
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('create_forum_floorplan', { p_event_id: eventId })
    setBusy(false)
    if (error) setError(error.message); else await load()
  }
  async function addSeats() {
    if (!map) return
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('add_forum_seat_block', { p_map_id: map.id, p_rows: 5, p_columns: 10, p_x: 4, p_y: 2 })
    setBusy(false)
    if (error) setError(error.message); else await load()
  }
  async function addAisle(axis: 'horizontal' | 'vertical') {
    if (!map) return
    const max = axis === 'horizontal' ? (map.metadata?.grid_rows ?? 12) : (map.metadata?.grid_columns ?? 18)
    const value = window.prompt(`Inserta el pasillo ${axis === 'horizontal' ? 'horizontal' : 'vertical'} antes de la fila o columna (1–${max + 1}):`, String(Math.ceil(max / 2) + 1))
    if (value === null) return
    const index = Number(value) - 1
    if (!Number.isInteger(index) || index < 0 || index > max) { setError('Indica una fila o columna válida.'); return }
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('insert_forum_aisle', { p_map_id: map.id, p_axis: axis, p_index: index })
    setBusy(false)
    if (error) setError(error.message); else await load()
  }
  async function reserve(elementId: string) {
    const seat = seatsByElement[elementId]
    if (!seat) return
    if (seat.status === 'confirmed') { setError('Este asiento ya está confirmado por un registro.'); return }
    const name = seat.status === 'available' ? window.prompt('Reservar asiento a nombre de:', '') : ''
    if (name === null) return
    const { error } = await supabase.rpc('reserve_seat_for_name', { p_seat_id: seat.id, p_name: name ?? '' })
    if (error) setError(error.message); else await load()
  }
  async function move(id: string, x: number, y: number) {
    const source = elements.find(item => item.id === id)
    if (!map || !source) return
    const linkedSeat = seatsByElement[id]
    if (linkedSeat?.status === 'confirmed') { setError('Un asiento confirmado no se puede mover.'); return }
    const collision = elements.some(item => item.id !== id && item.kind !== 'object' && source.kind !== 'object' && x < item.x + item.width && x + source.width > item.x && y < item.y + item.height && y + source.height > item.y)
    if (collision || x < 0 || y < 0 || x + source.width > (map.metadata?.grid_columns ?? 18) || y + source.height > (map.metadata?.grid_rows ?? 12)) { setError('Ese lugar está ocupado o fuera del plano. Inserta un pasillo para abrir espacio.'); return }
    const { error } = await supabase.from('venue_map_elements').update({ x, y }).eq('id', id).eq('map_id', map.id)
    if (error) setError(error.message); else await load()
  }
  const columns = map?.metadata?.grid_columns ?? 18
  const rows = map?.metadata?.grid_rows ?? 12
  const reservedCount = useMemo(() => Object.values(seatsByElement).filter(s => s.status === 'reserved').length, [seatsByElement])
  return <div className="min-h-[100dvh] bg-[#fafafa]">
    <header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link to={`/admin/asientos/${eventId}`} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600"><ArrowLeft className="h-4 w-4"/>Asientos</Link><span className="inline-flex items-center gap-2 text-sm font-semibold"><Presentation className="h-4 w-4 text-emerald-600"/>Plano de foro</span></div></header>
    <main className="mx-auto max-w-7xl px-5 py-7"><h1 className="text-2xl font-bold text-zinc-900">Diseño físico del foro</h1><p className="mt-1 text-sm text-zinc-600">{eventName} · Arrastra asientos y elementos; los pasillos insertados desplazan el plano sin superponerlo.</p>
      {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!map ? <button type="button" disabled={busy} onClick={createPlan} className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Creando…' : 'Crear plano de foro'}</button> : <>
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={addSeats} className={buttonCls}><Armchair className="h-4 w-4"/>Agregar bloque de 50 asientos</button><button type="button" disabled={busy} onClick={() => addAisle('horizontal')} className={buttonCls}><Rows3 className="h-4 w-4"/>Insertar pasillo horizontal</button><button type="button" disabled={busy} onClick={() => addAisle('vertical')} className={buttonCls}><Columns3 className="h-4 w-4"/>Insertar pasillo vertical</button><span className="ml-auto self-center text-xs text-zinc-500">{Object.keys(seatsByElement).length} asientos · {reservedCount} reservados</span></div>
        <div className="mt-5"><FloorplanCanvas elements={elements} columns={columns} rows={rows} activeTool={null} aisleAxis="horizontal" selectedId={selectedId} onSelect={setSelectedId} onAssign={reserve} onClearSelection={() => setSelectedId(null)} onResize={() => setError('El tamaño de los asientos está fijado para conservar la numeración.')} onPlace={() => {}} onMove={move} onDelete={() => setError('Los asientos se eliminan desde el mapa de asientos para proteger las reservas.')} /></div>
        <p className="mt-4 text-sm text-zinc-500">Doble clic en un asiento para reservarlo a nombre de una persona o liberarlo. Las reservas confirmadas no se pueden mover ni liberar.</p>
      </>}</main></div>
}

const buttonCls = 'inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 hover:border-emerald-400 disabled:opacity-50'
