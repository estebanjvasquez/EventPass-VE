import { useCallback, useState } from 'react'
import type { FloorplanElement } from './model'

type HistoryState = { snapshots: FloorplanElement[][]; index: number }

export function useFloorplanHistory(initial: FloorplanElement[] = []) {
  const [history, setHistory] = useState<HistoryState>({ snapshots: [initial], index: 0 })
  const current = history.snapshots[history.index]
  const commit = useCallback((next: FloorplanElement[]) => {
    setHistory((previous) => ({ snapshots: [...previous.snapshots.slice(0, previous.index + 1), next], index: previous.index + 1 }))
  }, [])
  const reconcileIds = useCallback((ids: Record<string, string>) => {
    setHistory((previous) => ({ ...previous, snapshots: previous.snapshots.map((snapshot) => snapshot.map((item) => ids[item.id] ? { ...item, id: ids[item.id] } : item)) }))
  }, [])
  const undo = useCallback(() => setHistory((previous) => ({ ...previous, index: Math.max(0, previous.index - 1) })), [])
  const redo = useCallback(() => setHistory((previous) => ({ ...previous, index: Math.min(previous.snapshots.length - 1, previous.index + 1) })), [])
  return { current, commit, reconcileIds, canUndo: history.index > 0, canRedo: history.index < history.snapshots.length - 1, undo, redo }
}
