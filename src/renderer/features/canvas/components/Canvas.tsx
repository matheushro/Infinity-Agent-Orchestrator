// The navigable infinite canvas. Renders the terminal nodes inside a
// pan/zoom-able world. Viewport logic lives in usePanZoom.
import { TerminalNode } from '@renderer/features/terminals/components/TerminalNode'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import { usePanZoom } from '../hooks/usePanZoom'
import { CANVAS_THEMES } from '../theme'
import type { CanvasTheme } from '../types'

interface CanvasProps {
  nodes: TerminalNodeData[]
  theme: CanvasTheme
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
}

export function Canvas({
  nodes,
  theme,
  onUpdateNode,
  onRemoveNode
}: CanvasProps): JSX.Element {
  const { pan, zoom, containerRef, dragStateRef, handlers } = usePanZoom()
  const palette = CANVAS_THEMES[theme]

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden"
      onMouseDown={handlers.onBackgroundMouseDown}
      onMouseMove={handlers.onMouseMove}
      onMouseUp={handlers.endPan}
      onMouseLeave={handlers.endPan}
      onWheel={handlers.onWheel}
      style={{
        cursor: dragStateRef.current ? 'grabbing' : 'grab',
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
