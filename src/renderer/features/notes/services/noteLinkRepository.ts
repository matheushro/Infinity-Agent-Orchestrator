// Persistence adapter for note ↔ terminal links. Talks only to window.dbApi.
import type { NoteLinkRecord } from '@shared/types/notes'

export const noteLinkRepository = {
  list(): Promise<NoteLinkRecord[]> {
    return window.dbApi.listNoteLinks()
  },
  persist(link: NoteLinkRecord): void {
    void window.dbApi.upsertNoteLink(link)
  },
  remove(id: string): void {
    void window.dbApi.removeNoteLink(id)
  },

  /** Subscribe to out-of-band note/link changes (e.g. the `iao note` CLI). */
  onChange(cb: () => void): () => void {
    return window.dbApi.onNotesChanged(cb)
  },
}
