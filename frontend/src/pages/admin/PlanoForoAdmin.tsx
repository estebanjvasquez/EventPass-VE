import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Armchair, Columns3, Home, LoaderCircle, Rows3, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { FloorplanCanvas } from './floorplan/FloorplanCanvas'
import { fromVenueElement } from './floorplan/adapter'
import type { FloorplanElement } from './floorplan/model'

type MapRow = { id: string; metadata: { grid_columns?: number; grid_rows?: number } | null }
type Seat = { id: string; map_element_id: string | null; status: 'available' | 'reserved' | 'confirmed'; reserved_for: string | null; reservation_category_id: string | null; reservation_notes: string | null }
type ReservationCategory = { id: string; name: string; color: string; reserved_capacity: number; is_active: boolean }
type AiPlan = {
  summary: string; columns: number; rows: number; capacity: number
  stage: { x: number; y: number; width: number; height: number; label: string }
  aisles: Array<{ x: number; y: number; width: number; height: number; label: string; axis: 'horizontal' | 'vertical' }>
  entrances: Array<{ x: number; y: number; width: number; height: number; label: string }>
  seating_blocks: Array<{ x: number; y: number; columns: number; rows: number; label: string }>
}

export default function PlanoForoAdmin() {
  const { eventId } = useParams()
  const [map, setMap] = useState<MapRow | null>(null)
  const [elements, setElements] = useState<FloorplanElement[]>([])
  const [seatsByElement, setSeatsByElement] = useState<Record<string, Seat>>({})
  const [eventName, setEventName] = useState('')
  const [eventCapacity, setEventCapacity] = useState(0)
  const [registrationCount, setRegistrationCount] = useState(0)
  const [checkedInCount, setCheckedInCount] = useState(0)
  const [categories, setCategories] = useState<ReservationCategory[]>([])
  const [categoryName, setCategoryName] = useState('Invitados especiales')
  const [categoryColor, setCategoryColor] = useState('#7C3AED')
  const [categoryCapacity, setCategoryCapacity] = useState(10)
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seatQuantity, setSeatQuantity] = useState(1)
  const [seatMode, setSeatMode] = useState<'block' | 'row' | 'column'>('block')
  const [seatX, setSeatX] = useState(4)
  const [seatEndX, setSeatEndX] = useState(15)
  const [seatY, setSeatY] = useState(2)
  const [aisleAxis, setAisleAxis] = useState<'horizontal' | 'vertical'>('horizontal')
  const [aisleX, setAisleX] = useState(0)
  const [aisleY, setAisleY] = useState(7)
  const [aisleLength, setAisleLength] = useState(8)
  const [aisleThickness, setAisleThickness] = useState(1)
  const [accessAxis, setAccessAxis] = useState<'horizontal' | 'vertical'>('horizontal')
  const [accessX, setAccessX] = useState(0)
  const [accessY, setAccessY] = useState(0)
  const [accessLength, setAccessLength] = useState(2)
  const [aiPrompt, setAiPrompt] = useState('Crea un plano para un foro con escenario para 120 personas, un pasillo central vertical, un pasillo delante y otro detrás, y entradas laterales.')
  const [aiProposal, setAiProposal] = useState<AiPlan | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  const load = useCallback(async () => {
    if (!eventId) return
    const [{ data: event }, { data: found, error: mapError }, { data: seats }, { data: categoryRows }, { count }, { count: checkedIn }] = await Promise.all([
      supabase.from('events').select('name,total_slots').eq('id', eventId).maybeSingle(),
      supabase.from('venue_maps').select('id, metadata').eq('event_id', eventId).eq('name', 'Plano de foro').maybeSingle(),
      supabase.from('seats').select('id,map_element_id,status,reserved_for,reservation_category_id,reservation_notes').eq('event_id', eventId),
      supabase.from('seat_reservation_categories').select('id,name,color,reserved_capacity,is_active').eq('event_id', eventId).eq('is_active', true).order('sort_order').order('created_at'),
      supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', eventId).neq('status', 'rejected'),
      supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('attendance_status', 'checked_in').neq('status', 'rejected'),
    ])
    if (mapError) { setError(mapError.message); return }
    setEventName((event as { name?: string } | null)?.name ?? '')
    setEventCapacity((event as { total_slots?: number } | null)?.total_slots ?? 0)
    setRegistrationCount(count ?? 0)
    setCheckedInCount(checkedIn ?? 0)
    const loadedCategories = (categoryRows ?? []) as ReservationCategory[]
    setCategories(loadedCategories)
    setActiveCategoryId(current => loadedCategories.some(category => category.id === current) ? current : (loadedCategories[0]?.id ?? ''))
    setMap(found as MapRow | null)
    const index = Object.fromEntries(((seats ?? []) as Seat[]).filter(s => s.map_element_id).map(s => [s.map_element_id as string, s]))
    setSeatsByElement(index)
    if (!found) { setElements([]); return }
    const { data, error: elementError } = await supabase.from('venue_map_elements').select('id,label,element_type,status,x,y,width,height,metadata').eq('map_id', found.id)
    if (elementError) { setError(elementError.message); return }
    setElements((data ?? []).map((row: any) => {
      const item = fromVenueElement(row)
      const seat = index[item.id]
      const category = seat ? loadedCategories.find(value => value.id === seat.reservation_category_id) : undefined
      return seat ? { ...item, status: seat.status === 'confirmed' ? 'assigned' : seat.status, label: row.label.replace('Asiento ', ''), assignedCompanyName: seat.reserved_for ?? undefined, reservationColor: category?.color } : item
    }))
  }, [eventId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const refresh = window.setInterval(() => { void load() }, 15_000)
    return () => window.clearInterval(refresh)
  }, [load])

  async function createPlan() {
    if (!eventId) return
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('create_forum_floorplan', { p_event_id: eventId })
    setBusy(false)
    if (error) setError(error.message); else await load()
  }
  function currentPlan() {
    if (!map) return undefined
    const byRow = new Map<number, number[]>()
    elements.filter(item => item.kind === 'seat').forEach(item => byRow.set(item.y, [...(byRow.get(item.y) ?? []), item.x]))
    const seat_rows = [...byRow.entries()].sort(([a], [b]) => a - b).map(([y, xs]) => {
      const sorted = xs.sort((a, b) => a - b); const ranges: Array<[number, number]> = []
      sorted.forEach(x => { const last = ranges.at(-1); if (last && x === last[1] + 1) last[1] = x; else ranges.push([x, x]) })
      return { y, ranges }
    })
    return {
      columns, rows,
      fixed_elements: elements.filter(item => item.kind !== 'seat').map(item => ({
        type: item.kind === 'aisle' ? 'aisle' as const : item.kind === 'object' && item.objectType === 'access' ? 'entrance' as const : 'stage' as const,
        x: item.x, y: item.y, width: item.width, height: item.height, label: item.label,
        ...(item.kind === 'aisle' ? { axis: (item.width >= item.height ? 'horizontal' : 'vertical') as 'horizontal' | 'vertical' } : {}),
      })), seat_rows,
    }
  }
  async function generateAiProposal(overrideCapacityConstraints = false) {
    if (!eventId || aiPrompt.trim().length < 8) { setError('Describe el plano con al menos una frase.'); return }
    const api = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
    if (!api) { setError('La conexión con el servicio de IA no está configurada.'); return }
    setAiBusy(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 45_000)
    try {
      const response = await fetch(`${api}/api/ai/forum-floorplan/proposal`, { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ event_id: eventId, prompt: aiPrompt.trim(), current_plan: currentPlan(), override_capacity_constraints: overrideCapacityConstraints }) })
      const payload = await response.json().catch(() => null) as { error?: string; proposal?: AiPlan; needs_confirmation?: boolean; conflicts?: string[] } | null
      if (response.status === 409 && payload?.needs_confirmation) { if (window.confirm(`La solicitud difiere del aforo o las reservas actuales:\n\n${(payload.conflicts ?? []).join('\n')}\n\n¿Deseas construir el plano exactamente como lo indicaste?`)) await generateAiProposal(true); return }
      if (!response.ok || !payload?.proposal) { setError(payload?.error ?? 'No se pudo crear la propuesta de IA.'); return }
      setAiProposal(payload.proposal)
    } catch (requestError) {
      setError(requestError instanceof DOMException && requestError.name === 'AbortError'
        ? 'La creación superó los 45 segundos y se canceló. Inténtalo de nuevo; no se guardó ningún cambio.'
        : 'No se pudo conectar con el servicio de IA.')
    } finally {
      window.clearTimeout(timeout)
      setAiBusy(false)
    }
  }
  async function applyAiProposal() {
    if (!eventId || !aiProposal) return
    if (!window.confirm(`Aplicar esta propuesta reemplazará el plano actual por ${aiProposal.capacity} sillas editables. Las sillas reservadas o confirmadas no se reemplazan.`)) return
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('apply_ai_forum_floorplan', { p_event_id: eventId, p_plan: aiProposal })
    setBusy(false)
    if (error) setError(error.message); else { setAiProposal(null); setSelectedId(null); setSelectedSeatIds([]); await load() }
  }
  async function addSeats() {
    if (!map) return
    if (seatX < 0 || seatY < 0 || seatX >= columns || (seatMode !== 'column' && (seatEndX < seatX || seatEndX >= columns))) { setError('Revisa las columnas inicial y final del lote.'); return }
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('add_forum_seat_batch', { p_map_id: map.id, p_quantity: seatQuantity, p_x: seatX, p_y: seatY, p_end_column: seatMode === 'column' ? seatX : seatEndX, p_mode: seatMode })
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
  async function addAccess() {
    if (!map) return
    const width=accessAxis==='horizontal'?accessLength:1, height=accessAxis==='vertical'?accessLength:1
    if (accessX<0||accessY<0||accessX+width>columns||accessY+height>rows) { setError('El acceso queda fuera del plano.'); return }
    const collision=elements.some(item=>item.kind!=='object'&&accessX<item.x+item.width&&accessX+width>item.x&&accessY<item.y+item.height&&accessY+height>item.y)
    if (collision) { setError('El acceso debe ubicarse en un espacio libre.'); return }
    const { error }=await supabase.from('venue_map_elements').insert({map_id:map.id,element_type:'access_point',label:`Acceso ${accessAxis==='horizontal'?'horizontal':'vertical'}`,x:accessX,y:accessY,width,height,status:'blocked',metadata:{object_type:'access',rotation:accessAxis==='vertical'?90:0,purpose:'Acceso de asistentes'}})
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
  async function releaseSelectedSeat() {
    if (!selectedId) return
    const seat = seatsByElement[selectedId]
    if (!seat || seat.status !== 'reserved') return
    if (seat.reservation_category_id) {
      setBusy(true); setError(null)
      const { error: institutionalError } = await supabase.rpc('release_institutional_seats', { p_seat_ids: [seat.id] })
      setBusy(false)
      if (institutionalError) setError(institutionalError.message); else await load()
      return
    }
    if (!window.confirm(`¿Liberar ${seat.reserved_for ? `la reserva de ${seat.reserved_for}` : 'este asiento'}?`)) return
    setBusy(true); setError(null)
    const { error: releaseError } = await supabase.rpc('reserve_seat_for_name', { p_seat_id: seat.id, p_name: '' })
    if (releaseError) {
      setError(releaseError.message)
      setBusy(false)
      return
    }
    const { data: verified, error: verifyError } = await supabase.from('seats').select('status,reserved_for').eq('id', seat.id).single()
    setBusy(false)
    if (verifyError || verified?.status !== 'available' || verified?.reserved_for) {
      setError(verifyError?.message ?? 'La reserva no se liberó. Vuelve a intentarlo.')
      return
    }
    await load()
  }
  async function saveCategory() {
    if (!eventId) return
    setBusy(true); setError(null)
    const { data, error: categoryError } = await supabase.rpc('manage_seat_reservation_category', { p_event_id: eventId, p_name: categoryName.trim(), p_color: categoryColor, p_reserved_capacity: categoryCapacity, p_category_id: null })
    setBusy(false)
    if (categoryError) setError(categoryError.message); else { setActiveCategoryId(data as string); await load() }
  }
  async function assignSelectedToCategory() {
    const seatIds = selectedSeatIds.map(id => seatsByElement[id]?.id).filter(Boolean) as string[]
    if (!activeCategoryId || !seatIds.length) { setError('Selecciona una categoría y al menos una silla disponible.'); return }
    const reservedFor = window.prompt('Nombre del invitado, patrocinante o grupo (opcional):', '')
    if (reservedFor === null) return
    const notes = window.prompt('Nota interna (opcional):', '')
    if (notes === null) return
    setBusy(true); setError(null)
    const { error: assignError } = await supabase.rpc('assign_seats_to_reservation_category', { p_category_id: activeCategoryId, p_seat_ids: seatIds, p_reserved_for: reservedFor, p_notes: notes })
    setBusy(false)
    if (assignError) setError(assignError.message); else { setSelectedId(null); setSelectedSeatIds([]); await load() }
  }
  async function releaseInstitutionalSelected() {
    const seatIds = selectedSeatIds.map(id => seatsByElement[id]).filter(seat => seat?.reservation_category_id).map(seat => seat.id)
    if (!seatIds.length) { setError('Selecciona una o varias reservas institucionales.'); return }
    if (!window.confirm(`¿Liberar ${seatIds.length} reserva(s) institucional(es)?`)) return
    setBusy(true); setError(null)
    const { error: releaseError } = await supabase.rpc('release_institutional_seats', { p_seat_ids: seatIds })
    setBusy(false)
    if (releaseError) setError(releaseError.message); else { setSelectedId(null); setSelectedSeatIds([]); await load() }
  }
  async function deleteCategory(category: ReservationCategory) {
    if (!window.confirm(`¿Eliminar la categoría “${category.name}”? Primero deben estar liberadas todas sus sillas.`)) return
    setBusy(true); setError(null)
    const { error: deleteError } = await supabase.rpc('delete_seat_reservation_category', { p_category_id: category.id })
    setBusy(false)
    if (deleteError) setError(deleteError.message); else await load()
  }
  async function move(id: string, x: number, y: number) {
    const source = elements.find(item => item.id === id)
    if (!map || !source) return
    const moving = selectedSeatIds.includes(id) ? elements.filter(item => selectedSeatIds.includes(item.id)) : [source]
    const dx=x-source.x, dy=y-source.y
    if (moving.some(item => seatsByElement[item.id]?.status === 'confirmed')) { setError('Un asiento confirmado no se puede mover.'); return }
    const movingIds=new Set(moving.map(item=>item.id))
    const invalid=moving.some(item => item.x+dx<0 || item.y+dy<0 || item.x+dx+item.width>columns || item.y+dy+item.height>rows || elements.some(other=>!movingIds.has(other.id)&&other.kind!=='object'&&item.kind!=='object'&&item.x+dx<other.x+other.width&&item.x+dx+item.width>other.x&&item.y+dy<other.y+other.height&&item.y+dy+item.height>other.y))
    if (invalid) { setError('El grupo no cabe en ese lugar o se superpone a otro elemento.'); return }
    const results=await Promise.all(moving.map(item=>supabase.from('venue_map_elements').update({x:item.x+dx,y:item.y+dy}).eq('id',item.id).eq('map_id',map.id)))
    const failed=results.find(result=>result.error)?.error
    if (failed) setError(failed.message); else await load()
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
    if (source.kind === 'seat') { await deleteSeats(selectedSeatIds.length ? selectedSeatIds : [source.id]); return }
    if (source.kind === 'aisle') {
      if (!window.confirm('¿Eliminar este pasillo y cerrar el espacio? Las filas, columnas y números de asiento posteriores se ajustarán automáticamente.')) return
      const { error } = await supabase.rpc('delete_forum_aisle_and_adjust', { p_map_id: map.id, p_aisle_id: source.id })
      if (error) setError(error.message); else { setSelectedId(null); await load() }
      return
    }
    if (!window.confirm(`¿Eliminar ${source.label}?`)) return
    const { error } = await supabase.from('venue_map_elements').delete().eq('id', source.id).eq('map_id', map.id)
    if (error) setError(error.message); else { setSelectedId(null); await load() }
  }
  function toggleSeatSelection() {
    if (!selectedId || !seatsByElement[selectedId]) return
    setSelectedSeatIds(current => current.includes(selectedId) ? current.filter(id => id !== selectedId) : [...current, selectedId])
  }
  async function deleteSeats(elementIds: string[]) {
    if (!map || !elementIds.length) return
    const seatIds = elementIds.map(id => seatsByElement[id]?.id).filter(Boolean) as string[]
    if (!seatIds.length) return
    if (!window.confirm(`¿Eliminar ${seatIds.length} silla(s) libre(s)? Las reservadas o confirmadas deben liberarse primero.`)) return
    const { error } = await supabase.rpc('delete_forum_seats', { p_map_id: map.id, p_seat_ids: seatIds })
    if (error) setError(error.message); else { setSelectedId(null); setSelectedSeatIds([]); await load() }
  }
  async function resetPlan() {
    if (!map) return
    const planSeats = Object.values(seatsByElement)
    const confirmed = planSeats.filter(seat => seat.status === 'confirmed').length
    if (confirmed > 0) {
      setError(`No se puede eliminar: hay ${confirmed} asiento(s) confirmado(s). Reasigna o cancela esos registros primero.`)
      return
    }
    const reserved = planSeats.filter(seat => seat.status === 'reserved').length
    const warning = reserved > 0
      ? `El plano tiene ${reserved} asiento(s) reservado(s). Solo se liberarán reservas manuales; si alguno pertenece a un registro activo, la operación se bloqueará. ¿Continuar?`
      : '¿Eliminar definitivamente todo el plano, incluidos escenario, pasillos y sillas?'
    if (!window.confirm(warning)) return
    setBusy(true); setError(null)
    const { error: deleteError } = await supabase.rpc('delete_forum_floorplan', { p_map_id: map.id, p_release_manual_reservations: reserved > 0 })
    if (deleteError) {
      setError(deleteError.message)
      setBusy(false)
      return
    }
    const { data: remaining, error: verifyError } = await supabase.from('venue_maps').select('id').eq('id', map.id).maybeSingle()
    setBusy(false)
    if (verifyError || remaining) {
      setError(verifyError?.message ?? 'El plano sigue existiendo; no se confirmó la eliminación.')
      return
    }
    setSelectedId(null); setSelectedSeatIds([]); await load()
  }
  async function resizeGrid(axis: 'columns' | 'rows', delta: 1 | -1) {
    if (!map) return
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('resize_forum_grid', { p_map_id: map.id, p_axis: axis, p_delta: delta })
    setBusy(false)
    if (error) setError(error.message); else await load()
  }
  const columns = map?.metadata?.grid_columns ?? 18
  const rows = map?.metadata?.grid_rows ?? 12
  const selectedSeat = selectedId ? seatsByElement[selectedId] : null
  const reservedCapacity = categories.reduce((total, category) => total + category.reserved_capacity, 0)
  const publicCapacity = eventCapacity > 0 ? Math.max(0, eventCapacity - reservedCapacity) : null
  return <div className="min-h-[100dvh] bg-[#fafafa]">
    <header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link to={`/admin/eventos/${eventId}/administrar`} aria-label="Volver a administrar evento" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><Home className="h-4 w-4"/>Admin del evento</Link><span className="inline-flex items-center gap-2 text-sm font-semibold"><Armchair className="h-4 w-4 text-emerald-600"/>Asientos</span></div></header>
    <main className="mx-auto max-w-7xl px-5 py-7"><h1 className="text-2xl font-bold text-zinc-900">Asientos</h1><p className="mt-1 text-sm text-zinc-600">{eventName} · Diseña la sala con libertad: arrastra, redimensiona y nombra los elementos.</p>
      {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <CapacitySummary eventCapacity={eventCapacity} registrationCount={registrationCount} checkedInCount={checkedInCount} reservedCapacity={reservedCapacity}/>
      <ReservationManager eventCapacity={eventCapacity} publicCapacity={publicCapacity} registrationCount={registrationCount} reservedCapacity={reservedCapacity} categories={categories} seats={Object.values(seatsByElement)} activeCategoryId={activeCategoryId} setActiveCategoryId={setActiveCategoryId} categoryName={categoryName} setCategoryName={setCategoryName} categoryColor={categoryColor} setCategoryColor={setCategoryColor} categoryCapacity={categoryCapacity} setCategoryCapacity={setCategoryCapacity} selectedCount={selectedSeatIds.length} busy={busy} onCreate={saveCategory} onAssign={assignSelectedToCategory} onRelease={releaseInstitutionalSelected} onDelete={deleteCategory}/>
      {!map ? <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><section className="rounded-xl border bg-white p-5"><b className="text-sm">Diseño manual</b><p className="mt-1 text-sm text-zinc-600">Comienza con una cuadrícula vacía, luego añade escenario, pasillos, accesos y sillas.</p><button type="button" disabled={busy} onClick={createPlan} className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Creando…' : 'Crear plano manual'}</button></section><AiPlanAssistant prompt={aiPrompt} setPrompt={setAiPrompt} proposal={aiProposal} busy={aiBusy} applying={busy} onGenerate={generateAiProposal} onApply={applyAiProposal}/></div> : <>
        <div className="mt-6"><AiPlanAssistant prompt={aiPrompt} setPrompt={setAiPrompt} proposal={aiProposal} busy={aiBusy} applying={busy} onGenerate={generateAiProposal} onApply={applyAiProposal} existingPlan/></div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4"><section className="rounded-xl border bg-white p-4"><b className="text-sm">Tamaño del plano</b><p className="mt-1 text-xs text-zinc-500">{columns} columnas × {rows} filas. Al reducir, el plano reubica los elementos sin eliminarlos.</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={()=>resizeGrid('columns',1)} className={buttonCls}>+ columna</button><button type="button" disabled={busy} onClick={()=>resizeGrid('columns',-1)} className={buttonCls}>− columna</button><button type="button" disabled={busy} onClick={()=>resizeGrid('rows',1)} className={buttonCls}>+ fila</button><button type="button" disabled={busy} onClick={()=>resizeGrid('rows',-1)} className={buttonCls}>− fila</button></div></section><section className="rounded-xl border bg-white p-4"><b className="text-sm">Añadir sillas</b><p className="mt-1 text-xs text-zinc-500">Define el patrón y el rango. Un lote vuelve a la columna inicial en cada fila y respeta pasillos.</p><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs text-zinc-600">Distribución<select value={seatMode} onChange={e=>setSeatMode(e.target.value as 'block'|'row'|'column')} className={`${fieldCls} mt-1 w-full`}><option value="block">Lote por filas</option><option value="row">Una sola fila</option><option value="column">Una sola columna</option></select></label><NumberInput label="Cantidad de sillas" value={seatQuantity} set={setSeatQuantity} max={1000}/><NumberInput label="Desde columna" value={seatX+1} set={v=>setSeatX(v-1)}/>{seatMode!=='column'&&<NumberInput label="Hasta columna" value={seatEndX+1} set={v=>setSeatEndX(v-1)}/>}<NumberInput label="Desde fila" value={seatY+1} set={v=>setSeatY(v-1)}/></div><button type="button" disabled={busy} onClick={addSeats} className={`${buttonCls} mt-3`}><Armchair className="h-4 w-4"/>Añadir {seatQuantity} silla{seatQuantity===1?'':'s'}</button></section><section className="rounded-xl border bg-white p-4"><b className="text-sm">Añadir pasillo</b><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"><select value={aisleAxis} onChange={e=>setAisleAxis(e.target.value as 'horizontal'|'vertical')} className={fieldCls}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select><NumberInput label="Col." value={aisleX+1} set={v=>setAisleX(v-1)}/><NumberInput label="Fila" value={aisleY+1} set={v=>setAisleY(v-1)}/><NumberInput label="Largo" value={aisleLength} set={setAisleLength}/><NumberInput label="Ancho" value={aisleThickness} set={setAisleThickness}/></div><button type="button" disabled={busy} onClick={addAisle} className={`${buttonCls} mt-3`}>{aisleAxis==='horizontal'?<Rows3 className="h-4 w-4"/>:<Columns3 className="h-4 w-4"/>}Añadir pasillo</button></section><section className="rounded-2xl border bg-white p-4"><b className="text-sm">Añadir acceso</b><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><select value={accessAxis} onChange={e=>setAccessAxis(e.target.value as 'horizontal'|'vertical')} className={fieldCls}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select><NumberInput label="Col." value={accessX+1} set={v=>setAccessX(v-1)}/><NumberInput label="Fila" value={accessY+1} set={v=>setAccessY(v-1)}/><NumberInput label="Largo" value={accessLength} set={setAccessLength}/></div><button type="button" onClick={addAccess} className={`${buttonCls} mt-3`}>Añadir acceso</button></section></div>
        <div className="mt-4 flex flex-wrap gap-2">{selectedId && <><button type="button" onClick={renameSelected} className={buttonCls}>Cambiar nombre</button>{selectedSeat && <button type="button" onClick={toggleSeatSelection} className={buttonCls}>{selectedSeatIds.includes(selectedId) ? 'Quitar de selección' : 'Añadir a selección'}</button>}{selectedSeat?.status === 'available' && <button type="button" disabled={busy} onClick={()=>reserve(selectedId)} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">Reservar asiento</button>}{selectedSeat?.status === 'reserved' && <button type="button" disabled={busy} onClick={releaseSelectedSeat} className="rounded-lg border border-amber-400 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50">Liberar reserva</button>}{selectedSeat?.status === 'confirmed' && <span className="rounded-lg bg-zinc-100 px-3.5 py-2 text-sm font-semibold text-zinc-600">Vinculado a registro</span>}</>}{selectedSeatIds.length > 0 && <button type="button" onClick={()=>deleteSeats(selectedSeatIds)} className="rounded-lg border border-red-300 px-3.5 py-2 text-sm font-semibold text-red-700">Eliminar {selectedSeatIds.length} seleccionada(s)</button>}<button type="button" disabled={busy} onClick={resetPlan} className="ml-auto rounded-lg border border-red-300 px-3.5 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{busy ? 'Procesando…' : 'Eliminar todo el plano'}</button></div>
        <div className="mt-5"><FloorplanCanvas elements={elements} columns={columns} rows={rows} activeTool={null} aisleAxis="horizontal" selectedId={selectedId} selectedIds={selectedSeatIds} onSelect={id=>{ setSelectedId(id); setSelectedSeatIds([]) }} onToggleSelect={id=>{ if (!seatsByElement[id]) { setSelectedId(id); setSelectedSeatIds([]); return } setSelectedSeatIds(current=>{ const next=current.includes(id)?current.filter(value=>value!==id):[...current,id]; setSelectedId(next.at(-1) ?? null); return next }) }} onAssign={reserve} onClearSelection={() => { setSelectedId(null); setSelectedSeatIds([]) }} onResize={resize} onPlace={() => {}} onMove={move} onDelete={deleteSelected} /></div>
        <p className="mt-4 text-sm text-zinc-500">Selecciona una silla y usa “Reservar asiento” o “Liberar reserva”. También puedes hacer doble clic. Un asiento vinculado a un registro activo está protegido. Usa Ctrl + clic para seleccionar varias sillas. Al eliminar un pasillo, el espacio se cierra y los asientos posteriores actualizan su posición.</p>
      </>}</main></div>
}

const buttonCls = 'inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 hover:border-emerald-400 disabled:opacity-50'
const fieldCls = 'rounded-lg border border-zinc-300 px-2 py-2 text-sm'
function NumberInput({ label, value, set, max }: { label: string; value: number; set: (value: number) => void; max?: number }) { return <label className="text-xs text-zinc-600">{label}<input className={`${fieldCls} mt-1 w-full`} type="number" min={1} max={max} value={value} onChange={e=>set(Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(1, Number(e.target.value)||1)))}/></label> }

function CapacitySummary({ eventCapacity, registrationCount, checkedInCount, reservedCapacity }: { eventCapacity: number; registrationCount: number; checkedInCount: number; reservedCapacity: number }) {
  const available = eventCapacity > 0 ? Math.max(0, eventCapacity - registrationCount - reservedCapacity) : null
  const pendingArrival = Math.max(0, registrationCount - checkedInCount)
  return <section className="mt-6 rounded-xl border border-emerald-200 bg-white p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold text-zinc-900">Control de aforo</h2><p className="mt-1 text-sm text-zinc-600">Disponibilidad para decidir si se abren más cupos o se agregan sillas.</p></div><span className="text-xs text-zinc-500">Actualización automática cada 15 s.</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Aforo total" value={eventCapacity || 'Sin límite'} tone="zinc"/><Metric label="Registros online activos" value={registrationCount} tone="sky"/><Metric label="Ingresos acreditados" value={checkedInCount} tone="emerald"/><Metric label="Aún sin ingreso" value={pendingArrival} tone="amber"/><Metric label="Cupos disponibles" value={available ?? 'Sin límite'} tone="violet"/></div><p className="mt-3 text-xs text-zinc-500">Cupos disponibles = aforo total − registros activos − reservas institucionales. Los ingresos acreditados miden la asistencia real y no liberan un cupo ya reservado por un registro.</p></section>
}
function Metric({ label, value, tone }: { label: string; value: number | string; tone: 'zinc' | 'sky' | 'emerald' | 'amber' | 'violet' }) { const tones = { zinc: 'bg-zinc-100 text-zinc-800', sky: 'bg-sky-50 text-sky-900', emerald: 'bg-emerald-50 text-emerald-900', amber: 'bg-amber-50 text-amber-900', violet: 'bg-violet-50 text-violet-900' }; return <div className={`rounded-lg p-3 text-center ${tones[tone]}`}><b className="block text-xl">{value}</b><span className="text-xs font-medium">{label}</span></div> }

function ReservationManager({ eventCapacity, publicCapacity, registrationCount, reservedCapacity, categories, seats, activeCategoryId, setActiveCategoryId, categoryName, setCategoryName, categoryColor, setCategoryColor, categoryCapacity, setCategoryCapacity, selectedCount, busy, onCreate, onAssign, onRelease, onDelete }: { eventCapacity: number; publicCapacity: number | null; registrationCount: number; reservedCapacity: number; categories: ReservationCategory[]; seats: Seat[]; activeCategoryId: string; setActiveCategoryId: (value: string) => void; categoryName: string; setCategoryName: (value: string) => void; categoryColor: string; setCategoryColor: (value: string) => void; categoryCapacity: number; setCategoryCapacity: (value: number) => void; selectedCount: number; busy: boolean; onCreate: () => void; onAssign: () => void; onRelease: () => void; onDelete: (category: ReservationCategory) => void }) {
  return <section className="mt-6 rounded-xl border border-violet-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold text-zinc-900">Reservas institucionales</h2><p className="mt-1 text-sm text-zinc-600">Separa cupos del registro público y asigna sillas por categoría. Cada operación queda auditada.</p></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded-lg bg-zinc-100 px-3 py-2"><b className="block text-base">{eventCapacity || '∞'}</b>Aforo</span><span className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800"><b className="block text-base">{publicCapacity ?? '∞'}</b>Públicos</span><span className="rounded-lg bg-violet-50 px-3 py-2 text-violet-800"><b className="block text-base">{reservedCapacity}</b>Reservados</span></div></div><p className="mt-3 text-xs text-zinc-500">Registros activos: {registrationCount}. Los cupos institucionales no pueden ser consumidos por el registro general, aunque todavía no tengan silla asignada.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_110px_120px_auto]"><input value={categoryName} onChange={e=>setCategoryName(e.target.value)} maxLength={60} className={fieldCls} aria-label="Nombre de categoría" placeholder="Ej.: Patrocinantes"/><label className="flex items-center gap-2 rounded-lg border px-2 text-xs">Color<input type="color" value={categoryColor} onChange={e=>setCategoryColor(e.target.value.toUpperCase())} className="h-8 w-10"/></label><label className="text-xs text-zinc-600">Cantidad<input type="number" min={0} value={categoryCapacity} onChange={e=>setCategoryCapacity(Math.max(0,Number(e.target.value)||0))} className={`${fieldCls} mt-1 w-full`}/></label><button type="button" disabled={busy} onClick={onCreate} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Crear categoría</button></div>{categories.length>0&&<div className="mt-4 flex flex-wrap gap-2" aria-label="Leyenda de reservas">{categories.map(category=>{const assigned=seats.filter(seat=>seat.reservation_category_id===category.id).length;return <div key={category.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${activeCategoryId===category.id?'ring-2 ring-violet-500':''}`}><button type="button" onClick={()=>setActiveCategoryId(category.id)} className="flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{backgroundColor:category.color}}/>{category.name} · {assigned}/{category.reserved_capacity}</button><button type="button" onClick={()=>onDelete(category)} aria-label={`Eliminar ${category.name}`} className="text-zinc-400 hover:text-red-700"><Trash2 className="h-3.5 w-3.5"/></button></div>})}</div>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy||!activeCategoryId||selectedCount===0} onClick={onAssign} className="rounded-lg bg-violet-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40">Asignar selección a categoría</button><button type="button" disabled={busy||selectedCount===0} onClick={onRelease} className={buttonCls}>Liberar reservas seleccionadas</button><span className="self-center text-xs text-zinc-500">Ctrl + clic para seleccionar varias sillas.</span></div></section>
}

function AiPlanAssistant({ prompt, setPrompt, proposal, busy, applying, onGenerate, onApply, existingPlan = false }: { prompt: string; setPrompt: (value: string) => void; proposal: AiPlan | null; busy: boolean; applying: boolean; onGenerate: () => void; onApply: () => void; existingPlan?: boolean }) {
  const examples = [
    ['Foro 120', 'Crea un plano para un foro con escenario para 120 personas, un pasillo central vertical, un pasillo delante y otro detrás, y entradas laterales.'],
    ['Auditorio 200', 'Crea un auditorio para 200 personas con escenario, pasillo central, pasillos laterales y dos entradas posteriores.'],
    ['Foro compacto 80', 'Crea un foro compacto para 80 personas con escenario, un pasillo central y entradas a ambos lados.'],
  ] as const
  return <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-5">
    <div className="flex items-start gap-3"><span className="rounded-lg bg-violet-100 p-2 text-violet-700"><Sparkles className="h-5 w-5"/></span><div><b className="text-sm text-zinc-900">Asistente de plano con IA</b><p className="mt-1 text-sm text-zinc-600">Describe el montaje. La IA interpreta la solicitud y EventPass calcula un plano válido y editable antes de mostrarlo.</p></div></div>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Ejemplos de planos">{examples.map(([label, value])=><button key={label} type="button" disabled={busy || applying} onClick={()=>setPrompt(value)} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:border-violet-400 disabled:opacity-50">{label}</button>)}</div>
    <label className="mt-3 block text-xs font-semibold text-zinc-700">¿Cómo debe ser el plano?<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={4} maxLength={1600} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm font-normal text-zinc-800" placeholder="Ej.: escenario para 200 personas, pasillo central, dos laterales y entradas al fondo."/></label>
    <p className="mt-2 text-xs text-zinc-500">Indica siempre la capacidad. No incluyas nombres, correos ni otros datos personales.</p>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy || applying} onClick={onGenerate} aria-busy={busy} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true"/> : <Sparkles className="h-4 w-4"/>}{busy ? 'Construyendo con IA…' : existingPlan ? 'Proponer modificación' : 'Crear propuesta'}</button>{proposal && <button type="button" disabled={busy || applying} onClick={onApply} className="rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50">{applying ? 'Aplicando…' : 'Aplicar al plano'}</button>}</div>
    {busy && <div role="status" aria-live="polite" className="mt-4 flex items-center gap-3 rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm text-violet-900"><LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-violet-700" aria-hidden="true"/><div><p className="font-semibold">La IA está construyendo el auditorio</p><p className="mt-0.5 text-xs text-zinc-600">Interpretando capacidad, escenario, pasillos y accesos. Normalmente tarda pocos segundos.</p></div></div>}
    {proposal && <div className="mt-4 rounded-lg border border-violet-200 bg-white p-4 text-sm"><p className="font-semibold text-zinc-900">Propuesta validada: {proposal.capacity} sillas · {proposal.columns} columnas × {proposal.rows} filas</p><p className="mt-1 text-zinc-600">{proposal.summary}</p><p className="mt-2 text-xs text-zinc-500">Incluye escenario, {proposal.aisles.length} pasillo(s), {proposal.entrances.length} acceso(s) y {proposal.seating_blocks.length} bloque(s). La capacidad y las colisiones fueron comprobadas automáticamente; puedes editar todo después de aplicarla.</p></div>}
  </section>
}
