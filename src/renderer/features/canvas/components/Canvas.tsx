// The navigable infinite canvas. Renders the terminal nodes inside a
// pan/zoom-able world. Viewport logic lives in usePanZoom.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TerminalNode } from '@renderer/features/terminals/components/TerminalNode'
import type { TerminalNodeData, TerminalStyle } from '@renderer/features/terminals/types'
import type { EdgeRecord } from '@shared/types/terminal'
import {
  ICursor,
  IFit,
  IHand,
  ILink,
  IMap,
  IMinus,
  IPlus,
  ITrash,
} from '@renderer/components/ui'
import { usePanZoom } from '../hooks/usePanZoom'
import { Minimap } from './Minimap'

export type CanvasTool = 'select' | 'pan' | 'link' | 'delete'

interface CanvasProps {
  nodes: TerminalNodeData[]
  edges: EdgeRecord[]
  selectedIds: string[]
  selectedEdgeId: string | null
  focusedId: string | null
  focusRequest: string | null
  linkSource: string | null
  tool: CanvasTool
  contextMenuNodeId: string | null
  onSelect: (id: string | null, additive: boolean) => void
  onSelectEdge: (id: string | null) => void
  onSelectMany: (ids: string[]) => void
  onFocusConsumed: () => void
  onMoveNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
  onLinkPick: (id: string) => void
  onSetTool: (t: CanvasTool) => void
  onNodeContextMenu: (id: string, x: number, y: number) => void
  onCanvasContextMenu: (worldX: number, worldY: number, clientX: number, clientY: number) => void
  getTerminalStyle: (id: string) => TerminalStyle
}

export function Canvas({
  nodes,
  edges,
  selectedIds,
  selectedEdgeId,
  focusedId,
  focusRequest,
  linkSource,
  tool,
  contextMenuNodeId,
  onSelect,
  onSelectEdge,
  onSelectMany,
  onFocusConsumed,
  onMoveNode,
  onUpdateNode,
  onRemoveNode,
  onLinkPick,
  onSetTool,
  onNodeContextMenu,
  onCanvasContextMenu,
  getTerminalStyle,
}: CanvasProps): JSX.Element {
  const { pan, zoom, setPan, setZoom, containerRef, handlers } = usePanZoom()
  const wrapRef = containerRef
  const [wrapSize, setWrapSize] = useState({ w: 1200, h: 800 })
  const [minimapVisible, setMinimapVisible] = useState(true)
  const [marquee, setMarquee] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const marqueeRef = useRef<{ startX: number; startY: number } | null>(null)

  const liveSize = useCallback((): { w: number; h: number } => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r || r.width === 0 || r.height === 0) return wrapSize
    return { w: r.width, h: r.height }
  }, [wrapRef, wrapSize])

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
    const size = liveSize()
    const targetScale = Math.max(0.7, Math.min(1.1, zoom))
    const cx = t.x + t.width / 2
    const cy = t.y + t.height / 2
    setZoom(targetScale)
    setPan({
      x: size.w / 2 - cx * targetScale,
      y: size.h / 2 - cy * targetScale,
    })
    onFocusConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest])

  function zoomTo(target: number): void {
    const size = liveSize()
    setZoom((z) => {
      const next = Math.min(2, Math.max(0.25, target))
      if (next === z) return z
      const cx = size.w / 2
      const cy = size.h / 2
      setPan((p) => ({
        x: cx - ((cx - p.x) / z) * next,
        y: cy - ((cy - p.y) / z) * next,
      }))
      return next
    })
  }

  function zoomBy(delta: number): void {
    const size = liveSize()
    setZoom((z) => {
      const next = Math.min(2, Math.max(0.25, z * (1 + delta)))
      if (next === z) return z
      const cx = size.w / 2
      const cy = size.h / 2
      setPan((p) => ({
        x: cx - ((cx - p.x) / z) * next,
        y: cy - ((cy - p.y) / z) * next,
      }))
      return next
    })
  }

  function fitAll(): void {
    const size = liveSize()
    if (nodes.length === 0 || size.w === 0 || size.h === 0) return
    const pad = 80
    const minX = Math.min(...nodes.map((n) => n.x)) - pad
    const minY = Math.min(...nodes.map((n) => n.y)) - pad
    const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + pad
    const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + pad
    const bw = Math.max(1, maxX - minX)
    const bh = Math.max(1, maxY - minY)
    const s = Math.min(size.w / bw, size.h / bh, 1)
    setZoom(s)
    setPan({
      x: (size.w - bw * s) / 2 - minX * s,
      y: (size.h - bh * s) / 2 - minY * s,
    })
  }

  // Dynamic surface bounds — extend with content + viewport so the canvas is
  // effectively unbounded; the surface grows as the user pans / adds nodes.
  const surface = useMemo(() => {
    const margin = 4000
    let minX = -margin
    let minY = -margin
    let maxX = margin
    let maxY = margin
    for (const n of nodes) {
      if (n.x - margin < minX) minX = n.x - margin
      if (n.y - margin < minY) minY = n.y - margin
      if (n.x + n.width + margin > maxX) maxX = n.x + n.width + margin
      if (n.y + n.height + margin > maxY) maxY = n.y + n.height + margin
    }
    const vMinX = -pan.x / zoom
    const vMinY = -pan.y / zoom
    const vMaxX = vMinX + wrapSize.w / zoom
    const vMaxY = vMinY + wrapSize.h / zoom
    if (vMinX - margin < minX) minX = vMinX - margin
    if (vMinY - margin < minY) minY = vMinY - margin
    if (vMaxX + margin > maxX) maxX = vMaxX + margin
    if (vMaxY + margin > maxY) maxY = vMaxY + margin
    return { minX, minY, w: maxX - minX, h: maxY - minY }
  }, [nodes, pan, zoom, wrapSize])

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
        const endpointSelected = selectedIds.includes(a.id) || selectedIds.includes(b.id)
        const edgeSelected = selectedEdgeId === edge.id
        return {
          id: edge.id,
          d: `M ${x1} ${y1} C ${x1 + c * sign} ${y1}, ${x2 - c * sign} ${y2}, ${x2} ${y2}`,
          highlighted: endpointSelected || edgeSelected,
          edgeSelected,
          x1,
          y1,
          x2,
          y2,
        }
      })
      .filter(<T,>(e: T | null): e is T => e !== null)
  }, [edges, nodes, selectedIds, selectedEdgeId])

  // Group-drag bookkeeping: capture starts for all selected nodes when the
  // user begins dragging one of them, then move the others by the same delta.
  const groupDragRef = useRef<{
    leadId: string
    starts: Record<string, { x: number; y: number }>
  } | null>(null)

  function handleNodeDragStart(id: string): void {
    if (selectedIds.length > 1 && selectedIds.includes(id)) {
      const starts: Record<string, { x: number; y: number }> = {}
      for (const n of nodes) {
        if (selectedIds.includes(n.id)) starts[n.id] = { x: n.x, y: n.y }
      }
      groupDragRef.current = { leadId: id, starts }
    } else {
      groupDragRef.current = null
    }
  }

  function handleNodeMove(id: string, patch: Partial<TerminalNodeData>): void {
    const m = groupDragRef.current
    if (m && id === m.leadId && patch.x !== undefined && patch.y !== undefined) {
      const dx = patch.x - m.starts[id].x
      const dy = patch.y - m.starts[id].y
      for (const oid of Object.keys(m.starts)) {
        if (oid === id) continue
        onMoveNode(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
      }
    }
    onMoveNode(id, patch)
  }

  function handleNodeUpdate(id: string, patch: Partial<TerminalNodeData>): void {
    const m = groupDragRef.current
    if (m && id === m.leadId && patch.x !== undefined && patch.y !== undefined) {
      const dx = patch.x - m.starts[id].x
      const dy = patch.y - m.starts[id].y
      for (const oid of Object.keys(m.starts)) {
        if (oid === id) continue
        onUpdateNode(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
      }
      groupDragRef.current = null
    }
    onUpdateNode(id, patch)
  }

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = wrapRef.current?.getBoundingClientRect()
    const lx = clientX - (r?.left ?? 0)
    const ly = clientY - (r?.top ?? 0)
    return { x: (lx - pan.x) / zoom, y: (ly - pan.y) / zoom }
  }

  function startMarquee(e: React.MouseEvent): void {
    const w = clientToWorld(e.clientX, e.clientY)
    marqueeRef.current = { startX: w.x, startY: w.y }
    setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y })
    function onMove(ev: MouseEvent): void {
      const m = marqueeRef.current
      if (!m) return
      const wp = clientToWorld(ev.clientX, ev.clientY)
      setMarquee({ x0: m.startX, y0: m.startY, x1: wp.x, y1: wp.y })
    }
    function onUp(ev: MouseEvent): void {
      const m = marqueeRef.current
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      marqueeRef.current = null
      if (!m) return
      const wp = clientToWorld(ev.clientX, ev.clientY)
      const x0 = Math.min(m.startX, wp.x)
      const y0 = Math.min(m.startY, wp.y)
      const x1 = Math.max(m.startX, wp.x)
      const y1 = Math.max(m.startY, wp.y)
      const hit = nodes
        .filter((n) => n.x < x1 && n.x + n.width > x0 && n.y < y1 && n.y + n.height > y0)
        .map((n) => n.id)
      onSelectMany(hit)
      setMarquee(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={wrapRef}
      className="canvas-ambient relative flex-1 overflow-hidden"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('.terminal-node')) return
        if ((e.target as HTMLElement).closest('[data-edge-id]')) return
        if (e.button !== 0) return
        if (e.shiftKey) {
          startMarquee(e)
          return
        }
        onSelect(null, false)
        onSelectEdge(null)
        handlers.onBackgroundMouseDown(e)
      }}
      onMouseMove={handlers.onMouseMove}
      onMouseUp={handlers.endPan}
      onMouseLeave={handlers.endPan}
      onWheel={handlers.onWheel}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.terminal-node')) return
        if ((e.target as HTMLElement).closest('[data-edge-id]')) return
        e.preventDefault()
        const w = clientToWorld(e.clientX, e.clientY)
        onCanvasContextMenu(w.x, w.y, e.clientX, e.clientY)
      }}
      style={{
        cursor:
          tool === 'link'
            ? 'crosshair'
            : tool === 'delete'
              ? 'not-allowed'
              : tool === 'pan'
                ? 'grab'
                : 'default',
      }}
    >
      <div
        className="canvas-surface absolute"
        style={{
          width: surface.w,
          height: surface.h,
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) translate(${surface.minX}px, ${surface.minY}px)`,
          backgroundPosition: `${-surface.minX}px ${-surface.minY}px`,
        }}
      >
        <svg
          className="edges-layer"
          style={{ width: surface.w, height: surface.h, left: 0, top: 0 }}
        >
          {edgePaths.map((p) => (
            <g key={p.id} transform={`translate(${-surface.minX},${-surface.minY})`} data-edge-id={p.id}>
              <path
                d={p.d}
                className="edge-hit"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  onSelectEdge(p.id)
                  onSelect(null, false)
                }}
              />
              <path d={p.d} className={p.highlighted ? 'selected' : ''} />
              <circle
                className={'endpoint' + (p.highlighted ? ' selected' : '')}
                cx={p.x1}
                cy={p.y1}
                r={2.5}
              />
              <circle
                className={'endpoint' + (p.highlighted ? ' selected' : '')}
                cx={p.x2}
                cy={p.y2}
                r={2.5}
              />
            </g>
          ))}
          {marquee && (
            <g transform={`translate(${-surface.minX},${-surface.minY})`}>
              <rect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="color-mix(in oklch, var(--accent) 10%, transparent)"
                stroke="var(--accent)"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
            </g>
          )}
        </svg>

        <div style={{ position: 'absolute', left: -surface.minX, top: -surface.minY }}>
          {nodes.map((node) => (
            <TerminalNode
              key={node.id}
              node={node}
              selected={selectedIds.includes(node.id)}
              focused={focusedId === node.id}
              scale={zoom}
              linkSource={linkSource}
              style={getTerminalStyle(node.id)}
              raised={contextMenuNodeId === node.id}
              tool={tool}
              onSelect={(id, additive) => {
                if (tool === 'delete') {
                  onRemoveNode(id)
                  return
                }
                if (tool === 'link') {
                  onLinkPick(id)
                  return
                }
                onSelect(id, additive)
              }}
              onDragStart={handleNodeDragStart}
              onMoveNode={handleNodeMove}
              onUpdateNode={handleNodeUpdate}
              onRemoveNode={onRemoveNode}
              onContextMenu={onNodeContextMenu}
            />
          ))}
        </div>
      </div>

      {nodes.length === 0 && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12.5px]"
          style={{ color: 'var(--fg-3)' }}
        >
          Right-click the canvas or press &ldquo;New terminal&rdquo;. Drag the background or use the mouse wheel to navigate.
        </div>
      )}

      <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
        <div className="controls" style={{ height: 32 }}>
          <ToolButton
            active={tool === 'select'}
            onClick={() => onSetTool('select')}
            title="Select (V)"
          >
            <ICursor size={14} />
          </ToolButton>
          <span className="sep" />
          <ToolButton
            active={tool === 'pan'}
            onClick={() => onSetTool('pan')}
            title="Pan (H)"
          >
            <IHand size={14} />
          </ToolButton>
          <span className="sep" />
          <ToolButton
            active={tool === 'link'}
            onClick={() => onSetTool(tool === 'link' ? 'select' : 'link')}
            title="Link terminals"
          >
            <ILink size={14} />
          </ToolButton>
          <span className="sep" />
          <ToolButton
            active={tool === 'delete'}
            onClick={() => onSetTool(tool === 'delete' ? 'select' : 'delete')}
            title="Delete on click"
            danger
          >
            <ITrash size={14} />
          </ToolButton>
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

      {minimapVisible ? (
        <Minimap
          nodes={nodes}
          selectedIds={selectedIds}
          pan={pan}
          zoom={zoom}
          wrapSize={wrapSize}
          onPan={(dx, dy) => setPan((p) => ({ x: p.x - dx, y: p.y - dy }))}
          onClose={() => setMinimapVisible(false)}
        />
      ) : (
        <button
          className="controls absolute bottom-4 right-4 z-30"
          style={{ width: 36, height: 36, justifyContent: 'center' }}
          onClick={() => setMinimapVisible(true)}
          title="Show minimap"
        >
          <IMap size={16} />
        </button>
      )}

      {tool === 'link' && (
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
      {tool === 'delete' && (
        <div
          className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 px-3 py-1.5 rounded-[8px] text-[12px]"
          style={{
            background: 'color-mix(in oklch, var(--bg-2) 92%, transparent)',
            border: '1px solid oklch(0.68 0.18 25)',
            color: 'var(--fg)',
          }}
        >
          Click any terminal to delete — Esc to cancel
        </div>
      )}
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  title,
  danger,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  danger?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      style={
        active
          ? {
              background: danger
                ? 'color-mix(in oklch, oklch(0.68 0.18 25) 18%, transparent)'
                : 'color-mix(in oklch, var(--accent) 18%, transparent)',
              color: danger ? 'oklch(0.68 0.18 25)' : 'var(--fg)',
            }
          : undefined
      }
    >
      {children}
    </button>
  )
}
