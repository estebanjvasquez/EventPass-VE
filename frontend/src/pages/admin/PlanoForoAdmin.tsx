import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Armchair, Columns3, Rows3 } from 'lucide-react'
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
  const [seatRows, setSeatRows] = useState(5)
  const [seatColumns, setSeatColumns] = useState(10)
  const [seatX, setSeatX] = useState(4)
  const [seatY, setSeatY] = useState(2)
  const [aisleAxis, setAisleAxis] = useState<'horizontal' | 'vertical'>('horizontal')
  const [aisleX, setAisleX] = useState(0)
  const [aisleY, setAisleY] = useState(7)
  const [aisleLength, setAisleLength] = useState(8)
  const [aisleThickness, setAisleThickness] = useState(1)

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
      return seat ? { ...item, status: seat.status === 'confirmed' ? 'assigned' : seat.status, label: row.label.replace('Asiento ', ''), assignedCompanyName: seat.reserved_for ?? undefined } : item
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
    if (seatX < 0 || seatY < 0 || seatX + seatColumns > columns || seatY + seatRows > rows) { setError('El bloque de sillas queda fuera del plano. Amplía la cuadrícula o ajusta su posición.'); return }
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('add_forum_seat_block', { p_map_id: map.id, p_rows: seatRows, p_columns: seatColumns, p_x: seatX, p_y: seatY })
    setBusy(false)
    if (error) setError(error.message); else await load()
  }
  async function addAisle() {
    if (!map) return
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('add_forum_aisle', { p_map_id: map.id, p_axis: aisleAxis, p_x: aisleX, p_y: aisleY, p_length: aisleLength, p_thickness: aisleThickness })
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
  async function resize(axis: 'x' | 'y', delta: number) {
    const source = elements.find(item => item.id === selectedId)
    if (!map || !source || source.kind === 'seat') { setError('El tamaño de cada asiento se mantiene fijo para conservar su reserva.'); return }
    const width = axis === 'x' ? Math.max(1, source.width + delta) : source.width
    const height = axis === 'y' ? Math.max(1, source.height + delta) : source.height
    const collision = elements.some(item => item.id !== source.id && item.kind !== 'object' && source.kind !== 'object' && source.x < item.x + item.width && source.x + width > item.x && source.y < item.y + item.height && source.y + height > item.y)
    if (collision || source.x + width > columns || source.y + height > rows) { setError('No hay espacio libre para ese tamaño.'); return }
    const { error } = await supabase.from('venue_map_elements').update({ width, height }).eq('id', source.id).eq('map_id', map.id)
    if (error) setError(error.message); else await load()
  }
  async function renameSelected() {
    const source = elements.find(item => item.id === selectedId)
    if (!map || !source) return
    const label = window.prompt('Nombre del elemento:', source.label)
    if (!label?.trim()) return
    const { error } = await supabase.from('venue_map_elements').update({ label: source.kind === 'seat' ? `Asiento ${label.trim()}` : label.trim() }).eq('id', source.id).eq('map_id', map.id)
    if (error) setError(error.message); else await load()
  }
  async function deleteSelected() {
    const source = elements.find(item => item.id === selectedId)
    if (!map || !source) return
    if (source.kind === 'seat') { setError('Las sillas se conservan para proteger las reservas.'); return }
    if (!window.confirm(`¿Eliminar ${source.label}?`)) return
    const { error } = await supabase.from('venue_map_elements').delete().eq('id', source.id).eq('map_id', map.id)
    if (error) setError(error.message); else { setSelectedId(null); await load() }
  }
  async function growGrid(axis: 'columns' | 'rows') {
    if (!map) return
    const key = axis === 'columns' ? 'grid_columns' : 'grid_rows'
    const next = (map.metadata?.[key] ?? (axis === 'columns' ? 18 : 12)) + 1
    const { error } = await supabase.from('venue_maps').update({ metadata: { ...(map.metadata ?? {}), [key]: next } }).eq('id', map.id)
    if (error) setError(error.message); else await load()
  }
  const columns = map?.metadata?.grid_columns ?? 18
  const rows = map?.metadata?.grid_rows ?? 12
  return <div className="min-h-[100dvh] bg-[#fafafa]">
    <header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link to="/admin/eventos" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600"><ArrowLeft className="h-4 w-4"/>Eventos</Link><span className="inline-flex items-center gap-2 text-sm font-semibold"><Armchair className="h-4 w-4 text-emerald-600"/>Asientos</span></div></header>
    <main className="mx-auto max-w-7xl px-5 py-7"><h1 className="text-2xl font-bold text-zinc-900">Asientos</h1><p className="mt-1 text-sm text-zinc-600">{eventName} · Diseña la sala con libertad: arrastra, redimensiona y nombra los elementos.</p>
      {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!map ? <button type="button" disabled={busy} onClick={createPlan} className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Creando…' : 'Crear plano de foro'}</button> : <>
        <div className="mt-6 grid gap-4 lg:grid-cols-3"><section className="rounded-xl border bg-white p-4"><b className="text-sm">Tamaño del plano</b><p className="mt-1 text-xs text-zinc-500">{columns} columnas × {rows} filas</p><div className="mt-3 flex gap-2"><button type="button" onClick={()=>growGrid('columns')} className={buttonCls}>+ columna</button><button type="button" onClick={()=>growGrid('rows')} className={buttonCls}>+ fila</button></div></section><section className="rounded-xl border bg-white p-4"><b className="text-sm">Añadir sillas</b><div className="mt-3 grid grid-cols-4 gap-2"><NumberInput label="Filas" value={seatRows} set={setSeatRows}/><NumberInput label="Columnas" value={seatColumns} set={setSeatColumns}/><NumberInput label="Columna" value={seatX+1} set={v=>setSeatX(v-1)}/><NumberInput label="Fila" value={seatY+1} set={v=>setSeatY(v-1)}/></div><button type="button" disabled={busy} onClick={addSeats} className={`${buttonCls} mt-3`}><Armchair className="h-4 w-4"/>Añadir {seatRows * seatColumns} sillas</button></section><section className="rounded-xl border bg-white p-4"><b className="text-sm">Añadir pasillo</b><div className="mt-3 grid grid-cols-5 gap-2"><select value={aisleAxis} onChange={e=>setAisleAxis(e.target.value as 'horizontal'|'vertical')} className={fieldCls}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select><NumberInput label="Col." value={aisleX+1} set={v=>setAisleX(v-1)}/><NumberInput label="Fila" value={aisleY+1} set={v=>setAisleY(v-1)}/><NumberInput label="Largo" value={aisleLength} set={setAisleLength}/><NumberInput label="Ancho" value={aisleThickness} set={setAisleThickness}/></div><button type="button" disabled={busy} onClick={addAisle} className={`${buttonCls} mt-3`}>{aisleAxis==='horizontal'?<Rows3 className="h-4 w-4"/>:<Columns3 className="h-4 w-4"/>}Añadir pasillo</button></section></div>
        {selectedId && <button type="button" onClick={renameSelected} className={`${buttonCls} mt-4`}>Cambiar nombre seleccionado</button>}
        <div className="mt-5"><FloorplanCanvas elements={elements} columns={columns} rows={rows} activeTool={null} aisleAxis="horizontal" selectedId={selectedId} onSelect={setSelectedId} onAssign={reserve} onClearSelection={() => setSelectedId(null)} onResize={resize} onPlace={() => {}} onMove={move} onDelete={deleteSelected} /></div>
        <p className="mt-4 text-sm text-zinc-500">Doble clic en un asiento para reservarlo a nombre de una persona o liberarlo. Los reservados se resaltan en ámbar y muestran el nombre; los confirmados no se pueden mover ni liberar.</p>
      </>}</main></div>
}

const buttonCls = 'inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 hover:border-emerald-400 disabled:opacity-50'
const fieldCls = 'rounded-lg border border-zinc-300 px-2 py-2 text-sm'
function NumberInput({ label, value, set }: { label: string; value: number; set: (value: number) => void }) { return <label className="text-xs text-zinc-600">{label}<input className={`${fieldCls} mt-1 w-full`} type="number" min={1} value={value} onChange={e=>set(Math.max(1, Number(e.target.value)||1))}/></label> }
