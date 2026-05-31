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
  x: number
  y: number
  width: number
  height: number
  workspace_id: string
  created_at: number
  updated_at: number
}
