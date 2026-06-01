// Persistence adapter for canvas-owned Markdown notes.
import type { NoteRecord } from '@shared/types/notes'

export const noteRepository = {
  async list(workspaceId: string): Promise<NoteRecord[]> {
    return window.dbApi.listNotes(workspaceId)
  },

  persist(record: NoteRecord): void {
    void window.dbApi.upsertNote(record)
  },

  remove(id: string): void {
    void window.dbApi.removeNote(id)
  },

  /** Subscribe to out-of-band note/link changes (e.g. the `iao note` CLI). */
  onChange(cb: () => void): () => void {
    return window.dbApi.onNotesChanged(cb)
  },
}
