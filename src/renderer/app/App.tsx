// Application shell: composes the sidebar, topbar, canvas and modals.
import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Canvas, type CanvasTool } from '@renderer/features/canvas/components/Canvas'
import { NewTerminalModal } from '@renderer/features/terminals/components/NewTerminalModal'
import { TerminalContextMenu } from '@renderer/features/terminals/components/TerminalContextMenu'
import { TerminalStyleModal } from '@renderer/features/terminals/components/TerminalStyleModal'
import { useTerminals } from '@renderer/features/terminals/hooks/useTerminals'
import { useTerminalStyles } from '@renderer/features/terminals/hooks/useTerminalStyles'
import { useEdges } from '@renderer/features/canvas/hooks/useEdges'
import { useLocalStorage } from '@renderer/hooks/useLocalStorage'
import type { ShellType } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'

interface ContextMenuState {
  nodeId: string
  x: number
  y: number
}

interface CanvasMenuState {
  worldX: number
  worldY: number
  clientX: number
  clientY: number
}

export default function App(): JSX.Element {
  const { nodes, createTerminal, moveNode, updateNode, removeNode } = useTerminals()
  const { edges, addEdge, removeEdge } = useEdges()
  const { getStyle, setStyle, removeStyle } = useTerminalStyles()
  const [shell, setShell] = useState<ShellType>('default')
  const [theme, setTheme] = useLocalStorage<CanvasTheme>('canvasTheme', 'dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('sidebarCollapsed', false)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingCreatePos, setPendingCreatePos] = useState<{ x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<string | null>(null)

  const [tool, setTool] = useState<CanvasTool>('select')
  const [linkSource, setLinkSource] = useState<string | null>(null)

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<CanvasMenuState | null>(null)
  const [styleEditorFor, setStyleEditorFor] = useState<string | null>(null)

  const selectedId = selectedIds[0] ?? null

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setPendingCreatePos(null)
        setModalOpen(true)
      }
      if (e.key === 'Escape') {
        if (tool === 'link' || tool === 'delete') {
          setTool('select')
          setLinkSource(null)
        }
      }
      if (e.key === 'Delete') {
        const t = e.target as HTMLElement | null
        const editable =
          t &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.isContentEditable)
        if (editable) return
        if (selectedEdgeId) {
          removeEdge(selectedEdgeId)
          setSelectedEdgeId(null)
          return
        }
        if (selectedIds.length > 0) {
          for (const id of selectedIds) {
            removeNode(id)
            removeStyle(id)
          }
          setSelectedIds([])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, selectedIds, selectedEdgeId, removeEdge, removeNode, removeStyle])

  function requestFocus(id: string): void {
    setFocusedId(id)
    setFocusRequest(id)
    window.setTimeout(() => setFocusedId(null), 850)
  }

  function startLinkFrom(id: string): void {
    setTool('link')
    setLinkSource(id)
  }

  function handleLinkPick(id: string): void {
    if (!linkSource) {
      setLinkSource(id)
      return
    }
    if (linkSource !== id) addEdge(linkSource, id)
    setTool('select')
    setLinkSource(null)
  }

  function selectNode(id: string | null, additive: boolean): void {
    if (id === null) {
      setSelectedIds([])
      return
    }
    setSelectedEdgeId(null)
    setSelectedIds((prev) => {
      if (additive) {
        if (prev.includes(id)) return prev.filter((p) => p !== id)
        return [...prev, id]
      }
      if (prev.length === 1 && prev[0] === id) return prev
      return [id]
    })
  }

  function selectEdge(id: string | null): void {
    setSelectedEdgeId(id)
    if (id !== null) setSelectedIds([])
  }

  const styleEditorNode = styleEditorFor
    ? nodes.find((n) => n.id === styleEditorFor)
    : null

  return (
    <div className="flex h-full w-full" style={{ background: 'var(--bg)' }}>
      <Sidebar
        terminals={nodes}
        selectedId={selectedId}
        theme={theme}
        query={query}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onQuery={setQuery}
        onNewTerminal={() => {
          setPendingCreatePos(null)
          setModalOpen(true)
        }}
        onSelect={(id) => selectNode(id, false)}
        onFocus={requestFocus}
        onStartLink={startLinkFrom}
        onToggleTheme={setTheme}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar
          terminalCount={nodes.length}
          theme={theme}
          shell={shell}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onShellChange={setShell}
        />

        <Canvas
          nodes={nodes}
          edges={edges}
          selectedIds={selectedIds}
          selectedEdgeId={selectedEdgeId}
          focusedId={focusedId}
          focusRequest={focusRequest}
          linkSource={linkSource}
          tool={tool}
          contextMenuNodeId={ctxMenu?.nodeId ?? null}
          onSelect={selectNode}
          onSelectEdge={selectEdge}
          onSelectMany={(ids) => {
            setSelectedEdgeId(null)
            setSelectedIds(ids)
          }}
          onFocusConsumed={() => setFocusRequest(null)}
          onMoveNode={moveNode}
          onUpdateNode={updateNode}
          onRemoveNode={(id) => {
            setSelectedIds((prev) => prev.filter((p) => p !== id))
            removeNode(id)
            removeStyle(id)
          }}
          onLinkPick={handleLinkPick}
          onSetTool={(t) => {
            setTool(t)
            if (t !== 'link') setLinkSource(null)
          }}
          onNodeContextMenu={(nodeId, x, y) => setCtxMenu({ nodeId, x, y })}
          onCanvasContextMenu={(worldX, worldY, clientX, clientY) =>
            setCanvasMenu({ worldX, worldY, clientX, clientY })
          }
          getTerminalStyle={getStyle}
        />
      </main>

      {modalOpen && (
        <NewTerminalModal
          onCancel={() => {
            setModalOpen(false)
            setPendingCreatePos(null)
          }}
          onConfirm={(folder, command, name) => {
            setModalOpen(false)
            createTerminal(folder, command, name, shell, pendingCreatePos ?? undefined)
            setPendingCreatePos(null)
          }}
        />
      )}

      {ctxMenu && (
        <TerminalContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onLink={() => startLinkFrom(ctxMenu.nodeId)}
          onDelete={() => {
            const id = ctxMenu.nodeId
            setSelectedIds((prev) => prev.filter((p) => p !== id))
            removeNode(id)
            removeStyle(id)
          }}
          onStyle={() => setStyleEditorFor(ctxMenu.nodeId)}
        />
      )}

      {canvasMenu && (
        <CanvasContextMenu
          x={canvasMenu.clientX}
          y={canvasMenu.clientY}
          onClose={() => setCanvasMenu(null)}
          onNewTerminal={() => {
            setPendingCreatePos({ x: canvasMenu.worldX, y: canvasMenu.worldY })
            setModalOpen(true)
            setCanvasMenu(null)
          }}
        />
      )}

      {styleEditorNode && (
        <TerminalStyleModal
          terminalTitle={styleEditorNode.title}
          value={getStyle(styleEditorNode.id)}
          onChange={(patch) => setStyle(styleEditorNode.id, patch)}
          onReset={() => removeStyle(styleEditorNode.id)}
          onClose={() => setStyleEditorFor(null)}
        />
      )}
    </div>
  )
}

function CanvasContextMenu({
  x,
  y,
  onClose,
  onNewTerminal,
}: {
  x: number
  y: number
  onClose: () => void
  onNewTerminal: () => void
}): JSX.Element {
  return (
    <>
      <div
        className="fixed inset-0 z-[100]"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-[101] min-w-[180px] py-1 rounded-[10px]"
        style={{
          left: x,
          top: y,
          background: 'color-mix(in oklch, var(--bg-2) 96%, transparent)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--line)',
          boxShadow: '0 12px 32px -8px rgb(var(--shadow-color) / 0.32)',
          color: 'var(--fg)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          className="ctx-item flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px]"
          onClick={onNewTerminal}
        >
          New terminal here
        </button>
      </div>
    </>
  )
}
