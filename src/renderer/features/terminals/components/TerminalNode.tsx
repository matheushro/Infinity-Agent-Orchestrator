// A single movable/resizable terminal window on the canvas.
// Layout/UI only — the xterm/pty session lives in useTerminalSession.
import { useState } from 'react'
import { Rnd } from 'react-rnd'
import { useTerminalSession } from '../hooks/useTerminalSession'
import type { TerminalNodeData } from '../types'

interface TerminalNodeProps {
  node: TerminalNodeData
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
}

export function TerminalNode({
  node,
  onUpdateNode,
  onRemoveNode
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

  return (
    <Rnd
      size={{ width: node.width, height: node.height }}
      position={{ x: node.x, y: node.y }}
      minWidth={280}
      minHeight={180}
      dragHandleClassName="terminal-node-header"
      onDragStop={(_e, d) => onUpdateNode(node.id, { x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onUpdateNode(node.id, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y
        })
      }
      className="terminal-node overflow-hidden rounded-lg border border-slate-700 shadow-xl"
    >
      <div className="flex h-full flex-col bg-[#0b1120]">
        <div className="terminal-node-header flex cursor-move items-center justify-between gap-2 bg-slate-800 px-3 py-1.5">
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
              className="min-w-0 flex-1 rounded bg-slate-700 px-1 text-xs font-medium text-slate-100 outline-none"
            />
          ) : (
            <span
              onDoubleClick={() => {
                setDraftTitle(node.title)
                setEditingTitle(true)
              }}
              title="Double-click to rename"
              className="min-w-0 flex-1 cursor-text truncate text-xs font-medium text-slate-200"
            >
              {node.title}
              <span className="text-slate-500">
                {' · '}
                {node.shell === 'default' ? 'default shell' : node.shell}
              </span>
            </span>
          )}
          <button
            onClick={() => onRemoveNode(node.id)}
            className="rounded px-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-red-400"
            title="Close terminal"
          >
            ✕
          </button>
        </div>
        <div ref={containerRef} className="min-h-0 flex-1 p-1" />
      </div>
    </Rnd>
  )
}
