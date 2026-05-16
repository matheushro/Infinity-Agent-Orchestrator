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
}

export const WorkspaceCanvas = forwardRef<WorkspaceCanvasHandle, WorkspaceCanvasProps>(
  function WorkspaceCanvas(
    {
      workspace,
      active,
      shell,
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
    const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes])
    const { edges, addEdge, removeEdge } = useEdges(nodeIds)

    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
    const [focusedId, setFocusedId] = useState<string | null>(null)
    const [focusRequest, setFocusRequest] = useState<string | null>(null)
    const [tool, setTool] = useState<CanvasTool>('select')
    const [linkSource, setLinkSource] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [pendingCreatePos, setPendingCreatePos] = useState<{ x: number; y: number } | null>(
      null,
    )
    const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
    const [canvasMenu, setCanvasMenu] = useState<CanvasMenuState | null>(null)
    const [styleEditorFor, setStyleEditorFor] = useState<string | null>(null)

    const selectedId = selectedIds[0] ?? null

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
            return
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
    }, [active, tool, selectedIds, selectedEdgeId, removeEdge, removeNode, removeTerminalStyle])

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
    }

    // Expose "open modal" to parent via ref so the Sidebar button works.
    useImperativeHandle(ref, () => ({
      openNewTerminalModal() {
        setPendingCreatePos(null)
        setModalOpen(true)
      },
    }))

    const styleEditorNode = styleEditorFor ? nodes.find((n) => n.id === styleEditorFor) : null

    return (
      <div
        style={{
          display: active ? 'flex' : 'none',
          flex: 1,
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
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
            removeTerminalStyle(id)
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
          getTerminalStyle={getTerminalStyle}
        />

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
              removeTerminalStyle(id)
              setCtxMenu(null)
            }}
            onStyle={() => {
              setStyleEditorFor(ctxMenu.nodeId)
              setCtxMenu(null)
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
