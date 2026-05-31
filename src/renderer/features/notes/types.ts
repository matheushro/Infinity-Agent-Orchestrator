// The note UI model is the persisted record itself — it already carries
// everything the canvas needs (title, content, position, size, timestamps),
// so unlike terminals there is no separate record↔node mapping.
import type { NoteRecord } from '@shared/types/notes'

export type NoteNodeData = NoteRecord
