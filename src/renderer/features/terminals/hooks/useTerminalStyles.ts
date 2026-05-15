// Per-terminal visual customization, persisted in localStorage as a flat map.
// Kept renderer-only (no SQLite migration) — styling is a view concern.
import { useCallback } from 'react'
import { useLocalStorage } from '@renderer/hooks/useLocalStorage'
import {
  DEFAULT_TERMINAL_STYLE,
  type TerminalStyle,
} from '../types'

type StyleMap = Record<string, Partial<TerminalStyle>>

export interface UseTerminalStylesResult {
  getStyle: (id: string) => TerminalStyle
  setStyle: (id: string, patch: Partial<TerminalStyle>) => void
  removeStyle: (id: string) => void
}

export function useTerminalStyles(): UseTerminalStylesResult {
  const [map, setMap] = useLocalStorage<StyleMap>('terminalStyles', {})

  const getStyle = useCallback(
    (id: string): TerminalStyle => ({ ...DEFAULT_TERMINAL_STYLE, ...map[id] }),
    [map],
  )

  const setStyle = useCallback(
    (id: string, patch: Partial<TerminalStyle>) => {
      setMap({ ...map, [id]: { ...map[id], ...patch } })
    },
    [map, setMap],
  )

  const removeStyle = useCallback(
    (id: string) => {
      if (!map[id]) return
      const next = { ...map }
      delete next[id]
      setMap(next)
    },
    [map, setMap],
  )

  return { getStyle, setStyle, removeStyle }
}
