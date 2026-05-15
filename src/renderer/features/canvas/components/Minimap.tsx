// Mini-map of the canvas + draggable viewport rectangle.
// Bounds union node positions and the current viewport, so zoom-out shows
// more area inside the (fixed-size) map without growing the box itself.
import { useRef } from 'react'
import { IClose } from '@renderer/components/ui'
import type { TerminalNodeData } from '@renderer/features/terminals/types'

interface MinimapProps {
  nodes: TerminalNodeData[]
  selectedIds: string[]
  pan: { x: number; y: number }
  zoom: number
  wrapSize: { w: number; h: number }
  onPan: (dx: number, dy: number) => void
  onClose: () => void
}

const W = 168
const H = 110

export function Minimap({
  nodes,
  selectedIds,
  pan,
  zoom,
  wrapSize,
  onPan,
  onClose,
}: MinimapProps): JSX.Element {
  const vw0 = -pan.x / zoom
  const vh0 = -pan.y / zoom
  const vw1 = vw0 + wrapSize.w / zoom
  const vh1 = vh0 + wrapSize.h / zoom

  let minX: number
  let minY: number
  let maxX: number
  let maxY: number
  if (nodes.length === 0) {
    minX = vw0
    minY = vh0
    maxX = vw1
    maxY = vh1
  } else {
    minX = Math.min(vw0, ...nodes.map((n) => n.x))
    minY = Math.min(vh0, ...nodes.map((n) => n.y))
    maxX = Math.max(vw1, ...nodes.map((n) => n.x + n.width))
    maxY = Math.max(vh1, ...nodes.map((n) => n.y + n.height))
  }
  const pad = Math.max(80, Math.max(maxX - minX, maxY - minY) * 0.1)
  minX -= pad
  minY -= pad
  maxX += pad
  maxY += pad

  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const s = Math.min(W / bw, H / bh)
  const offX = (W - bw * s) / 2
  const offY = (H - bh * s) / 2
  const px = (x: number): number => offX + (x - minX) * s
  const py = (y: number): number => offY + (y - minY) * s

  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null)

  function startDrag(e: React.MouseEvent): void {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = { lastX: e.clientX, lastY: e.clientY }
    function onMove(ev: MouseEvent): void {
      const d = dragRef.current
      if (!d) return
      const dx = ((ev.clientX - d.lastX) / s) * zoom
      const dy = ((ev.clientY - d.lastY) / s) * zoom
      d.lastX = ev.clientX
      d.lastY = ev.clientY
      onPan(dx, dy)
    }
    function onUp(): void {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className="minimap absolute bottom-4 right-4 z-30 p-2"
      style={{ width: W + 16 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span
          className="text-[10.5px] uppercase tracking-wider"
          style={{ color: 'var(--fg-3)', fontWeight: 500 }}
        >
          Map
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-mono" style={{ color: 'var(--fg-3)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="icon-btn !w-5 !h-5"
            onClick={onClose}
            title="Hide minimap"
            aria-label="Hide minimap"
          >
            <IClose size={10} />
          </button>
        </div>
      </div>
      <svg
        width={W}
        height={H}
        style={{
          display: 'block',
          borderRadius: 6,
          background: 'color-mix(in oklch, var(--canvas) 70%, transparent)',
          cursor: 'grab',
        }}
        onMouseDown={startDrag}
      >
        {nodes.map((n) => (
          <rect
            key={n.id}
            x={px(n.x)}
            y={py(n.y)}
            width={Math.max(3, n.width * s)}
            height={Math.max(3, n.height * s)}
            rx={1.5}
            fill={
              selectedIds.includes(n.id)
                ? 'var(--accent)'
                : 'color-mix(in oklch, var(--fg) 60%, transparent)'
            }
            opacity={selectedIds.includes(n.id) ? 0.95 : 0.55}
          />
        ))}
        <rect
          x={px(vw0)}
          y={py(vh0)}
          width={Math.max(4, (vw1 - vw0) * s)}
          height={Math.max(4, (vh1 - vh0) * s)}
          fill="color-mix(in oklch, var(--accent) 12%, transparent)"
          stroke="var(--accent)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  )
}
