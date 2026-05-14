// Pan/zoom logic for the infinite canvas world. Holds the transient
// (non-persisted) viewport state and exposes the DOM event handlers.
import { useRef, useState } from 'react'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5

interface DragState {
  startX: number
  startY: number
  panX: number
  panY: number
}

export interface PanZoom {
  pan: { x: number; y: number }
  zoom: number
  containerRef: React.RefObject<HTMLDivElement>
  /** Ref so the caller can read the live panning state for the cursor style. */
  dragStateRef: React.MutableRefObject<DragState | null>
  handlers: {
    onBackgroundMouseDown: (e: React.MouseEvent) => void
    onMouseMove: (e: React.MouseEvent) => void
    endPan: () => void
    onWheel: (e: React.WheelEvent) => void
  }
}

export function usePanZoom(): PanZoom {
  // World offset, allowing an infinite navigable canvas.
  const [pan, setPan] = useState({ x: 0, y: 0 })
  // World scale factor, controlled by Shift + mouse wheel.
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)

  function onBackgroundMouseDown(e: React.MouseEvent): void {
    // Start panning only when clicking the background, not a node.
    if (e.target !== e.currentTarget) return
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }

  function onMouseMove(e: React.MouseEvent): void {
    const d = dragStateRef.current
    if (!d) return
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) })
  }

  function endPan(): void {
    dragStateRef.current = null
  }

  function onWheel(e: React.WheelEvent): void {
    // If the pointer is over a terminal, let xterm scroll the content.
    if ((e.target as HTMLElement).closest('.terminal-node')) return

    // Shift + mouse wheel: zoom anchored to the cursor position.
    if (e.shiftKey) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      // deltaY may come through deltaX when Shift is held on some systems.
      const delta = e.deltaY || e.deltaX
      setZoom((z) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (delta < 0 ? 1.1 : 1 / 1.1)))
        if (next === z) return z
        // Keep the world point under the cursor fixed during zoom.
        setPan((p) => ({
          x: cursorX - ((cursorX - p.x) / z) * next,
          y: cursorY - ((cursorY - p.y) / z) * next
        }))
        return next
      })
      return
    }

    // Otherwise, the mouse wheel pans the canvas.
    setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
  }

  return {
    pan,
    zoom,
    containerRef,
    dragStateRef,
    handlers: { onBackgroundMouseDown, onMouseMove, endPan, onWheel }
  }
}
