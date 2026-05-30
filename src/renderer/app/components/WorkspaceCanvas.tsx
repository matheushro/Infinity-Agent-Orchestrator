// Per-workspace canvas: owns all canvas interaction state (selection, tool, modals)
// and renders the Canvas for a single workspace. Multiple instances are mounted
// simultaneously; only the active one is visible (CSS display) so terminals keep
// their PTY sessions alive across workspace switches.
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import { Canvas, type CanvasTool } from '@renderer/features/canvas/components/Canvas'
import { NewTerminalModal } from '@renderer/features/terminals/components/NewTerminalModal'
import { TerminalContextMenu } from '@renderer/features/terminals/components/TerminalContextMenu'
import { TerminalStyleModal } from '@renderer/features/terminals/components/TerminalStyleModal'
import { useTerminals } from '@renderer/features/terminals/hooks/useTerminals'
import { useCanvasTexts } from '@renderer/features/canvas/hooks/useCanvasTexts'
import { useEdges } from '@renderer/features/canvas/hooks/useEdges'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { ShellType } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import type { WorkspaceRecord } from '@shared/types/workspace'

interface ContextMenuState {
  nodeId: string
  x: number
  y: number
}

interface TextContextMenuState {
  textId: string
  x: number
  y: number
}

interface CanvasMenuState {
  worldX: number
  worldY: number
  clientX: number
  clientY: number
}

interface WorkspaceCanvasProps {
  workspace: WorkspaceRecord
  active: boolean
  shell: ShellType
  defaultProjectFolder: string
  theme: CanvasTheme
  getTerminalStyle: (id: string) => import('@renderer/features/terminals/types').TerminalStyle
  setTerminalStyle: (id: string, patch: Partial<import('@renderer/features/terminals/types').TerminalStyle>) => void
  removeTerminalStyle: (id: string) => void
  /** Called whenever the node list changes so the parent/sidebar can reflect them. */
  onNodesChange: (nodes: TerminalNodeData[]) => void
  /** If set, focus this terminal node after mount / workspace switch. */
  pendingFocusId: string | null
  onFocusConsumed: () => void
}

export interface WorkspaceCanvasHandle {
  openNewTerminalModal: () => void
  deleteTerminal: (id: string) => void
  startLinkFrom: (id: string) => void
  openStyleEditor: (id: string) => void
}

export const WorkspaceCanvas = forwardRef<WorkspaceCanvasHandle, WorkspaceCanvasProps>(
  function WorkspaceCanvas(
    {
      workspace,
      active,
      shell,
      defaultProjectFolder,
      theme,
      getTerminalStyle,
      setTerminalStyle,
      removeTerminalStyle,
      onNodesChange,
      pendingFocusId,
      onFocusConsumed,
    },
    ref,
  ) {
    const { nodes, createTerminal, moveNode, updateNode, removeNode } = useTerminals(
      workspace.id,
    )
    const {
      texts,
      createText,
      moveText,
      updateText,
      removeText,
    } = useCanvasTexts(workspace.id)
    const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes])
    const { edges, addEdge, removeEdge } = useEdges(nodeIds)

    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [selectedTextIds, setSelectedTextIds] = useState<string[]>([])
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
    const [editingTextId, setEditingTextId] = useState<string | null>(null)
    const [focusedId, setFocusedId] = useState<string | null>(null)
    const [focusRequest, setFocusRequest] = useState<string | null>(null)
    const [tool, setTool] = useState<CanvasTool>('select')
    const [linkSource, setLinkSource] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [pendingCreatePos, setPendingCreatePos] = useState<{ x: number; y: number } | null>(
      null,
    )
    const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
    const [textCtxMenu, setTextCtxMenu] = useState<TextContextMenuState | null>(null)
    const [canvasMenu, setCanvasMenu] = useState<CanvasMenuState | null>(null)
    const [styleEditorFor, setStyleEditorFor] = useState<string | null>(null)
    // Per-terminal restart counter; bumping a node's value rebuilds its pty/xterm
    // session from scratch, as if the terminal had just been opened.
    const [restartSignals, setRestartSignals] = useState<Record<string, number>>({})

    const selectedId = selectedIds[0] ?? null

    const restartTerminal = useCallback((id: string): void => {
      setRestartSignals((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
    }, [])

    // Bubble node list up so the parent sidebar can display them.
    useEffect(() => {
      onNodesChange(nodes)
    }, [nodes, onNodesChange])

    // Focus a terminal when requested by sidebar (cross-workspace navigation).
    useEffect(() => {
      if (!active || !pendingFocusId) return
      requestFocus(pendingFocusId)
      onFocusConsumed()
    }, [active, pendingFocusId])

    // Keyboard shortcuts — only fire when this workspace is active.
    useEffect(() => {
      if (!active) return

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
            return
          }
          if (tool === 'text') {
            setTool('select')
          }
        }
        if (e.key === 'Delete') {
          const t = e.target as HTMLElement | null
          const editable =
            t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
          if (editable) return
          if (selectedEdgeId) {
            removeEdge(selectedEdgeId)
            setSelectedEdgeId(null)
          }
          if (selectedTextIds.length > 0) {
            for (const id of selectedTextIds) {
              removeText(id)
            }
            setSelectedTextIds([])
            setEditingTextId(null)
          }
          if (selectedIds.length > 0) {
            for (const id of selectedIds) {
              removeNode(id)
              removeTerminalStyle(id)
            }
            setSelectedIds([])
          }
        }
      }

      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [
      active,
      tool,
      selectedIds,
      selectedEdgeId,
      selectedTextIds,
      removeEdge,
      removeNode,
      removeText,
      removeTerminalStyle,
    ])

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

    const selectNode = useCallback((id: string | null, additive: boolean): void => {
      if (id === null) {
        setSelectedIds([])
        return
      }
      setSelectedEdgeId(null)
      setSelectedTextIds([])
      setSelectedIds((prev) => {
        if (additive) {
          if (prev.includes(id)) return prev.filter((p) => p !== id)
          return [...prev, id]
        }
        if (prev.length === 1 && prev[0] === id) return prev
        return [id]
      })
    }, [])

    function selectEdge(id: string | null): void {
      setSelectedEdgeId(id)
      if (id !== null) setSelectedIds([])
      if (id !== null) setSelectedTextIds([])
    }

    function selectText(id: string | null): void {
      setSelectedTextIds(id ? [id] : [])
      if (id !== null) {
        setSelectedIds([])
        setSelectedEdgeId(null)
      }
    }

    // Expose canvas actions to parent so the Sidebar can trigger them.
    useImperativeHandle(ref, () => ({
      openNewTerminalModal() {
        setPendingCreatePos(null)
        setModalOpen(true)
      },
      deleteTerminal(id: string) {
        setSelectedIds((prev) => prev.filter((p) => p !== id))
        removeNode(id)
        removeTerminalStyle(id)
      },
      startLinkFrom(id: string) {
        setTool('link')
        setLinkSource(id)
      },
      openStyleEditor(id: string) {
        setStyleEditorFor(id)
      },
    }))

    const styleEditorNode = styleEditorFor ? nodes.find((n) => n.id === styleEditorFor) : null

    return (
      <div
        style={{
          // Absolute-inset stack: every workspace mounts simultaneously to keep
          // its PTYs alive, but only the active one is visible. Layering them
          // this way means inactive canvases never participate in flex sizing,
          // which used to cause the active canvas (and its minimap / topbar) to
          // appear shifted when several workspaces were open.
          position: 'absolute',
          inset: 0,
          display: active ? 'flex' : 'none',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <Canvas
          nodes={nodes}
          texts={texts}
          edges={edges}
          selectedIds={selectedIds}
          selectedTextIds={selectedTextIds}
          selectedEdgeId={selectedEdgeId}
          editingTextId={editingTextId}
          focusedId={focusedId}
          focusRequest={focusRequest}
          linkSource={linkSource}
          tool={tool}
          contextMenuNodeId={ctxMenu?.nodeId ?? null}
          onSelect={selectNode}
          onSelectText={selectText}
          onSelectEdge={selectEdge}
          onSelectMany={(ids) => {
            setSelectedEdgeId(null)
            setSelectedTextIds([])
            setSelectedIds(ids)
          }}
          onSelectManyTexts={(ids) => {
            setSelectedEdgeId(null)
            setSelectedIds([])
            setSelectedTextIds(ids)
          }}
          onSelectManyMixed={(nodeIds, textIds) => {
            setSelectedEdgeId(null)
            setSelectedIds(nodeIds)
            setSelectedTextIds(textIds)
          }}
          onCreateText={(position) => {
            const id = createText(position)
            setSelectedIds([])
            setSelectedEdgeId(null)
            setSelectedTextIds([id])
            setEditingTextId(id)
          }}
          onEditText={setEditingTextId}
          onMoveText={moveText}
          onUpdateText={updateText}
          onRemoveText={(id) => {
            removeText(id)
            setSelectedTextIds((prev) => prev.filter((p) => p !== id))
            setEditingTextId((prev) => (prev === id ? null : prev))
          }}
          onFocusConsumed={() => setFocusRequest(null)}
          onMoveNode={moveNode}
          onUpdateNode={updateNode}
          onRemoveNode={(id) => {
            setSelectedIds((prev) => prev.filter((p) => p !== id))
            removeNode(id)
            removeTerminalStyle(id)
          }}
          onLinkPick={handleLinkPick}
          onSetTool={(t) => {
            setTool(t)
            if (t !== 'link') setLinkSource(null)
          }}
          onNodeContextMenu={(nodeId, x, y) => setCtxMenu({ nodeId, x, y })}
          onTextContextMenu={(textId, x, y) => setTextCtxMenu({ textId, x, y })}
          onCanvasContextMenu={(worldX, worldY, clientX, clientY) =>
            setCanvasMenu({ worldX, worldY, clientX, clientY })
          }
          getTerminalStyle={getTerminalStyle}
          getRestartSignal={(id) => restartSignals[id] ?? 0}
          theme={theme}
        />

        {modalOpen && (
          <NewTerminalModal
            defaultFolder={defaultProjectFolder}
            onCancel={() => {
              setModalOpen(false)
              setPendingCreatePos(null)
            }}
            onConfirm={(folder, command, name, theme) => {
              setModalOpen(false)
              const id = createTerminal(
                folder,
                command,
                name,
                shell,
                pendingCreatePos ?? undefined,
              )
              if (theme !== 'auto') setTerminalStyle(id, { theme })
              setPendingCreatePos(null)
            }}
          />
        )}

        {ctxMenu && (
          <TerminalContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
            onRestart={() => {
              restartTerminal(ctxMenu.nodeId)
              setCtxMenu(null)
            }}
            onLink={() => startLinkFrom(ctxMenu.nodeId)}
            onDelete={() => {
              const id = ctxMenu.nodeId
              setSelectedIds((prev) => prev.filter((p) => p !== id))
              removeNode(id)
              removeTerminalStyle(id)
              setCtxMenu(null)
            }}
            onStyle={() => {
              setStyleEditorFor(ctxMenu.nodeId)
              setCtxMenu(null)
            }}
          />
        )}

        {textCtxMenu && (
          <TextContextMenu
            x={textCtxMenu.x}
            y={textCtxMenu.y}
            onClose={() => setTextCtxMenu(null)}
            onDelete={() => {
              const id = textCtxMenu.textId
              removeText(id)
              setSelectedTextIds((prev) => prev.filter((p) => p !== id))
              setEditingTextId((prev) => (prev === id ? null : prev))
              setTextCtxMenu(null)
            }}
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
            value={getTerminalStyle(styleEditorNode.id)}
            onChange={(patch) => setTerminalStyle(styleEditorNode.id, patch)}
            onReset={() => removeTerminalStyle(styleEditorNode.id)}
            onClose={() => setStyleEditorFor(null)}
          />
        )}
      </div>
    )
  },
)

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

function TextContextMenu({
  x,
  y,
  onClose,
  onDelete,
}: {
  x: number
  y: number
  onClose: () => void
  onDelete: () => void
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
          onClick={onDelete}
        >
          Delete text
        </button>
      </div>
    </>
  )
}
