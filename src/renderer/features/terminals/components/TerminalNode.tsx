// A single movable/resizable terminal window on the canvas.
// The xterm/pty session lives in useTerminalSession.
import { useState } from 'react'
import { Rnd } from 'react-rnd'
import { IClose } from '@renderer/components/ui'
import { useTerminalSession } from '../hooks/useTerminalSession'
import type { TerminalNodeData, TerminalStyle } from '../types'
import type { CanvasTool } from '@renderer/features/canvas/components/Canvas'

interface TerminalNodeProps {
  node: TerminalNodeData
  selected: boolean
  focused: boolean
  scale: number
  linkSource: string | null
  style: TerminalStyle
  tool: CanvasTool
  onSelect: (id: string, additive: boolean) => void
  onDragStart: (id: string) => void
  onMoveNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
  raised: boolean
}

export function TerminalNode({
  node,
  selected,
  focused,
  scale,
  linkSource,
  style,
  tool,
  onSelect,
  onDragStart,
  onMoveNode,
  onUpdateNode,
  onRemoveNode,
  onContextMenu,
  raised,
}: TerminalNodeProps): JSX.Element {
  const containerRef = useTerminalSession(node, style)

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(node.title)

  function commitTitle(): void {
    const next = draftTitle.trim() || node.title
    onUpdateNode(node.id, { title: next })
    setDraftTitle(next)
    setEditingTitle(false)
  }

  const isLinking = tool === 'link'
  const isDelete = tool === 'delete'
  const isLinkSource = linkSource === node.id
  const isDark = style.theme === 'dark'

  return (
    <Rnd
      size={{ width: node.width, height: node.height }}
      position={{ x: node.x, y: node.y }}
      minWidth={280}
      minHeight={180}
      scale={scale}
      dragHandleClassName="terminal-node-header"
      enableResizing={{
        top: true,
        right: true,
        bottom: true,
        left: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
        topLeft: true,
      }}
      onDragStart={() => {
        if (!selected) onSelect(node.id, false)
        onDragStart(node.id)
      }}
      onDrag={(_e, d) => onMoveNode(node.id, { x: d.x, y: d.y })}
      onDragStop={(_e, d) => onUpdateNode(node.id, { x: d.x, y: d.y })}
      onResizeStart={() => onSelect(node.id, false)}
      onResize={(_e, _dir, ref, _delta, pos) =>
        onMoveNode(node.id, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y,
        })
      }
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onUpdateNode(node.id, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y,
        })
      }
      onMouseDown={(e) => {
        if (isDelete) {
          onRemoveNode(node.id)
          return
        }
        if (isLinking) {
          onSelect(node.id, false)
          return
        }
        onSelect(node.id, (e as unknown as MouseEvent).shiftKey)
      }}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect(node.id, false)
        onContextMenu(node.id, e.clientX, e.clientY)
      }}
      className={
        'terminal-node overflow-hidden rounded-[12px] ' +
        (selected ? 'is-selected node-shadow-selected ' : 'node-shadow ') +
        (focused ? 'node-pulse ' : '') +
        (isLinkSource ? 'is-link-source ' : '') +
        (isDark ? 'terminal-node-dark ' : 'terminal-node-light ')
      }
      style={{
        background: 'var(--node-bg)',
        border: '1px solid var(--line)',
        outline: isLinkSource ? '2px solid var(--accent)' : 'none',
        outlineOffset: 2,
        zIndex: raised ? 50 : selected ? 10 : 1,
      }}
    >
      <div className="flex h-full flex-col">
        <div
          className="terminal-node-header flex items-center gap-3 px-3 select-none"
          style={{
            height: 36,
            background: 'var(--node-head)',
            borderBottom: '1px solid var(--line)',
            cursor: isLinking ? 'crosshair' : 'grab',
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 leading-none">
            {editingTitle ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle()
                  if (e.key === 'Escape') {
                    setDraftTitle(node.title)
                    setEditingTitle(false)
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 bg-transparent outline-none text-[12.5px] font-medium"
                style={{ color: 'var(--fg)' }}
              />
            ) : (
              <>
                <span
                  className="text-[12.5px] font-medium truncate"
                  style={{ color: 'var(--fg)' }}
                  onDoubleClick={() => {
                    setDraftTitle(node.title)
                    setEditingTitle(true)
                  }}
                  title="Double-click to rename"
                >
                  {node.title}
                </span>
                <span style={{ color: 'var(--fg-3)' }}>·</span>
                <span
                  className="text-[11.5px] font-mono truncate"
                  style={{ color: 'var(--fg-3)' }}
                >
                  {node.cwd}
                </span>
              </>
            )}
          </div>

          <button
            className="icon-btn !w-6 !h-6"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveNode(node.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Close terminal"
            aria-label="Close terminal"
          >
            <IClose size={12} />
          </button>
        </div>

        <div
          ref={containerRef}
          className="min-h-0 flex-1 p-1 nice-scroll"
          style={{ background: isDark ? '#0b1120' : '#f7f7f5' }}
        />
      </div>
    </Rnd>
  )
}
