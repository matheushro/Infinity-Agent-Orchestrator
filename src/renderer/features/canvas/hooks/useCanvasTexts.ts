// Owns free-text canvas elements: local drag/edit state plus SQLite persistence.
import { useCallback, useEffect, useState } from 'react'
import type { CanvasTextRecord } from '@shared/types/canvas'
import { createCanvasTextId } from '@renderer/lib/id'
import { textElementRepository } from '../services/textElementRepository'

// Tight defaults — the box snaps to measured glyph size on first keystroke,
// so we just need a small placeholder rectangle wide enough to host the
// blinking caret before any text is typed (~1 char at 17px / 1.2 line height).
const DEFAULT_TEXT_WIDTH = 8
const DEFAULT_TEXT_HEIGHT = 21

export interface UseCanvasTextsResult {
  texts: CanvasTextRecord[]
  createText: (position: { x: number; y: number }) => string
  moveText: (id: string, patch: Partial<CanvasTextRecord>) => void
  updateText: (id: string, patch: Partial<CanvasTextRecord>) => void
  removeText: (id: string) => void
}

export function useCanvasTexts(workspaceId: string): UseCanvasTextsResult {
  const [texts, setTexts] = useState<CanvasTextRecord[]>([])

  useEffect(() => {
    if (!workspaceId) return
    textElementRepository.list(workspaceId).then(setTexts)
  }, [workspaceId])

  const createText = useCallback(
    (position: { x: number; y: number }) => {
      const id = createCanvasTextId()
      const text: CanvasTextRecord = {
        id,
        text: '',
        x: position.x,
        y: position.y,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT,
        workspace_id: workspaceId,
      }
      setTexts((prev) => [...prev, text])
      return id
    },
    [workspaceId],
  )

  const moveText = useCallback((id: string, patch: Partial<CanvasTextRecord>) => {
    setTexts((prev) => prev.map((text) => (text.id === id ? { ...text, ...patch } : text)))
  }, [])

  const updateText = useCallback((id: string, patch: Partial<CanvasTextRecord>) => {
    setTexts((prev) =>
      prev.map((text) => {
        if (text.id !== id) return text
        const next = { ...text, ...patch }
        if (next.text.trim()) textElementRepository.persist(next)
        return next
      }),
    )
  }, [])

  const removeText = useCallback((id: string) => {
    textElementRepository.remove(id)
    setTexts((prev) => prev.filter((text) => text.id !== id))
  }, [])

  return { texts, createText, moveText, updateText, removeText }
}
