// Domain types shared across processes for canvas-owned elements.

/** Persisted free-text element placed directly on the infinite canvas. */
export interface CanvasTextRecord {
  id: string
  text: string
  x: number
  y: number
  width: number
  height: number
  workspace_id: string
}
