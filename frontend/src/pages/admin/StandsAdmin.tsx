import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, Grid2X2, MapPin, Store, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type StandStatus = 'available' | 'reserved' | 'assigned' | 'blocked'
type Stand = { id: string; label: string; status: StandStatus; x: number; y: number }
type MapElement = { id: string; label: string; element_type: 'zone' | 'aisle'; x: number; y: number; width: number; height: number }
type Company = { id: string; name: string; contact_name: string | null; contact_email: string | null; kind: 'partner' | 'sponsor' | 'exhibitor' | 'buyer' }
type Assignment = { id: string; element_id: string; company_id: string; status: 'reserved' | 'confirmed' | 'cancelled'; notes: string | null }

const statusCopy: Record<StandStatus, string> = { available: 'Disponible', reserved: 'Reservado', assigned: 'Asignado', blocked: 'Bloqueado' }
const statusClass: Record<StandStatus, string> = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-500',
  reserved: 'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500',
  assigned: 'border-sky-400 bg-sky-50 text-sky-950 hover:border-sky-600',
  blocked: 'border-zinc-300 bg-zinc-100 text-zinc-500 hover:border-zinc-400',
}

export default function StandsAdmin() {
  const { eventId } = useParams()
  const [name, setName] = useState('')
  const [org, setOrg] = useState<string | null>(null)
  const [mapId, setMapId] = useState<string | null>(null)
  const [stands, setStands] = useState<Stand[]>([])
  const [mapElements, setMapElements] = useState<MapElement[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [rows, setRows] = useState(4)
  const [cols, setCols] = useState(6)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [newContact, setNewContact] = useState('')
  const [notes, setNotes] = useState('')
  const [elementType, setElementType] = useState<'zone' | 'aisle'>('aisle')
  const [elementLabel, setElementLabel] = useState('Pasillo central')
  const [elementX, setElementX] = useState(0)
  const [elementY, setElementY] = useState(0)
  const [elementWidth, setElementWidth] = useState(2)
  const [elementHeight, setElementHeight] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!eventId) return
    setError(null)
    const { data: map, error: mapError } = await supabase.from('venue_maps').select('id').eq('event_id', eventId).limit(1).maybeSingle()
    if (mapError) { setError(mapError.message); return }
    setMapId(map?.id ?? null)
    if (!map?.id) { setStands([]); setMapElements([]); setAssignments([]); return }
    const [{ data: elements, error: elementsError }, { data: boothData, error: boothsError }] = await Promise.all([
      supabase.from('venue_map_elements').select('id,label,status,x,y,width,height,element_type').eq('map_id', map.id).order('y').order('x'),
      supabase.from('booth_assignments').select('id,element_id,company_id,status,notes').neq('status', 'cancelled'),
    ])
    if (elementsError || boothsError) { setError(elementsError?.message ?? boothsError?.message ?? 'No se pudo cargar el plano'); return }
    const standRows = (elements ?? []).filter((element) => element.element_type === 'stand') as Stand[]
    const elementIds = new Set(standRows.map((element) => element.id))
    setStands(standRows)
    setMapElements((elements ?? []).filter((element) => element.element_type === 'zone' || element.element_type === 'aisle') as MapElement[])
    setAssignments(((boothData ?? []) as Assignment[]).filter((assignment) => elementIds.has(assignment.element_id)))
  }, [eventId])

  const loadCompanies = useCallback(async (organizationId: string) => {
    const { data, error: companyError } = await supabase.from('companies').select('id,name,contact_name,contact_email,kind').eq('organization_id', organizationId).order('name')
    if (companyError) setError(companyError.message)
    else setCompanies((data ?? []) as Company[])
  }, [])

  useEffect(() => {
    if (!eventId) return
    supabase.from('events').select('name,organization_id').eq('id', eventId).maybeSingle().then(({ data, error: eventError }) => {
      if (eventError || !data) { setError(eventError?.message ?? 'Evento no encontrado'); return }
      setName(data.name)
      setOrg(data.organization_id)
      void load()
      void loadCompanies(data.organization_id)
    })
  }, [eventId, load, loadCompanies])

  const assignmentByStand = useMemo(() => new Map(assignments.map((assignment) => [assignment.element_id, assignment])), [assignments])
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies])
  const selected = stands.find((stand) => stand.id === selectedId) ?? null
  const selectedAssignment = selected ? assignmentByStand.get(selected.id) : undefined
  const assignedCompany = selectedAssignment ? companyById.get(selectedAssignment.company_id) : undefined
  const layoutColumns = Math.max(...stands.map((stand) => Number(stand.x) + 1), 1)
  const counts = useMemo(() => stands.reduce<Record<StandStatus, number>>((total, stand) => ({ ...total, [stand.status]: total[stand.status] + 1 }), { available: 0, reserved: 0, assigned: 0, blocked: 0 }), [stands])

  function selectStand(stand: Stand) {
    const assignment = assignmentByStand.get(stand.id)
    setSelectedId(stand.id)
    setCompanyId(assignment?.company_id ?? '')
    setNewCompany('')
    setNewContact('')
    setNotes(assignment?.notes ?? '')
  }

  async function generate() {
    if (!eventId || !org || stands.length) return
    setBusy(true); setError(null)
    let id = mapId
    if (!id) {
      const { data, error: insertMapError } = await supabase.from('venue_maps').insert({ organization_id: org, event_id: eventId, name: 'Plano de exposición' }).select('id').single()
      if (insertMapError || !data) { setError(insertMapError?.message ?? 'No se pudo crear el plano'); setBusy(false); return }
      id = data.id; setMapId(id)
    }
    const elements = Array.from({ length: rows * cols }, (_, index) => ({ map_id: id, element_type: 'stand', label: `S${index + 1}`, x: index % cols, y: Math.floor(index / cols), width: 1, height: 1, status: 'available' }))
    const { error: generateError } = await supabase.from('venue_map_elements').insert(elements)
    setBusy(false)
    if (generateError) setError(generateError.message); else void load()
  }

  async function saveAssignment() {
    if (!selected || !org) return
    if (!companyId && !newCompany.trim()) { setError('Selecciona o crea una empresa antes de asignar el stand.'); return }
    setBusy(true); setError(null)
    let targetCompanyId = companyId
    if (!targetCompanyId) {
      const { data, error: createError } = await supabase.from('companies').insert({ organization_id: org, name: newCompany.trim(), contact_name: newContact.trim() || null, kind: 'exhibitor' }).select('id').single()
      if (createError || !data) { setError(createError?.message ?? 'No se pudo crear la empresa'); setBusy(false); return }
      targetCompanyId = data.id
    }
    const assignment = assignmentByStand.get(selected.id)
    const payload = { company_id: targetCompanyId, status: 'confirmed', notes: notes.trim() || null }
    const { error: assignmentError } = assignment
      ? await supabase.from('booth_assignments').update(payload).eq('id', assignment.id)
      : await supabase.from('booth_assignments').insert({ element_id: selected.id, ...payload })
    if (!assignmentError) {
      const { error: standError } = await supabase.from('venue_map_elements').update({ status: 'assigned' }).eq('id', selected.id)
      if (standError) setError(standError.message)
    } else setError(assignmentError.message)
    setBusy(false)
    if (!assignmentError) { await loadCompanies(org); await load(); setSelectedId(null) }
  }

  async function releaseStand() {
    if (!selected) return
    setBusy(true); setError(null)
    const assignment = assignmentByStand.get(selected.id)
    const { error: deleteError } = assignment ? await supabase.from('booth_assignments').delete().eq('id', assignment.id) : { error: null }
    if (!deleteError) {
      const { error: standError } = await supabase.from('venue_map_elements').update({ status: 'available' }).eq('id', selected.id)
      if (standError) setError(standError.message)
    } else setError(deleteError.message)
    setBusy(false)
    if (!deleteError) { await load(); setSelectedId(null) }
  }

  async function addMapElement(event: React.FormEvent) {
    event.preventDefault()
    if (!mapId || !elementLabel.trim()) return
    setBusy(true); setError(null)
    const { error: insertError } = await supabase.from('venue_map_elements').insert({ map_id: mapId, element_type: elementType, label: elementLabel.trim(), x: elementX, y: elementY, width: elementWidth, height: elementHeight, status: 'blocked' })
    if (insertError) { setError(insertError.message); setBusy(false); return }

    // Un pasillo inserta espacio real: desplaza los stands posteriores en la
    // dirección de mayor alcance, evitando que quede superpuesto al plano.
    if (elementType === 'aisle') {
      const horizontal = elementWidth >= layoutColumns
      const affected = stands.filter((stand) => horizontal ? Number(stand.y) >= elementY : Number(stand.x) >= elementX)
      const updates = affected.map((stand) => supabase.from('venue_map_elements').update(horizontal ? { y: Number(stand.y) + elementHeight } : { x: Number(stand.x) + elementWidth }).eq('id', stand.id))
      const results = await Promise.all(updates)
      const moveError = results.find((result) => result.error)?.error
      if (moveError) setError(`El pasillo fue creado, pero no se pudieron reubicar los stands: ${moveError.message}`)
    }
    setBusy(false)
    setElementLabel(elementType === 'aisle' ? 'Pasillo' : 'Zona')
    await load()
  }

  return <div className="min-h-[100dvh] bg-zinc-50 text-zinc-950">
    <header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4"><Link to="/admin/eventos" aria-label="Volver a eventos" className="rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 active:translate-y-px"><ArrowLeft className="h-4 w-4" /></Link><Store className="h-5 w-5 text-emerald-700" /><span className="font-semibold">Plano de exposición</span></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{name || 'Exposición'}</h1>
      <p className="mt-1 text-sm text-zinc-600">Selecciona un stand para asignar la empresa. El plano muestra siempre quién ocupa cada ubicación.</p>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!stands.length ? <section className="mt-6 max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm shadow-zinc-200/50"><h2 className="font-semibold">Crear plano inicial</h2><p className="mt-1 text-sm text-zinc-600">Define la cuadrícula base. Luego podrás asignar una empresa a cada stand.</p><div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Filas<input className="rounded-lg border border-zinc-300 px-3 py-2 text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" type="number" min={1} max={20} value={rows} onChange={(event) => setRows(Number(event.target.value))} /></label><label className="grid gap-2 text-sm font-medium">Stands por fila<input className="rounded-lg border border-zinc-300 px-3 py-2 text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" type="number" min={1} max={30} value={cols} onChange={(event) => setCols(Number(event.target.value))} /></label></div><button disabled={busy} onClick={generate} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 active:translate-y-px disabled:opacity-60"><Grid2X2 className="h-4 w-4" />{busy ? 'Generando…' : `Generar ${rows * cols} stands`}</button></section> : <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/50"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Distribución de stands</h2><p className="mt-1 text-sm text-zinc-600">Haz clic en cualquier stand para consultar o cambiar su asignación.</p></div><div className="flex flex-wrap gap-2 text-xs">{(['available', 'reserved', 'assigned', 'blocked'] as StandStatus[]).map((status) => <span key={status} className={`rounded-full border px-2.5 py-1 font-medium ${statusClass[status]}`}>{counts[status]} {statusCopy[status].toLowerCase()}</span>)}</div></div><div className="mt-6 overflow-x-auto pb-2"><div className="grid min-w-[620px] gap-3" style={{ gridTemplateColumns: `repeat(${layoutColumns}, minmax(92px, 1fr))` }}>{mapElements.map((element) => <div key={element.id} className={`flex min-h-12 items-center justify-center rounded-lg border border-dashed p-2 text-center text-xs font-semibold ${element.element_type === 'aisle' ? 'border-zinc-300 bg-zinc-100 text-zinc-500' : 'border-indigo-200 bg-indigo-50 text-indigo-800'}`} style={{ gridColumn: `${Number(element.x) + 1} / span ${Number(element.width)}`, gridRow: `${Number(element.y) + 1} / span ${Number(element.height)}` }}>{element.label}</div>)}{stands.map((stand) => { const assignment = assignmentByStand.get(stand.id); const company = assignment ? companyById.get(assignment.company_id) : undefined; return <button key={stand.id} onClick={() => selectStand(stand)} className={`min-h-28 rounded-xl border-2 p-3 text-left transition active:translate-y-px ${statusClass[stand.status]} ${selected?.id === stand.id ? 'ring-2 ring-emerald-700 ring-offset-2' : ''}`} style={{ gridColumnStart: Number(stand.x) + 1, gridRowStart: Number(stand.y) + 1 }}><span className="block text-xs font-bold tracking-wide">{stand.label}</span><span className="mt-2 block text-sm font-semibold leading-tight">{company?.name ?? statusCopy[stand.status]}</span>{company && <span className="mt-1 block text-xs text-zinc-600">{assignment?.status === 'confirmed' ? 'Confirmada' : 'Reservada'}</span>}</button> })}</div></div><form onSubmit={addMapElement} className="mt-6 border-t border-zinc-200 pt-5"><h3 className="font-semibold">Añadir zona o pasillo</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><select value={elementType} onChange={(event) => setElementType(event.target.value as 'zone' | 'aisle')} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"><option value="aisle">Pasillo</option><option value="zone">Zona</option></select><input value={elementLabel} onChange={(event) => setElementLabel(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Nombre" /><div className="grid grid-cols-2 gap-2"><input type="number" min={0} value={elementX} onChange={(event) => setElementX(Number(event.target.value))} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" aria-label="Columna" /><input type="number" min={0} value={elementY} onChange={(event) => setElementY(Number(event.target.value))} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" aria-label="Fila" /></div><div className="grid grid-cols-2 gap-2"><input type="number" min={1} value={elementWidth} onChange={(event) => setElementWidth(Number(event.target.value))} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" aria-label="Ancho" /><input type="number" min={1} value={elementHeight} onChange={(event) => setElementHeight(Number(event.target.value))} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" aria-label="Alto" /></div></div><button disabled={busy} className="mt-3 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100">Añadir al plano</button></form></section>
        <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/50">{!selected ? <div className="py-8 text-center"><MapPin className="mx-auto h-7 w-7 text-zinc-400" /><h2 className="mt-3 font-semibold">Selecciona un stand</h2><p className="mt-1 text-sm text-zinc-600">Aquí verás su empresa, contacto y estado de asignación.</p></div> : <><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Stand {selected.label}</p><h2 className="mt-1 text-lg font-bold">{assignedCompany?.name ?? 'Sin empresa asignada'}</h2></div><button onClick={() => setSelectedId(null)} aria-label="Cerrar detalle" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"><X className="h-4 w-4" /></button></div>{assignedCompany && <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm"><div className="flex items-center gap-2 font-medium"><Building2 className="h-4 w-4 text-zinc-500" />{assignedCompany.kind === 'sponsor' ? 'Patrocinante' : 'Expositor'}</div>{assignedCompany.contact_name && <p className="mt-2 text-zinc-700">Contacto: {assignedCompany.contact_name}</p>}{assignedCompany.contact_email && <p className="mt-1 text-zinc-700">{assignedCompany.contact_email}</p>}</div>}<div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-medium">Empresa registrada<select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setNewCompany('') }} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"><option value="">Seleccionar empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><div className="border-t border-zinc-200 pt-4"><p className="text-sm font-medium">O crear empresa nueva</p><div className="mt-2 grid gap-3"><input value={newCompany} onChange={(event) => { setNewCompany(event.target.value); setCompanyId('') }} placeholder="Nombre de la empresa" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /><input value={newContact} onChange={(event) => setNewContact(event.target.value)} placeholder="Nombre de contacto" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></div></div><label className="grid gap-2 text-sm font-medium">Notas internas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Referencia comercial, condiciones o ubicación" className="resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label></div><div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} onClick={saveAssignment} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 active:translate-y-px disabled:opacity-60">{busy ? 'Guardando…' : assignedCompany ? 'Actualizar asignación' : 'Asignar empresa'}</button>{(selectedAssignment || selected.status !== 'available') && <button disabled={busy} onClick={releaseStand} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 active:translate-y-px disabled:opacity-60">Liberar stand</button>}</div></>}</aside>
      </div>}
    </main>
  </div>
}
