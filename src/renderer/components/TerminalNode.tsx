import { useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TerminalNodeData } from '../App'
import { COMMANDS } from '../commands'

interface TerminalNodeProps {
  node: TerminalNodeData
  onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  onRemoveNode: (id: string) => void
}

export default function TerminalNode({
  node,
  onUpdateNode,
  onRemoveNode
}: TerminalNodeProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(node.title)

  function commitTitle(): void {
    const next = draftTitle.trim() || node.title
    onUpdateNode(node.id, { title: next })
    setDraftTitle(next)
    setEditingTitle(false)
  }

  // Initialize xterm and connect it to the pty in the main process once per node.
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: { background: '#0b1120', foreground: '#e2e8f0' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    let disposed = false

    // Unique id per pty session. Do not reuse node.id, which is only for persistence/layout:
    // under StrictMode the effect mounts twice, and the dead pty from the first mount
    // would send `pty:exit` to the new terminal and print "[process exited]".
    const ptyId = crypto.randomUUID()

    // Create the pty process before wiring listeners.
    window.ptyApi
      .create({
        id: ptyId,
        shell: node.shell === 'default' ? undefined : node.shell,
        cols: term.cols,
        rows: term.rows,
        cwd: node.cwd,
        command: COMMANDS[node.command].cmd
      })
      .then(() => {
        if (disposed) return
        term.focus()
      })

    // The renderer never executes commands: it only sends typed input.
    const inputSub = term.onData((data) => window.ptyApi.input(ptyId, data))

    const offData = window.ptyApi.onData((id, data) => {
      if (id === ptyId) term.write(data)
    })
    const offExit = window.ptyApi.onExit((id) => {
      if (id === ptyId) term.write('\r\n\x1b[31m[process exited]\x1b[0m\r\n')
    })

    // Keep the pty synced with the container size while dragging/resizing the node.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
        window.ptyApi.resize(ptyId, term.cols, term.rows)
      } catch {
        // container still has no useful dimensions
      }
    })
    observer.observe(containerRef.current)

    return () => {
      disposed = true
      observer.disconnect()
      inputSub.dispose()
      offData()
      offExit()
      window.ptyApi.kill(ptyId)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
