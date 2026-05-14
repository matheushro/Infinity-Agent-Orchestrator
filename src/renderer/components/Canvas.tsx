import { useRef, useState } from 'react'
import type { CanvasTheme, TerminalNodeData } from '../App'
import TerminalNode from './TerminalNode'

interface CanvasProps {
  nodes: TerminalNodeData[]
  theme: CanvasTheme
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
}

// Canvas background palettes, selectable between dark and light.
const THEMES: Record<CanvasTheme, { bg: string; dot: string; empty: string }> = {
  dark: { bg: '#020617', dot: 'rgba(148,163,184,0.15)', empty: '#475569' },
  light: { bg: '#e2e8f0', dot: 'rgba(71,85,105,0.28)', empty: '#64748b' }
}

// Canvas zoom limits.
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5

export default function Canvas({
  nodes,
  theme,
  onUpdateNode,
  onRemoveNode
}: CanvasProps): JSX.Element {
  // World offset, allowing an infinite navigable canvas.
  const [pan, setPan] = useState({ x: 0, y: 0 })
  // World scale factor, controlled by Shift + mouse wheel.
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  )
  const palette = THEMES[theme]

  function onBackgroundMouseDown(e: React.MouseEvent): void {
    // Start panning only when clicking the background, not a node.
    if (e.target !== e.currentTarget) return
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }

  function onMouseMove(e: React.MouseEvent): void {
    const d = dragState.current
    if (!d) return
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) })
  }

  function endPan(): void {
    dragState.current = null
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

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden"
      onMouseDown={onBackgroundMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endPan}
      onMouseLeave={endPan}
      onWheel={onWheel}
      style={{
        cursor: dragState.current ? 'grabbing' : 'grab',
        backgroundColor: palette.bg,
        backgroundImage: `radial-gradient(circle, ${palette.dot} 1px, transparent 1px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`
      }}
    >
      {nodes.length === 0 && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
          style={{ color: palette.empty }}
        >
          Click “+ New terminal”. Drag the background or use the mouse wheel to navigate.
        </div>
      )}

      {/* Movable world: nodes live in their own coordinates. */}
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        {nodes.map((node) => (
          <TerminalNode
            key={node.id}
            node={node}
            onUpdateNode={onUpdateNode}
            onRemoveNode={onRemoveNode}
          />
        ))}
      </div>
    </div>
  )
}
