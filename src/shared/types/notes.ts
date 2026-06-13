// Domain types shared across processes for canvas-owned note elements.

/**
 * Persisted Markdown note placed directly on the infinite canvas. A richer
 * sibling of `CanvasTextRecord`: it carries a title, a Markdown body, and
 * timestamps. Position/size are world coordinates (`x`/`y`) and pixels
 * (`width`/`height`), matching terminals and canvas texts.
 */
export interface NoteRecord {
  id: string
  title: string
  content: string
  /**
   * Visual theme for the note itself. `auto` follows the canvas/app theme,
   * while `dark` / `light` force a fixed palette for this specific note.
   */
  theme: 'auto' | 'dark' | 'light'
  x: number
  y: number
  width: number
  height: number
  workspace_id: string
  created_at: number
  updated_at: number
}

/**
 * Persisted many-to-many link between a note and a terminal. A terminal may
 * only access (read/edit/delete) notes it is linked to through one of these
 * records — the note↔terminal analogue of `EdgeRecord` (terminal↔terminal).
 */
export interface NoteLinkRecord {
  id: string
  note_id: string
  terminal_id: string
}
