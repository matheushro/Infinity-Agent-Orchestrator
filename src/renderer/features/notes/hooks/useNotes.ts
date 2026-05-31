// Owns canvas Markdown notes: local drag/edit state plus SQLite persistence.
// Mirrors useCanvasTexts — moveNote is transient (no DB write) for cheap
// drag/resize, updateNote persists (content, rename, and move/resize commits).
import { useCallback, useEffect, useState } from 'react'
import type { NoteRecord } from '@shared/types/notes'
import { createNoteId } from '@renderer/lib/id'
import { noteRepository } from '../services/noteRepository'

const DEFAULT_NOTE_WIDTH = 280
const DEFAULT_NOTE_HEIGHT = 200
export const DEFAULT_NOTE_TITLE = 'Untitled note'

export interface UseNotesResult {
  notes: NoteRecord[]
  createNote: (position: { x: number; y: number }) => string
  moveNote: (id: string, patch: Partial<NoteRecord>) => void
  updateNote: (id: string, patch: Partial<NoteRecord>) => void
  removeNote: (id: string) => void
}

export function useNotes(workspaceId: string): UseNotesResult {
  const [notes, setNotes] = useState<NoteRecord[]>([])

  useEffect(() => {
    if (!workspaceId) return
    noteRepository.list(workspaceId).then(setNotes)
  }, [workspaceId])

  const createNote = useCallback(
    (position: { x: number; y: number }) => {
      const id = createNoteId()
      const now = Date.now()
      const note: NoteRecord = {
        id,
        title: DEFAULT_NOTE_TITLE,
        content: '',
        x: position.x,
        y: position.y,
        width: DEFAULT_NOTE_WIDTH,
        height: DEFAULT_NOTE_HEIGHT,
        workspace_id: workspaceId,
        created_at: now,
        updated_at: now,
      }
      // Persist immediately so the note survives a reload even before its
      // first edit (unlike texts, which only persist once non-empty).
      noteRepository.persist(note)
      setNotes((prev) => [...prev, note])
      return id
    },
    [workspaceId],
  )

  const moveNote = useCallback((id: string, patch: Partial<NoteRecord>) => {
    setNotes((prev) => prev.map((note) => (note.id === id ? { ...note, ...patch } : note)))
  }, [])

  const updateNote = useCallback((id: string, patch: Partial<NoteRecord>) => {
    setNotes((prev) =>
      prev.map((note) => {
        if (note.id !== id) return note
        const next = { ...note, ...patch, updated_at: Date.now() }
        noteRepository.persist(next)
        return next
      }),
    )
  }, [])

  const removeNote = useCallback((id: string) => {
    noteRepository.remove(id)
    setNotes((prev) => prev.filter((note) => note.id !== id))
  }, [])

  return { notes, createNote, moveNote, updateNote, removeNote }
}
