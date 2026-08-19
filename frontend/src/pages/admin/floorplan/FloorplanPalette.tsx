import { Armchair, ArrowRight, Building2, CircleDot, DoorOpen, Flower2, Info, LayoutGrid, Route, ScanLine, SquareDashed, Store, Waypoints } from 'lucide-react'
import { palette } from './model'

type Tool = typeof palette[number]['objectType']

const icons: Record<Tool, typeof Store> = {
  stand: Store,
  aisle: Waypoints,
  door: DoorOpen,
  access: ScanLine,
  security: ScanLine,
  column: Building2,
  plant: Flower2,
  table: CircleDot,
  sofa: Armchair,
  flow_arrow: ArrowRight,
  flow_route: Route,
  lobby: LayoutGrid,
  information: Info,
  blank: SquareDashed,
  special: LayoutGrid,
}

export function FloorplanPalette({ active, onChoose }: { active: Tool | null; onChoose: (tool: Tool) => void }) {
  return <aside className="rounded-xl border bg-white p-3"><h2 className="text-sm font-semibold">Elementos</h2><p className="mt-1 text-xs text-zinc-600">Elige uno y haz clic en el plano.</p><div className="mt-3 grid grid-cols-2 gap-2">{palette.map((item) => { const Icon = icons[item.objectType]; return <button key={item.objectType} type="button" onClick={() => onChoose(item.objectType)} className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-semibold transition ${active === item.objectType ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'hover:border-emerald-400'}`}><Icon className="h-4 w-4" />{item.label}</button> })}</div></aside>
}
