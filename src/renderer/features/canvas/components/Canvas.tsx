// The navigable infinite canvas. Renders the terminal nodes inside a
// pan/zoom-able world. Viewport logic lives in usePanZoom.
import { useEffect, useMemo, useState } from 'react'
import { TerminalNode } from '@renderer/features/terminals/components/TerminalNode'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { EdgeRecord } from '@shared/types/terminal'
import { ICursor, IFit, IHand, IMinus, IPlus } from '@renderer/components/ui'
import { usePanZoom } from '../hooks/usePanZoom'
import { Minimap } from './Minimap'

interface CanvasProps {
  nodes: TerminalNodeData[]
  edges: EdgeRecord[]
  selectedId: string | null
  focusedId: string | null
  focusRequest: string | null
  linkSource: string | null
  isLinking: boolean
  onSelect: (id: string | null) => void
  onFocusConsumed: () => void
  onMoveNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
  onLinkPick: (id: string) => void
}

export function Canvas({
  nodes,
  edges,
  selectedId,
  focusedId,
  focusRequest,
  linkSource,
  isLinking,
  onSelect,
  onFocusConsumed,
  onMoveNode,
  onUpdateNode,
  onRemoveNode,
  onLinkPick,
}: CanvasProps): JSX.Element {
  const { pan, zoom, setPan, setZoom, containerRef, handlers } = usePanZoom()
  const wrapRef = containerRef
  const [wrapSize, setWrapSize] = useState({ w: 1200, h: 800 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setWrapSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) setWrapSize({ w: r.width, h: r.height })
    return () => ro.disconnect()
  }, [wrapRef])

  useEffect(() => {
    if (!focusRequest) return
    const t = nodes.find((n) => n.id === focusRequest)
    if (!t) return
    const targetScale = Math.max(0.7, Math.min(1.1, zoom))
    const cx = t.x + t.width / 2
    const cy = t.y + t.height / 2
    setZoom(targetScale)
    setPan({
      x: wrapSize.w / 2 - cx * targetScale,
      y: wrapSize.h / 2 - cy * targetScale,
    })
    onFocusConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, wrapSize.w, wrapSize.h])

  function zoomTo(target: number): void {
    setZoom((z) => {
      const next = Math.min(2, Math.max(0.25, target))
      if (next === z) return z
      const cx = wrapSize.w / 2
      const cy = wrapSize.h / 2
      setPan((p) => ({
        x: cx - ((cx - p.x) / z) * next,
        y: cy - ((cy - p.y) / z) * next,
      }))
      return next
    })
  }

  function zoomBy(delta: number): void {
    setZoom((z) => {
      const next = Math.min(2, Math.max(0.25, z * (1 + delta)))
      if (next === z) return z
      const cx = wrapSize.w / 2
      const cy = wrapSize.h / 2
      setPan((p) => ({
        x: cx - ((cx - p.x) / z) * next,
        y: cy - ((cy - p.y) / z) * next,
      }))
      return next
    })
  }

  function fitAll(): void {
    if (nodes.length === 0 || wrapSize.w === 0 || wrapSize.h === 0) return
    const pad = 80
    const minX = Math.min(...nodes.map((n) => n.x)) - pad
    const minY = Math.min(...nodes.map((n) => n.y)) - pad
    const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + pad
    const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + pad
    const bw = Math.max(1, maxX - minX)
    const bh = Math.max(1, maxY - minY)
    const s = Math.min(wrapSize.w / bw, wrapSize.h / bh, 1)
    setZoom(s)
    setPan({
      x: (wrapSize.w - bw * s) / 2 - minX * s,
      y: (wrapSize.h - bh * s) / 2 - minY * s,
    })
  }

  // Build SVG paths for the persisted edges. Recomputed every render so live
  // drag updates of node positions reshape the curves in real time.
  const edgePaths = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return edges
      .map((edge) => {
        const a = byId.get(edge.source)
        const b = byId.get(edge.target)
        if (!a || !b) return null
        let x1 = a.x + a.width
        let y1 = a.y + a.height / 2
        let x2 = b.x
        let y2 = b.y + b.height / 2
        if (b.x + b.width < a.x) {
          x1 = a.x
          x2 = b.x + b.width
        }
        const dx = Math.abs(x2 - x1)
        const c = Math.min(180, Math.max(60, dx * 0.5))
        const sign = x2 > x1 ? 1 : -1
        const selected = selectedId === a.id || selectedId === b.id
        return {
          id: edge.id,
          d: `M ${x1} ${y1} C ${x1 + c * sign} ${y1}, ${x2 - c * sign} ${y2}, ${x2} ${y2}`,
          selected,
          x1,
          y1,
          x2,
          y2,
        }
      })
      .filter(<T,>(e: T | null): e is T => e !== null)
  }, [edges, nodes, selectedId])

  return (
    <div
      ref={wrapRef}
      className="canvas-ambient relative flex-1 overflow-hidden"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('.terminal-node')) return
        onSelect(null)
        handlers.onBackgroundMouseDown(e)
      }}
      onMouseMove={handlers.onMouseMove}
      onMouseUp={handlers.endPan}
      onMouseLeave={handlers.endPan}
      onWheel={handlers.onWheel}
      style={{ cursor: isLinking ? 'crosshair' : 'grab' }}
    >
      <div
        className="canvas-surface absolute"
        style={{
          width: 8000,
          height: 8000,
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          marginLeft: -4000,
          marginTop: -4000,
          backgroundPosition: '4000px 4000px',
        }}
      >
        <svg
          className="edges-layer"
          style={{ width: 8000, height: 8000, left: 0, top: 0 }}
        >
          {edgePaths.map((p) => (
            <g key={p.id} transform="translate(4000,4000)">
              <path d={p.d} className={p.selected ? 'selected' : ''} />
              <circle
                className={'endpoint' + (p.selected ? ' selected' : '')}
                cx={p.x1}
                cy={p.y1}
                r={2.5}
              />
              <circle
                className={'endpoint' + (p.selected ? ' selected' : '')}
                cx={p.x2}
                cy={p.y2}
                r={2.5}
              />
            </g>
          ))}
        </svg>

        <div style={{ position: 'absolute', left: 4000, top: 4000 }}>
          {nodes.map((node) => (
            <TerminalNode
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              focused={focusedId === node.id}
              scale={zoom}
              linkSource={linkSource}
              onSelect={onSelect}
              onMoveNode={onMoveNode}
              onUpdateNode={onUpdateNode}
              onRemoveNode={onRemoveNode}
              onLinkPick={isLinking ? onLinkPick : null}
            />
          ))}
        </div>
      </div>

      {nodes.length === 0 && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12.5px]"
          style={{ color: 'var(--fg-3)' }}
        >
          Click &ldquo;New terminal&rdquo;. Drag the background or use the mouse wheel to navigate.
        </div>
      )}

      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <div className="controls" style={{ height: 32 }}>
          <button title="Select (V)" style={{ color: 'var(--fg)' }}>
            <ICursor size={14} />
          </button>
          <span className="sep" />
          <button title="Pan (H)">
            <IHand size={14} />
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2">
        <div className="controls">
          <button onClick={() => zoomBy(-0.12)} title="Zoom out">
            <IMinus size={14} />
          </button>
          <span className="sep" />
          <button onClick={() => zoomTo(1)} className="zoom-readout" title="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <span className="sep" />
          <button onClick={() => zoomBy(0.12)} title="Zoom in">
            <IPlus size={14} />
          </button>
        </div>
        <div className="controls">
          <button onClick={fitAll} title="Fit to view">
            <IFit size={14} />
          </button>
        </div>
      </div>

      <Minimap
        nodes={nodes}
        selectedId={selectedId}
        pan={pan}
        zoom={zoom}
        wrapSize={wrapSize}
        onPan={(dx, dy) => setPan((p) => ({ x: p.x - dx, y: p.y - dy }))}
      />

      {isLinking && (
        <div
          className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 px-3 py-1.5 rounded-[8px] text-[12px]"
          style={{
            background: 'color-mix(in oklch, var(--bg-2) 92%, transparent)',
            border: '1px solid var(--accent)',
            color: 'var(--fg)',
          }}
        >
          {linkSource
            ? 'Click the second terminal to connect — Esc to cancel'
            : 'Pick the first terminal — Esc to cancel'}
        </div>
      )}
    </div>
  )
}
