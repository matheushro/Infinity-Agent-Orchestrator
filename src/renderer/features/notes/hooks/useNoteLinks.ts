// Owns the persisted set of note ↔ terminal links — the access-control edges
// that decide which notes a terminal/agent may reach. Mirrors useEdges, but the
// two endpoints are of different kinds (a note id and a terminal id). Re-lists
// on `notes:changed` so links created by an agent's `iao note` CLI show up live.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NoteLinkRecord } from '@shared/types/notes'
import { noteLinkRepository } from '../services/noteLinkRepository'

export interface UseNoteLinksResult {
  noteLinks: NoteLinkRecord[]
  addNoteLink: (noteId: string, terminalId: string) => void
  removeNoteLink: (id: string) => void
}

export function useNoteLinks(nodeIds: string[], noteIds: string[]): UseNoteLinksResult {
  const [allLinks, setAllLinks] = useState<NoteLinkRecord[]>([])

  const refresh = useCallback(() => {
    noteLinkRepository.list().then(setAllLinks)
  }, [])

  useEffect(() => {
    refresh()
    return noteLinkRepository.onChange(refresh)
  }, [refresh])

  // Only surface links whose endpoints both belong to this workspace's view.
  const noteLinks = useMemo(() => {
    const terminalSet = new Set(nodeIds)
    const noteSet = new Set(noteIds)
    return allLinks.filter((l) => terminalSet.has(l.terminal_id) && noteSet.has(l.note_id))
  }, [allLinks, nodeIds, noteIds])

  const addNoteLink = useCallback((noteId: string, terminalId: string) => {
    setAllLinks((prev) => {
      const exists = prev.some((l) => l.note_id === noteId && l.terminal_id === terminalId)
      if (exists) return prev
      const link: NoteLinkRecord = {
        id: crypto.randomUUID(),
        note_id: noteId,
        terminal_id: terminalId,
      }
      noteLinkRepository.persist(link)
      return [...prev, link]
    })
  }, [])

  const removeNoteLink = useCallback((id: string) => {
    setAllLinks((prev) => {
      if (!prev.some((l) => l.id === id)) return prev
      noteLinkRepository.remove(id)
      return prev.filter((l) => l.id !== id)
    })
  }, [])

  return { noteLinks, addNoteLink, removeNoteLink }
}
