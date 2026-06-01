// The navigable infinite canvas. Renders the terminal nodes inside a
// pan/zoom-able world. Viewport logic lives in usePanZoom.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TerminalNode } from '@renderer/features/terminals/components/TerminalNode'
import type { TerminalNodeData, TerminalStyle } from '@renderer/features/terminals/types'
import { NoteNode } from '@renderer/features/notes/components/NoteNode'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { NoteRecord, NoteLinkRecord } from '@shared/types/notes'
import type { EdgeRecord } from '@shared/types/terminal'
import type { CanvasTheme } from '../types'
import {
  ICursor,
  IFit,
  IHand,
  ILink,
  IMap,
  IMinus,
  INote,
  IPlus,
  IText,
  ITrash,
} from '@renderer/components/ui'
import { usePanZoom } from '../hooks/usePanZoom'
import { CanvasText } from './CanvasText'
import { Minimap } from './Minimap'

export type CanvasTool = 'select' | 'pan' | 'link' | 'delete' | 'text' | 'note'

type SideDir = 'left' | 'right' | 'top' | 'bottom'

interface SidePoint {
  x: number
  y: number
  dir: SideDir
}

// Pick the pair of rectangle-side midpoints (one per node) that minimises the
// distance between them. Handles overlapping rectangles and any orientation —
// the previous implementation only handled "a-left / b-right" arrangements and
// drew tangled curves when the two nodes overlapped.
function pickEdgeEndpoints(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): { x1: number; y1: number; x2: number; y2: number; sourceDir: SideDir; targetDir: SideDir } {
  const sidesOf = (r: { x: number; y: number; width: number; height: number }): SidePoint[] => {
    const cx = r.x + r.width / 2
    const cy = r.y + r.height / 2
    return [
      { x: r.x, y: cy, dir: 'left' },
      { x: r.x + r.width, y: cy, dir: 'right' },
      { x: cx, y: r.y, dir: 'top' },
      { x: cx, y: r.y + r.height, dir: 'bottom' },
    ]
  }

  const aSides = sidesOf(a)
  const bSides = sidesOf(b)

  let best = aSides[0]
  let bestB = bSides[0]
  let bestD = Infinity
  for (const sa of aSides) {
    for (const sb of bSides) {
      const dx = sb.x - sa.x
      const dy = sb.y - sa.y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = sa
        bestB = sb
      }
    }
  }
  return { x1: best.x, y1: best.y, x2: bestB.x, y2: bestB.y, sourceDir: best.dir, targetDir: bestB.dir }
}

function offsetByDirection(x: number, y: number, dir: SideDir, c: number): [number, number] {
  if (dir === 'left') return [x - c, y]
  if (dir === 'right') return [x + c, y]
  if (dir === 'top') return [x, y - c]
  return [x, y + c]
}

interface CanvasProps {
  nodes: TerminalNodeData[]
  texts: CanvasTextRecord[]
  notes: NoteRecord[]
  edges: EdgeRecord[]
  noteLinks: NoteLinkRecord[]
  selectedIds: string[]
  selectedTextIds: string[]
  selectedNoteIds: string[]
  selectedEdgeId: string | null
  editingTextId: string | null
  editingNoteId: string | null
  focusedId: string | null
  focusRequest: string | null
  linkSource: string | null
  tool: CanvasTool
  contextMenuNodeId: string | null
  onSelect: (id: string | null, additive: boolean) => void
  onSelectText: (id: string | null) => void
  onSelectEdge: (id: string | null) => void
  onSelectMany: (ids: string[]) => void
  onSelectManyTexts: (ids: string[]) => void
  onSelectManyMixed: (nodeIds: string[], textIds: string[]) => void
  onCreateText: (position: { x: number; y: number }) => void
  onEditText: (id: string | null) => void
  onMoveText: (id: string, patch: Partial<CanvasTextRecord>) => void
  onUpdateText: (id: string, patch: Partial<CanvasTextRecord>) => void
  onRemoveText: (id: string) => void
  onSelectNote: (id: string | null) => void
  onCreateNote: (position: { x: number; y: number }) => void
  onEditNote: (id: string | null) => void
  onMoveNote: (id: string, patch: Partial<NoteRecord>) => void
  onUpdateNote: (id: string, patch: Partial<NoteRecord>) => void
  onRemoveNote: (id: string) => void
  onNoteContextMenu: (id: string, x: number, y: number) => void
  onFocusConsumed: () => void
  onMoveNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
  onLinkPick: (id: string) => void
  onSetTool: (t: CanvasTool) => void
  onNodeContextMenu: (id: string, x: number, y: number) => void
  onTextContextMenu: (id: string, x: number, y: number) => void
  onCanvasContextMenu: (worldX: number, worldY: number, clientX: number, clientY: number) => void
  getTerminalStyle: (id: string) => TerminalStyle
  getRestartSignal: (id: string) => number
  theme: CanvasTheme
}

export function Canvas({
  nodes,
  texts,
  notes,
  edges,
  noteLinks,
  selectedIds,
  selectedTextIds,
  selectedNoteIds,
  selectedEdgeId,
  editingTextId,
  editingNoteId,
  focusedId,
  focusRequest,
  linkSource,
  tool,
  contextMenuNodeId,
  onSelect,
  onSelectText,
  onSelectEdge,
  onSelectMany,
  onSelectManyTexts,
  onSelectManyMixed,
  onCreateText,
  onEditText,
  onMoveText,
  onUpdateText,
  onRemoveText,
  onSelectNote,
  onCreateNote,
  onEditNote,
  onMoveNote,
  onUpdateNote,
  onRemoveNote,
  onNoteContextMenu,
  onFocusConsumed,
  onMoveNode,
  onUpdateNode,
  onRemoveNode,
  onLinkPick,
  onSetTool,
  onNodeContextMenu,
  onTextContextMenu,
  onCanvasContextMenu,
  getTerminalStyle,
  getRestartSignal,
  theme,
}: CanvasProps): JSX.Element {
  const { pan, zoom, setPan, setZoom, containerRef, handlers, startPan } = usePanZoom()
  const wrapRef = containerRef
  const [wrapSize, setWrapSize] = useState({ w: 1200, h: 800 })
  // Gate the Rnd-based layers (terminals/texts) until the canvas wrapper has a
  // real, laid-out size. react-rnd measures its offsetFromParent once on mount;
  // if the scaled canvas-surface isn't laid out yet (0x0, common on Linux at
  // app open) it bakes a wrong offset and renders nodes at node.x*(1+zoom).
  const [measured, setMeasured] = useState(false)
  const [minimapVisible, setMinimapVisible] = useState(true)
  const [marquee, setMarquee] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const marqueeRef = useRef<{ startX: number; startY: number } | null>(null)
  const rightClickStateRef = useRef<{ startX: number; startY: number; isDragging: boolean } | null>(
    null
  )

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
      if (r.width > 0 && r.height > 0) {
        setWrapSize({ w: r.width, h: r.height })
        setMeasured(true)
      }
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      setWrapSize({ w: r.width, h: r.height })
      setMeasured(true)
    }
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
    if (
      (nodes.length === 0 && texts.length === 0 && notes.length === 0) ||
      size.w === 0 ||
      size.h === 0
    )
      return
    const pad = 80
    const elements = [...nodes, ...texts, ...notes]
    const minX = Math.min(...elements.map((n) => n.x)) - pad
    const minY = Math.min(...elements.map((n) => n.y)) - pad
    const maxX = Math.max(...elements.map((n) => n.x + n.width)) + pad
    const maxY = Math.max(...elements.map((n) => n.y + n.height)) + pad
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
    for (const text of texts) {
      if (text.x - margin < minX) minX = text.x - margin
      if (text.y - margin < minY) minY = text.y - margin
      if (text.x + text.width + margin > maxX) maxX = text.x + text.width + margin
      if (text.y + text.height + margin > maxY) maxY = text.y + text.height + margin
    }
    for (const note of notes) {
      if (note.x - margin < minX) minX = note.x - margin
      if (note.y - margin < minY) minY = note.y - margin
      if (note.x + note.width + margin > maxX) maxX = note.x + note.width + margin
      if (note.y + note.height + margin > maxY) maxY = note.y + note.height + margin
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
  }, [nodes, texts, notes, pan, zoom, wrapSize])

  const edgePaths = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return edges
      .map((edge) => {
        const a = byId.get(edge.source)
        const b = byId.get(edge.target)
        if (!a || !b) return null
        const { x1, y1, x2, y2, sourceDir, targetDir } = pickEdgeEndpoints(a, b)
        const dist = Math.hypot(x2 - x1, y2 - y1)
        const c = Math.min(180, Math.max(60, dist * 0.4))
        const [cp1x, cp1y] = offsetByDirection(x1, y1, sourceDir, c)
        const [cp2x, cp2y] = offsetByDirection(x2, y2, targetDir, c)
        const endpointSelected = selectedIds.includes(a.id) || selectedIds.includes(b.id)
        const edgeSelected = selectedEdgeId === edge.id
        return {
          id: edge.id,
          d: `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`,
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

  // Note ↔ terminal access links. Drawn dashed to distinguish them from
  // terminal↔terminal edges. Endpoints live in two different collections, so we
  // build one combined position map keyed by id.
  const noteLinkPaths = useMemo(() => {
    const posById = new Map<string, { x: number; y: number; width: number; height: number }>()
    for (const n of nodes) posById.set(n.id, n)
    for (const note of notes) posById.set(note.id, note)
    return (noteLinks ?? [])
      .map((link) => {
        const a = posById.get(link.terminal_id)
        const b = posById.get(link.note_id)
        if (!a || !b) return null
        const { x1, y1, x2, y2, sourceDir, targetDir } = pickEdgeEndpoints(a, b)
        const dist = Math.hypot(x2 - x1, y2 - y1)
        const c = Math.min(180, Math.max(60, dist * 0.4))
        const [cp1x, cp1y] = offsetByDirection(x1, y1, sourceDir, c)
        const [cp2x, cp2y] = offsetByDirection(x2, y2, targetDir, c)
        const endpointSelected =
          selectedIds.includes(link.terminal_id) || selectedNoteIds.includes(link.note_id)
        const linkSelected = selectedEdgeId === link.id
        return {
          id: link.id,
          d: `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`,
          highlighted: endpointSelected || linkSelected,
          x1,
          y1,
          x2,
          y2,
        }
      })
      .filter(<T,>(e: T | null): e is T => e !== null)
  }, [noteLinks, nodes, notes, selectedIds, selectedNoteIds, selectedEdgeId])

  // Group-drag bookkeeping: capture starts for all selected nodes when the
  // user begins dragging one of them, then move the others by the same delta.
  const groupDragRef = useRef<{
    leadType: 'node' | 'text'
    leadId: string
    starts: Record<string, { x: number; y: number }>
  } | null>(null)

  function handleNodeDragStart(id: string): void {
    if (selectedIds.includes(id) && (selectedIds.length > 1 || selectedTextIds.length > 0)) {
      const starts: Record<string, { x: number; y: number }> = {}
      for (const n of nodes) {
        if (selectedIds.includes(n.id)) starts[n.id] = { x: n.x, y: n.y }
      }
      for (const text of texts) {
        if (selectedTextIds.includes(text.id)) starts[text.id] = { x: text.x, y: text.y }
      }
      groupDragRef.current = { leadType: 'node', leadId: id, starts }
    } else {
      groupDragRef.current = null
    }
  }

  function handleTextDragStart(id: string): void {
    if (selectedTextIds.includes(id) && (selectedTextIds.length > 1 || selectedIds.length > 0)) {
      const starts: Record<string, { x: number; y: number }> = {}
      for (const n of nodes) {
        if (selectedIds.includes(n.id)) starts[n.id] = { x: n.x, y: n.y }
      }
      for (const text of texts) {
        if (selectedTextIds.includes(text.id)) starts[text.id] = { x: text.x, y: text.y }
      }
      groupDragRef.current = { leadType: 'text', leadId: id, starts }
    } else {
      groupDragRef.current = null
    }
  }

  function handleNodeMove(id: string, patch: Partial<TerminalNodeData>): void {
    const m = groupDragRef.current
    if (
      m &&
      m.leadType === 'node' &&
      id === m.leadId &&
      patch.x !== undefined &&
      patch.y !== undefined
    ) {
      const dx = patch.x - m.starts[id].x
      const dy = patch.y - m.starts[id].y
      for (const oid of Object.keys(m.starts)) {
        if (oid === id) continue
        if (nodes.some((n) => n.id === oid)) {
          onMoveNode(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
        }
        if (texts.some((t) => t.id === oid)) {
          onMoveText(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
        }
      }
    }
    onMoveNode(id, patch)
  }

  function handleNodeUpdate(id: string, patch: Partial<TerminalNodeData>): void {
    const m = groupDragRef.current
    if (
      m &&
      m.leadType === 'node' &&
      id === m.leadId &&
      patch.x !== undefined &&
      patch.y !== undefined
    ) {
      const dx = patch.x - m.starts[id].x
      const dy = patch.y - m.starts[id].y
      for (const oid of Object.keys(m.starts)) {
        if (oid === id) continue
        if (nodes.some((n) => n.id === oid)) {
          onUpdateNode(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
        }
        if (texts.some((t) => t.id === oid)) {
          onUpdateText(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
        }
      }
      groupDragRef.current = null
    }
    onUpdateNode(id, patch)
  }

  function handleTextMove(id: string, patch: Partial<CanvasTextRecord>): void {
    const m = groupDragRef.current
    if (
      m &&
      m.leadType === 'text' &&
      id === m.leadId &&
      patch.x !== undefined &&
      patch.y !== undefined
    ) {
      const dx = patch.x - m.starts[id].x
      const dy = patch.y - m.starts[id].y
      for (const oid of Object.keys(m.starts)) {
        if (oid === id) continue
        if (nodes.some((n) => n.id === oid)) {
          onMoveNode(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
        }
        if (texts.some((t) => t.id === oid)) {
          onMoveText(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
        }
      }
    }
    onMoveText(id, patch)
  }

  function handleTextUpdate(id: string, patch: Partial<CanvasTextRecord>): void {
    const m = groupDragRef.current
    if (
      m &&
      m.leadType === 'text' &&
      id === m.leadId &&
      patch.x !== undefined &&
      patch.y !== undefined
    ) {
      const dx = patch.x - m.starts[id].x
      const dy = patch.y - m.starts[id].y
      for (const oid of Object.keys(m.starts)) {
        if (oid === id) continue
        if (nodes.some((n) => n.id === oid)) {
          onUpdateNode(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
        }
        if (texts.some((t) => t.id === oid)) {
          onUpdateText(oid, { x: m.starts[oid].x + dx, y: m.starts[oid].y + dy })
        }
      }
      groupDragRef.current = null
    }
    onUpdateText(id, patch)
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
      const hitTexts = texts
        .filter((t) => t.x < x1 && t.x + t.width > x0 && t.y < y1 && t.y + t.height > y0)
        .map((t) => t.id)
      onSelectManyMixed(hit, hitTexts)
      setMarquee(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleCanvasMouseDown(e: React.MouseEvent): void {
    // Shift + left click: pan even over terminal nodes
    const isShiftLeftClick = e.shiftKey && e.button === 0
    if (!isShiftLeftClick && (e.target as HTMLElement).closest('.terminal-node')) return
    if (!isShiftLeftClick && (e.target as HTMLElement).closest('.canvas-text')) return
    if (!isShiftLeftClick && (e.target as HTMLElement).closest('.note-node')) return
    if ((e.target as HTMLElement).closest('[data-edge-id]')) return

    const DRAG_THRESHOLD = 4

    // Shift + left click: start panning immediately
    if (isShiftLeftClick) {
      startPan(e.clientX, e.clientY)
      return
    }

    // Right-click: potential hold-to-pan
    if (e.button === 2) {
      const startX = e.clientX
      const startY = e.clientY

      rightClickStateRef.current = { startX, startY, isDragging: false }

      function onTmpMove(ev: MouseEvent): void {
        if (rightClickStateRef.current?.isDragging) return
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > DRAG_THRESHOLD) {
          rightClickStateRef.current!.isDragging = true
          startPan(ev.clientX, ev.clientY)
        }
      }

      function onTmpUp(): void {
        window.removeEventListener('mousemove', onTmpMove)
        window.removeEventListener('mouseup', onTmpUp)
        if (rightClickStateRef.current?.isDragging) {
          handlers.endPan()
        }
        // Keep ref alive for onContextMenu to check
      }

      window.addEventListener('mousemove', onTmpMove)
      window.addEventListener('mouseup', onTmpUp)
      return
    }

    // Left-click
    if (e.button !== 0) return

    if (tool === 'text' || tool === 'note') {
      return
    }

    // Select mode: discriminate between click and drag
    if (tool === 'select') {
      const startX = e.clientX
      const startY = e.clientY
      let moved = false

      function onTmpMove(ev: MouseEvent): void {
        if (moved) return
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > DRAG_THRESHOLD) {
          moved = true
          window.removeEventListener('mousemove', onTmpMove)
          window.removeEventListener('mouseup', onTmpUp)
          startMarquee(e)
        }
      }

      function onTmpUp(): void {
        window.removeEventListener('mousemove', onTmpMove)
        window.removeEventListener('mouseup', onTmpUp)
        if (!moved) {
          onSelect(null, false)
          onSelectText(null)
          onSelectNote(null)
          onSelectEdge(null)
          onSelectManyTexts([])
        }
      }

      window.addEventListener('mousemove', onTmpMove)
      window.addEventListener('mouseup', onTmpUp)
      return
    }

    // Pan mode: start panning immediately
    if (tool === 'pan') {
      startPan(e.clientX, e.clientY)
      return
    }

    // Other tools (link, delete): deselect on background click
    onSelect(null, false)
    onSelectText(null)
    onSelectNote(null)
    onSelectEdge(null)
  }

  function handleCanvasDoubleClick(e: React.MouseEvent): void {
    if (e.button !== 0 || tool !== 'select') return
    const target = e.target as HTMLElement
    if (target.closest('.terminal-node') || target.closest('.canvas-text')) return
    if (target.closest('.note-node')) return
    if (target.closest('[data-edge-id]')) return
    onCreateText(clientToWorld(e.clientX, e.clientY))
  }

  function handleCanvasClick(e: React.MouseEvent): void {
    if (e.button !== 0 || (tool !== 'text' && tool !== 'note')) return
    const target = e.target as HTMLElement
    if (target.closest('.terminal-node') || target.closest('.canvas-text')) return
    if (target.closest('.note-node')) return
    if (target.closest('[data-edge-id]')) return

    onSelect(null, false)
    onSelectEdge(null)
    onSelectText(null)
    onSelectNote(null)
    const position = clientToWorld(e.clientX, e.clientY)
    if (tool === 'note') onCreateNote(position)
    else onCreateText(position)
    onSetTool('select')
  }

  function handleCanvasContextMenu(e: React.MouseEvent): void {
    if ((e.target as HTMLElement).closest('.terminal-node')) return
    if ((e.target as HTMLElement).closest('.canvas-text')) return
    if ((e.target as HTMLElement).closest('.note-node')) return
    if ((e.target as HTMLElement).closest('[data-edge-id]')) return

    e.preventDefault()
    e.stopPropagation()

    // If right-click drag happened, don't show context menu
    const wasDragging = rightClickStateRef.current?.isDragging ?? false
    rightClickStateRef.current = null // Clean up the ref now

    if (wasDragging) {
      return
    }

    const w = clientToWorld(e.clientX, e.clientY)
    onCanvasContextMenu(w.x, w.y, e.clientX, e.clientY)
  }

  function handleCanvasMouseUp(e: React.MouseEvent): void {
    handlers.endPan()
  }

  return (
    <div
      ref={wrapRef}
      className="canvas-ambient relative flex-1 overflow-hidden"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handlers.onMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseLeave={handlers.endPan}
      onWheel={handlers.onWheel}
      onClick={handleCanvasClick}
      onContextMenu={handleCanvasContextMenu}
      onDoubleClick={handleCanvasDoubleClick}
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
        onSelectText(null)
        onSelectNote(null)
        onSelectManyTexts([])
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
          {noteLinkPaths.map((p) => (
            <g key={p.id} transform={`translate(${-surface.minX},${-surface.minY})`} data-edge-id={p.id}>
              <path
                d={p.d}
                className="edge-hit"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  onSelectEdge(p.id)
                  onSelect(null, false)
                  onSelectText(null)
                  onSelectNote(null)
                  onSelectManyTexts([])
                }}
              />
              <path
                d={p.d}
                className={p.highlighted ? 'selected' : ''}
                style={{ strokeDasharray: '6 4', opacity: 0.85 }}
              />
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
          {measured && nodes.map((node) => (
            <TerminalNode
              key={node.id}
              node={node}
              selected={selectedIds.includes(node.id)}
              focused={focusedId === node.id}
              scale={zoom}
              linkSource={linkSource}
              style={getTerminalStyle(node.id)}
              globalTheme={theme}
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
                onSelectText(null)
                onSelectNote(null)
                onSelect(id, additive)
              }}
              onDragStart={handleNodeDragStart}
              onMoveNode={handleNodeMove}
              onUpdateNode={handleNodeUpdate}
              onRemoveNode={onRemoveNode}
              onContextMenu={onNodeContextMenu}
              restartSignal={getRestartSignal(node.id)}
            />
          ))}
          {measured && texts.map((text) => (
            <CanvasText
              key={text.id}
              text={text}
              selected={selectedTextIds.includes(text.id)}
              editing={editingTextId === text.id}
              scale={zoom}
              onSelect={(id) => {
                onSelect(null, false)
                onSelectEdge(null)
                onSelectNote(null)
                onSelectText(id)
                onSelectManyTexts(id ? [id] : [])
              }}
              onEdit={onEditText}
              onDragStart={handleTextDragStart}
              onMove={handleTextMove}
              onUpdate={handleTextUpdate}
              onRemove={onRemoveText}
              onEditingComplete={() => onEditText(null)}
              onContextMenu={onTextContextMenu}
            />
          ))}
          {measured && notes.map((note) => (
            <NoteNode
              key={note.id}
              note={note}
              selected={selectedNoteIds.includes(note.id)}
              editing={editingNoteId === note.id}
              scale={zoom}
              tool={tool}
              linkSource={linkSource}
              onSelect={(id) => {
                if (tool === 'delete') {
                  onRemoveNote(id)
                  return
                }
                if (tool === 'link') {
                  onLinkPick(id)
                  return
                }
                onSelect(null, false)
                onSelectEdge(null)
                onSelectText(null)
                onSelectManyTexts([])
                onSelectNote(id)
              }}
              onEdit={onEditNote}
              onDragStart={() => onSelectNote(note.id)}
              onMove={onMoveNote}
              onUpdate={onUpdateNote}
              onRemove={onRemoveNote}
              onEditingComplete={() => onEditNote(null)}
              onContextMenu={onNoteContextMenu}
            />
          ))}
        </div>
      </div>

      {nodes.length === 0 && texts.length === 0 && notes.length === 0 && (
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
            active={tool === 'text'}
            onClick={() => onSetTool(tool === 'text' ? 'select' : 'text')}
            title="Text (T)"
          >
            <IText size={14} />
          </ToolButton>
          <span className="sep" />
          <ToolButton
            active={tool === 'note'}
            onClick={() => onSetTool(tool === 'note' ? 'select' : 'note')}
            title="Note (N)"
          >
            <INote size={14} />
          </ToolButton>
          <span className="sep" />
          <ToolButton
            active={tool === 'link'}
            onClick={() => onSetTool(tool === 'link' ? 'select' : 'link')}
            title="Link terminals & notes"
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
          texts={texts}
          notes={notes}
          edges={edges}
          selectedIds={selectedIds}
          selectedTextIds={selectedTextIds}
          selectedNoteIds={selectedNoteIds}
          selectedEdgeId={selectedEdgeId}
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
            ? 'Click another terminal (connect agents) or a note (grant access) — Esc to cancel'
            : 'Pick a terminal or note to link — Esc to cancel'}
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
