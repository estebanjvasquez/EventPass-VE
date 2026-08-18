import { useEffect, useState } from 'react'
import { FloorplanCanvas } from './FloorplanCanvas'
import { FloorplanPalette } from './FloorplanPalette'
import { intersects, palette } from './model'
import type { FloorplanElement } from './model'
import { useFloorplanHistory } from './useFloorplanHistory'

type Tool = typeof palette[number]['objectType']

export function FloorplanEditor({ initial, columns, rows, onGridChange, onChange }: { initial: FloorplanElement[]; columns: number; rows: number; onGridChange: (columns: number, rows: number) => void; onChange?: (elements: FloorplanElement[], reconcile: (ids: Record<string, string>) => void) => void }) {
  const [tool, setTool] = useState<Tool | null>(null); const [aisleAxis, setAisleAxis] = useState<'vertical' | 'horizontal'>('vertical'); const [selectedId, setSelectedId] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const { current, commit, reconcileIds, undo, redo, canUndo, canRedo } = useFloorplanHistory(initial)
  useEffect(() => { onChange?.(current, reconcileIds) }, [current, onChange, reconcileIds])
  const isVerticalAisle = (item: FloorplanElement) => item.kind === 'aisle' && item.height > item.width
  const isHorizontalAisle = (item: FloorplanElement) => item.kind === 'aisle' && item.width >= item.height
  function normalizeAisles(items: FloorplanElement[], nextColumns = columns, nextRows = rows) { return items.map((item) => isVerticalAisle(item) ? { ...item, y: 0, height: nextRows } : isHorizontalAisle(item) ? { ...item, x: 0, width: nextColumns } : item) }
  function place(nextTool: Tool, x: number, y: number) { const preset = palette.find((item) => item.objectType === nextTool); if (!preset) return; const count = current.filter((item) => item.label === preset.label || item.label.startsWith(`${preset.label} `)).length + 1; if (nextTool === 'aisle') { const vertical = aisleAxis === 'vertical'; const nextColumns = vertical ? columns + 1 : columns; const nextRows = vertical ? rows : rows + 1; const shifted = current.map((item) => {
      if (vertical && isHorizontalAisle(item)) return { ...item, x: 0, width: nextColumns }
      if (!vertical && isVerticalAisle(item)) return { ...item, y: 0, height: nextRows }
      return vertical ? (item.x >= x ? { ...item, x: item.x + 1 } : item) : (item.y >= y ? { ...item, y: item.y + 1 } : item)
    }); commit([...normalizeAisles(shifted, nextColumns, nextRows), { id: `local-${crypto.randomUUID()}`, label: `${preset.label} ${count}`, kind: 'aisle', x: vertical ? x : 0, y: vertical ? 0 : y, width: vertical ? 1 : nextColumns, height: vertical ? nextRows : 1 }]); onGridChange(nextColumns, nextRows); setNotice(`Pasillo ${vertical ? 'vertical' : 'horizontal'} insertado. Se abrió una franja completa y el contenido posterior se desplazó.`); setTool(null); return }; const kind = nextTool === 'stand' ? 'stand' : nextTool === 'blank' || nextTool === 'special' ? 'zone' : 'object'; if (current.some((item) => intersects(item, { x, y, width: preset.width, height: preset.height }))) { setNotice('Ese espacio está ocupado. Elige una celda libre o inserta primero un pasillo.'); return }; commit([...current, { id: `local-${crypto.randomUUID()}`, label: `${preset.label} ${count}`, kind, objectType: nextTool === 'stand' ? undefined : nextTool, x, y, width: preset.width, height: preset.height }]); setTool(null) }
  function resize(axis: 'x' | 'y', delta: number) { const item = current.find((entry) => entry.id === selectedId); if (!item) return
    const vertical = isVerticalAisle(item); const horizontal = isHorizontalAisle(item)
    if ((vertical && axis === 'x') || (horizontal && axis === 'y')) {
      const nextSize = (axis === 'x' ? item.width : item.height) + delta
      if (nextSize < 1) { setNotice('El pasillo debe conservar al menos una celda.'); return }
      if (delta < 0) { commit(normalizeAisles(current.map((entry) => entry.id === item.id ? { ...item, [axis === 'x' ? 'width' : 'height']: nextSize } : entry))); setNotice('Pasillo reducido. El espacio liberado queda disponible para diseñar.'); return }
      const boundary = axis === 'x' ? item.x + item.width : item.y + item.height
      const nextColumns = axis === 'x' ? columns + delta : columns; const nextRows = axis === 'y' ? rows + delta : rows
      const shifted = current.map((entry) => { if (entry.id === item.id) return { ...item, [axis === 'x' ? 'width' : 'height']: nextSize }; if (axis === 'x' && isHorizontalAisle(entry)) return { ...entry, x: 0, width: nextColumns }; if (axis === 'y' && isVerticalAisle(entry)) return { ...entry, y: 0, height: nextRows }; return axis === 'x' ? (entry.x >= boundary ? { ...entry, x: entry.x + delta } : entry) : (entry.y >= boundary ? { ...entry, y: entry.y + delta } : entry) })
      commit(normalizeAisles(shifted, nextColumns, nextRows)); onGridChange(nextColumns, nextRows); setNotice('Pasillo ampliado; se insertó espacio y el contenido posterior fue desplazado.'); return
    }
    const next = { ...item, [axis === 'x' ? 'width' : 'height']: (axis === 'x' ? item.width : item.height) + delta }
    const collisions = current.filter((entry) => entry.id !== item.id && intersects(next, entry))
    if (next.width < 1 || next.height < 1 || next.x + next.width > columns || next.y + next.height > rows) { setNotice('No hay espacio dentro del plano para cambiar ese tamaño.'); return }
    if (collisions.length && !(item.kind === 'stand' && collisions.every((entry) => entry.kind === 'stand' && entry.status === 'available'))) { setNotice('No hay espacio para cambiar ese tamaño.'); return }
    commit(current.filter((entry) => !collisions.some((collision) => collision.id === entry.id)).map((entry) => entry.id === item.id ? next : entry)); setNotice(collisions.length ? 'Stands disponibles unificados en un solo espacio.' : null)
  }
  function moveAisle(item: FloorplanElement, x: number, y: number) { const vertical = isVerticalAisle(item); const horizontal = isHorizontalAisle(item)
    if (!vertical && !horizontal) { setNotice('Este pasillo no ocupa una franja completa. Ajusta su tamaño primero.'); return }
    const target = vertical ? x : y; const start = vertical ? item.x : item.y; const size = vertical ? item.width : item.height; const limit = vertical ? columns : rows
    if (target < 0 || target + size > limit) { setNotice('El pasillo debe quedar dentro del plano.'); return }
    if (target === start) { setNotice(null); return }
    const nextAisle = vertical ? { ...item, x: target, y: 0, height: rows } : { ...item, x: 0, y: target, width: columns }
    if (current.some((entry) => entry.id !== item.id && entry.kind === 'aisle' && intersects(nextAisle, entry))) { setNotice('No se puede cruzar otro pasillo.'); return }
    const shifted = current.map((entry) => {
      if (entry.id === item.id) return nextAisle
      if (vertical && isHorizontalAisle(entry)) return { ...entry, x: 0, width: columns }
      if (horizontal && isVerticalAisle(entry)) return { ...entry, y: 0, height: rows }
      if (vertical) {
        if (target < start && entry.x >= target && entry.x < start) return { ...entry, x: entry.x + size }
        if (target > start && entry.x > start && entry.x < target + size) return { ...entry, x: entry.x - size }
      } else {
        if (target < start && entry.y >= target && entry.y < start) return { ...entry, y: entry.y + size }
        if (target > start && entry.y > start && entry.y < target + size) return { ...entry, y: entry.y - size }
      }
      return entry
    })
    commit(normalizeAisles(shifted)); setNotice(`Pasillo movido; el contenido entre las dos posiciones fue reordenado automáticamente.`)
  }
  function move(id: string, x: number, y: number) { const item = current.find((entry) => entry.id === id); if (!item) return; if (item.kind === 'aisle') { moveAisle(item, x, y); return }; const next = { ...item, x, y }; if (x < 0 || y < 0 || x + item.width > columns || y + item.height > rows || current.some((entry) => entry.id !== id && intersects(next, entry))) { setNotice('No se puede mover: la posición está ocupada o fuera del plano.'); return }; setNotice(null); commit(current.map((entry) => entry.id === id ? next : entry)) }
  function remove() { if (!selectedId) return; commit(current.filter((item) => item.id !== selectedId)); setSelectedId(null) }
  function updateSelected(change: Partial<FloorplanElement>) { if (!selectedId) return; commit(current.map((item) => item.id === selectedId ? { ...item, ...change } : item)) }
  const hasOverflow = current.some((item) => item.x + item.width > columns || item.y + item.height > rows)
  const selected = current.find((item) => item.id === selectedId)
  return <div className="grid gap-4 lg:grid-cols-[180px_1fr]"><FloorplanPalette active={tool} onChoose={setTool} /><section><div className="mb-2 flex flex-wrap items-center gap-2"><button type="button" disabled={!canUndo} onClick={undo} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Deshacer</button><button type="button" disabled={!canRedo} onClick={redo} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Rehacer</button><label className="ml-auto text-xs">Columnas <input type="number" min="1" value={columns} onChange={(event) => onGridChange(Number(event.target.value), rows)} className="ml-1 w-14 rounded border p-1" /></label><label className="text-xs">Filas <input type="number" min="1" value={rows} onChange={(event) => onGridChange(columns, Number(event.target.value))} className="ml-1 w-14 rounded border p-1" /></label></div>{selected && <div className="mb-2 grid gap-2 rounded border bg-white p-3 text-xs sm:grid-cols-2"><label>Nombre<input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} className="mt-1 w-full rounded border p-2 text-sm" /></label><label>Objetivo / uso<input value={selected.purpose ?? ''} onChange={(event) => updateSelected({ purpose: event.target.value })} placeholder="Ej. salida de emergencia" className="mt-1 w-full rounded border p-2 text-sm" /></label></div>}{tool === 'aisle' && <div className="mb-2 flex items-center gap-2 rounded bg-sky-50 p-2 text-xs text-sky-950"><span>Haz clic en cualquier stand para insertar una franja completa:</span><button type="button" onClick={() => setAisleAxis('vertical')} className={`rounded px-2 py-1 ${aisleAxis === 'vertical' ? 'bg-sky-700 text-white' : 'border'}`}>Columna vertical</button><button type="button" onClick={() => setAisleAxis('horizontal')} className={`rounded px-2 py-1 ${aisleAxis === 'horizontal' ? 'bg-sky-700 text-white' : 'border'}`}>Fila horizontal</button></div>}{notice && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">{notice}</p>}{hasOverflow && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Amplía la cuadrícula: contiene elementos fuera de estos límites.</p>}<FloorplanCanvas elements={current} columns={columns} rows={rows} activeTool={tool} aisleAxis={aisleAxis} selectedId={selectedId} onSelect={setSelectedId} onResize={resize} onPlace={place} onMove={move} onDelete={remove} /></section></div>
}
