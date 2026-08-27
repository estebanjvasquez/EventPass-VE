import { useMemo } from 'react'
import { ExhibitionKonvaStage, type SceneElement } from './admin/exhibition/ExhibitionKonvaStage'

export default function PublicExhibitionCanvas({ columns, rows, elements, assignments, selectedId, backgroundUrl, onSelect }: { columns: number; rows: number; elements: SceneElement[]; assignments: Map<string, string>; selectedId: string | null; backgroundUrl: string | null; onSelect: (item: SceneElement | null) => void }) {
  const selectedIds = useMemo(() => selectedId ? [selectedId] : [], [selectedId])
  return <ExhibitionKonvaStage columns={columns} rows={rows} elements={elements} assignments={assignments} selectedIds={selectedIds} showGrid={false} showDimensions={false} snap={false} backgroundUrl={backgroundUrl} opacity={100} tool={null} polygonDraft={[]} readOnly onSelect={(item) => onSelect(item)} onClear={() => onSelect(null)} onPlace={() => undefined} onPolygonPoint={() => undefined} onPolygonFinish={() => undefined} onMove={() => undefined} onTransform={() => undefined} />
}
