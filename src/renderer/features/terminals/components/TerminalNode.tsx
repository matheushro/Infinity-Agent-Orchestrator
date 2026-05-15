// A single movable/resizable terminal window on the canvas.
// The xterm/pty session lives in useTerminalSession.
import { useState } from 'react'
import { Rnd } from 'react-rnd'
import { IClose } from '@renderer/components/ui'
import { useTerminalSession } from '../hooks/useTerminalSession'
import type { TerminalNodeData } from '../types'

interface TerminalNodeProps {
  node: TerminalNodeData
  selected: boolean
  focused: boolean
  scale: number
  linkSource: string | null
  onSelect: (id: string) => void
  /** In-memory move during drag/resize. Cheap, no DB write. */
  onMoveNode: (id: string, patch: Partial<TerminalNodeData>) => void
  /** Persisted final position/size after the gesture ends. */
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
  /** Linking-mode entrypoint: called when the user picks this node. */
  onLinkPick: ((id: string) => void) | null
}

export function TerminalNode({
  node,
  selected,
  focused,
  scale,
  linkSource,
  onSelect,
  onMoveNode,
  onUpdateNode,
  onRemoveNode,
  onLinkPick,
}: TerminalNodeProps): JSX.Element {
  const containerRef = useTerminalSession(node)

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(node.title)

  function commitTitle(): void {
    const next = draftTitle.trim() || node.title
    onUpdateNode(node.id, { title: next })
    setDraftTitle(next)
    setEditingTitle(false)
  }

  const isLinking = onLinkPick !== null
  const isLinkSource = linkSource === node.id

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
      onDragStart={() => onSelect(node.id)}
      onDrag={(_e, d) => onMoveNode(node.id, { x: d.x, y: d.y })}
      onDragStop={(_e, d) => onUpdateNode(node.id, { x: d.x, y: d.y })}
      onResizeStart={() => onSelect(node.id)}
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
      onMouseDown={() => {
        if (isLinking) {
          onLinkPick?.(node.id)
          return
        }
        onSelect(node.id)
      }}
      className={
        'terminal-node overflow-hidden rounded-[12px] ' +
        (selected ? 'is-selected node-shadow-selected ' : 'node-shadow ') +
        (focused ? 'node-pulse ' : '') +
        (isLinkSource ? 'is-link-source ' : '')
      }
      style={{
        background: 'var(--node-bg)',
        border: '1px solid var(--line)',
        outline: isLinkSource ? '2px solid var(--accent)' : 'none',
        outlineOffset: 2,
      }}
    >
      <div className="flex h-full flex-col">
        {/* Header --------------------------------------------------------- */}
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
          className="min-h-0 flex-1 p-1"
          style={{ background: 'var(--terminal)' }}
        />
      </div>
    </Rnd>
  )
}
