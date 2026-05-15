// Application shell: composes the sidebar, topbar, canvas and modals.
// Holds only view-level UI state — terminal domain logic lives in features.
import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Canvas } from '@renderer/features/canvas/components/Canvas'
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

export default function App(): JSX.Element {
  const { nodes, createTerminal, moveNode, updateNode, removeNode } = useTerminals()
  const { edges, addEdge, removeEdge } = useEdges()
  const { getStyle, setStyle, removeStyle } = useTerminalStyles()
  const [shell, setShell] = useState<ShellType>('default')
  const [theme, setTheme] = useLocalStorage<CanvasTheme>('canvasTheme', 'dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('sidebarCollapsed', false)
  const [modalOpen, setModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<string | null>(null)

  /** Linking mode. When active, clicking a node picks source then target. */
  const [linkingActive, setLinkingActive] = useState(false)
  const [linkSource, setLinkSource] = useState<string | null>(null)

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [styleEditorFor, setStyleEditorFor] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setModalOpen(true)
      }
      if (e.key === 'Escape' && linkingActive) {
        setLinkingActive(false)
        setLinkSource(null)
      }
      if (e.key === 'Delete') {
        // Don't intercept Delete while the user is typing in a field.
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
        if (selectedId) {
          removeNode(selectedId)
          removeStyle(selectedId)
          setSelectedId(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [linkingActive, selectedId, selectedEdgeId, removeEdge, removeNode, removeStyle])

  function requestFocus(id: string): void {
    setFocusedId(id)
    setFocusRequest(id)
    window.setTimeout(() => setFocusedId(null), 850)
  }

  function toggleLinking(): void {
    if (linkingActive) {
      setLinkingActive(false)
      setLinkSource(null)
    } else {
      setLinkingActive(true)
      setLinkSource(null)
    }
  }

  function startLinkFrom(id: string): void {
    setLinkingActive(true)
    setLinkSource(id)
  }

  function handleLinkPick(id: string): void {
    if (!linkSource) {
      setLinkSource(id)
      return
    }
    if (linkSource !== id) addEdge(linkSource, id)
    setLinkingActive(false)
    setLinkSource(null)
  }

  function selectNode(id: string | null): void {
    setSelectedId(id)
    if (id !== null) setSelectedEdgeId(null)
  }

  function selectEdge(id: string | null): void {
    setSelectedEdgeId(id)
    if (id !== null) setSelectedId(null)
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
        onNewTerminal={() => setModalOpen(true)}
        onSelect={selectNode}
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
          selectedId={selectedId}
          selectedEdgeId={selectedEdgeId}
          focusedId={focusedId}
          focusRequest={focusRequest}
          linkSource={linkSource}
          isLinking={linkingActive}
          contextMenuNodeId={ctxMenu?.nodeId ?? null}
          onSelect={selectNode}
          onSelectEdge={selectEdge}
          onFocusConsumed={() => setFocusRequest(null)}
          onMoveNode={moveNode}
          onUpdateNode={updateNode}
          onRemoveNode={(id) => {
            if (selectedId === id) setSelectedId(null)
            removeNode(id)
            removeStyle(id)
          }}
          onLinkPick={handleLinkPick}
          onToggleLinking={toggleLinking}
          onNodeContextMenu={(nodeId, x, y) => setCtxMenu({ nodeId, x, y })}
          getTerminalStyle={getStyle}
        />
      </main>

      {modalOpen && (
        <NewTerminalModal
          onCancel={() => setModalOpen(false)}
          onConfirm={(folder, command, name) => {
            setModalOpen(false)
            createTerminal(folder, command, name, shell)
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
            if (selectedId === id) setSelectedId(null)
            removeNode(id)
            removeStyle(id)
          }}
          onStyle={() => setStyleEditorFor(ctxMenu.nodeId)}
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
