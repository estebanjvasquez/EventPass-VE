import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Home, Store } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ExhibitionCanvasEditor } from './ExhibitionCanvasEditor'

type EventInfo = { id: string; name: string; organization_id: string }
type Template = 'blank' | 'expo' | 'fair'

export default function StandsAdmin() {
  const { eventId } = useParams<{ eventId: string }>()
  const [event, setEvent] = useState<EventInfo | null>(null)
  const [mapId, setMapId] = useState<string | null>(null)
  const [columns, setColumns] = useState(40)
  const [rows, setRows] = useState(24)
  const [message, setMessage] = useState('Cargando plano…')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!eventId) return
    void (async () => {
      const [{ data: eventData, error: eventError }, { data: mapData, error: mapError }] = await Promise.all([
        supabase.from('events').select('id,name,organization_id').eq('id', eventId).maybeSingle(),
        supabase.from('venue_maps').select('id').eq('event_id', eventId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (eventError || !eventData) { setMessage(eventError?.message ?? 'No se encontró el evento.'); return }
      if (mapError) { setMessage(mapError.message); return }
      setEvent(eventData as EventInfo)
      setMapId(mapData?.id ?? null)
      setMessage(mapData ? '' : 'Crea el primer plano para comenzar.')
    })()
  }, [eventId])

  async function createPlan(template: Template) {
    if (!event || !eventId || busy) return
    setBusy(true); setMessage('Creando plano…')
    const metadata = { plan_type: 'exhibition_canvas', coordinate_system: 'metric', width_units: columns, height_units: rows, grid_columns: columns, grid_rows: rows, snap_step: 1, template }
    const { data: map, error: mapError } = await supabase.from('venue_maps').insert({ organization_id: event.organization_id, event_id: eventId, name: 'Plano de exposición', metadata }).select('id').single()
    if (mapError || !map) { setMessage(mapError?.message ?? 'No se pudo crear el plano.'); setBusy(false); return }
    const elements: Array<Record<string, unknown>> = []
    if (template !== 'blank') {
      const aisleX = Math.floor(columns / 2) - 1
      const aisle = template === 'fair' ? [{ map_id: map.id, element_type: 'aisle', label: 'Pasillo central', x: aisleX, y: 0, width: 2, height: rows, status: 'blocked', geometry: { x: aisleX, y: 0, width: 2, height: rows, rotation: 0 }, layer: 'circulation', z_index: 10, locked: false, visible: true, public_visible: true, style: { fill: '#cbd5e1' }, metadata: { floorplan_kind: 'object', object_type: 'aisle', purpose: 'Circulación principal' } }] : []
      const stands = Array.from({ length: rows * columns }, (_, index) => ({ x: index % columns, y: Math.floor(index / columns) })).filter((cell) => template !== 'fair' || (cell.x !== aisleX && cell.x !== aisleX + 1)).map((cell, index) => ({ map_id: map.id, element_type: 'stand', label: `Stand ${index + 1}`, x: cell.x, y: cell.y, width: 1, height: 1, status: 'available', geometry: { x: cell.x, y: cell.y, width: 1, height: 1, rotation: 0 }, layer: 'layout', z_index: 20, locked: false, visible: true, public_visible: true, style: { fill: '#d1fae5' }, metadata: { floorplan_kind: 'stand', object_type: 'stand', purpose: 'Stand' } }))
      elements.push(...aisle, ...stands)
    }
    if (elements.length) {
      const { error } = await supabase.from('venue_map_elements').insert(elements)
      if (error) { await supabase.from('venue_maps').delete().eq('id', map.id); setMessage(error.message); setBusy(false); return }
    }
    setMapId(map.id); setBusy(false); setMessage('')
  }

  if (!eventId) return null
  return <div className="min-h-[100dvh] bg-zinc-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4"><Link to={`/admin/eventos/${eventId}/administrar`} aria-label="Volver a administrar evento" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><Home className="h-4 w-4" />Admin del evento</Link><Store className="h-5 w-5 text-emerald-700" /><span className="font-semibold">Plano de exposición</span></div></header><main className="mx-auto max-w-[1600px] px-5 py-8">{event && <><h1 className="text-2xl font-bold">{event.name}</h1><p className="mt-1 text-sm text-zinc-600">Diseña el recinto con el canvas a escala, objetos libres, pasillos parciales y asignación de empresas.</p></>}{message && !mapId && <section className="mt-6 max-w-3xl rounded-2xl border bg-white p-5"><h2 className="font-semibold">Comenzar un plano nuevo</h2><p className="mt-1 text-sm text-zinc-600">Elige un tamaño amplio y una plantilla. Después podrás mover, redimensionar y eliminar cada elemento.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><button type="button" disabled={busy} onClick={() => void createPlan('blank')} className="rounded-xl border p-4 text-left hover:border-emerald-600 disabled:opacity-50"><strong className="block">Plano vacío</strong><span className="mt-1 block text-xs text-zinc-600">Añade pasillos, accesos y stands manualmente.</span></button><button type="button" disabled={busy} onClick={() => void createPlan('fair')} className="rounded-xl border p-4 text-left hover:border-emerald-600 disabled:opacity-50"><strong className="block">Feria con pasillo</strong><span className="mt-1 block text-xs text-zinc-600">Genera stands y un pasillo central editable.</span></button><button type="button" disabled={busy} onClick={() => void createPlan('expo')} className="rounded-xl border p-4 text-left hover:border-emerald-600 disabled:opacity-50"><strong className="block">Stands preparados</strong><span className="mt-1 block text-xs text-zinc-600">Genera una base de stands para ajustar.</span></button></div><div className="mt-4 grid max-w-sm grid-cols-2 gap-3"><label className="grid gap-1 text-xs font-medium">Ancho (m)<input type="number" min="4" value={columns} onChange={(e) => setColumns(Number(e.target.value))} className="rounded-lg border p-2 text-sm" /></label><label className="grid gap-1 text-xs font-medium">Alto (m)<input type="number" min="4" value={rows} onChange={(e) => setRows(Number(e.target.value))} className="rounded-lg border p-2 text-sm" /></label></div>{message && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}</section>}{mapId && <div className="mt-6"><ExhibitionCanvasEditor mapId={mapId} eventId={eventId} /></div>}</main></div>
}
