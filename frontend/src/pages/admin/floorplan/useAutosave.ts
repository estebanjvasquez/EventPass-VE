import { useEffect, useRef, useState } from 'react'

export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delay = 700) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const initial = useRef(true)
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save }, [save])
  useEffect(() => {
    if (initial.current) { initial.current = false; return }
    setState('saving')
    const timeout = window.setTimeout(() => { void saveRef.current(value).then(() => setState('saved')).catch(() => setState('error')) }, delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])
  return state
}
