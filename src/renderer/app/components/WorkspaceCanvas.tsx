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
import { useNotes } from '@renderer/features/notes/hooks/useNotes'
import { useNoteLinks } from '@renderer/features/notes/hooks/useNoteLinks'
import { useEdges } from '@renderer/features/canvas/hooks/useEdges'
import { ITrash } from '@renderer/components/ui'
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

interface NoteContextMenuState {
  noteId: string
  x: number
  y: number
}

interface EdgeContextMenuState {
  edgeId: string
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
  onTerminalSelected: (terminalId: string | null) => void
}

export interface WorkspaceCanvasHandle {
  openNewTerminalModal: () => void
  duplicateTerminal: (id: string) => void
  deleteTerminal: (id: string) => void
  toggleTerminalEnabled: (id: string) => void
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
      onTerminalSelected,
    },
    ref,
  ) {
    const {
      nodes,
      createTerminal,
      duplicateTerminal,
      moveNode,
      updateNode,
      setNodeEnabled,
      removeNode,
    } = useTerminals(workspace.id)
    const {
      texts,
      createText,
      moveText,
      updateText,
      removeText,
    } = useCanvasTexts(workspace.id)
    const {
      notes,
      createNote,
      moveNote,
      updateNote,
      removeNote,
    } = useNotes(workspace.id)
    const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes])
    const noteIds = useMemo(() => notes.map((n) => n.id), [notes])
    const { edges, addEdge, removeEdge } = useEdges(nodeIds)
    const { noteLinks, addNoteLink, removeNoteLink } = useNoteLinks(nodeIds, noteIds)

    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [selectedTextIds, setSelectedTextIds] = useState<string[]>([])
    const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
    const [editingTextId, setEditingTextId] = useState<string | null>(null)
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
    const [searchingNoteId, setSearchingNoteId] = useState<string | null>(null)
    const [noteSearchRequestId, setNoteSearchRequestId] = useState(0)
    const [focusedId, setFocusedId] = useState<string | null>(null)
    const [focusRequest, setFocusRequest] = useState<string | null>(null)
    const [tool, setTool] = useState<CanvasTool>('select')
    const [linkSource, setLinkSource] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [pendingCreatePos, setPendingCreatePos] = useState<{
      x: number
      y: number
      width?: number
      height?: number
    } | null>(null)
    const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
    const [textCtxMenu, setTextCtxMenu] = useState<TextContextMenuState | null>(null)
    const [noteCtxMenu, setNoteCtxMenu] = useState<NoteContextMenuState | null>(null)
    const [edgeCtxMenu, setEdgeCtxMenu] = useState<EdgeContextMenuState | null>(null)
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
        if (
          (e.metaKey || e.ctrlKey) &&
          e.key.toLowerCase() === 'f' &&
          selectedNoteIds.length === 1
        ) {
          e.preventDefault()
          setSearchingNoteId(selectedNoteIds[0])
          setNoteSearchRequestId((requestId) => requestId + 1)
        }
        if (e.key === 'Escape') {
          if (tool === 'link' || tool === 'delete') {
            setTool('select')
            setLinkSource(null)
            return
          }
          if (
            tool === 'text' ||
            tool === 'note' ||
            tool === 'draw-terminal' ||
            tool === 'draw-note'
          ) {
            setTool('select')
          }
        }
        if (e.key === 'Delete') {
          const t = e.target as HTMLElement | null
          const editable =
            t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
          if (editable) return
          if (selectedEdgeId) {
            // selectedEdgeId may point at a terminal↔terminal edge or a
            // note↔terminal link; both render in the same SVG layer. Attempt
            // both removals — the non-matching one is a no-op.
            removeEdge(selectedEdgeId)
            removeNoteLink(selectedEdgeId)
            setSelectedEdgeId(null)
          }
          if (selectedTextIds.length > 0) {
            for (const id of selectedTextIds) {
              removeText(id)
            }
            setSelectedTextIds([])
            setEditingTextId(null)
          }
          if (selectedNoteIds.length > 0) {
            for (const id of selectedNoteIds) {
              removeNote(id)
            }
            setSelectedNoteIds([])
            setEditingNoteId(null)
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
      selectedNoteIds,
      removeEdge,
      removeNoteLink,
      removeNode,
      removeText,
      removeNote,
      removeTerminalStyle,
    ])

    useEffect(() => {
      if (searchingNoteId && !selectedNoteIds.includes(searchingNoteId)) {
        setSearchingNoteId(null)
      }
    }, [searchingNoteId, selectedNoteIds])

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
      if (linkSource !== id) {
        const sourceIsNote = noteIds.includes(linkSource)
        const targetIsNote = noteIds.includes(id)
        if (sourceIsNote && !targetIsNote) addNoteLink(linkSource, id)
        else if (!sourceIsNote && targetIsNote) addNoteLink(id, linkSource)
        else if (!sourceIsNote && !targetIsNote) addEdge(linkSource, id)
        // note↔note has no meaning — silently ignored.
      }
      setTool('select')
      setLinkSource(null)
    }

    const selectNode = useCallback((id: string | null, additive: boolean): void => {
      onTerminalSelected(id)
      if (id === null) {
        setSelectedIds([])
        return
      }
      setSelectedEdgeId(null)
      setSelectedTextIds([])
      setSelectedNoteIds([])
      setSelectedIds((prev) => {
        if (additive) {
          if (prev.includes(id)) return prev.filter((p) => p !== id)
          return [...prev, id]
        }
        if (prev.length === 1 && prev[0] === id) return prev
        return [id]
      })
    }, [onTerminalSelected])

    function selectEdge(id: string | null): void {
      setSelectedEdgeId(id)
      if (id !== null) {
        setSelectedIds([])
        setSelectedTextIds([])
        setSelectedNoteIds([])
      }
    }

    function deleteEdge(id: string): void {
      // A selected SVG link may be either a terminal↔terminal edge or a
      // note↔terminal access link. The non-matching removal is a no-op.
      removeEdge(id)
      removeNoteLink(id)
      setSelectedEdgeId((prev) => (prev === id ? null : prev))
    }

    function selectText(id: string | null): void {
      setSelectedTextIds(id ? [id] : [])
      if (id !== null) {
        setSelectedIds([])
        setSelectedEdgeId(null)
        setSelectedNoteIds([])
      }
    }

    function selectNote(id: string | null): void {
      setSelectedNoteIds(id ? [id] : [])
      if (id !== null) {
        setSelectedIds([])
        setSelectedEdgeId(null)
        setSelectedTextIds([])
      }
    }

    // Expose canvas actions to parent so the Sidebar can trigger them.
    useImperativeHandle(ref, () => ({
      openNewTerminalModal() {
        setPendingCreatePos(null)
        setModalOpen(true)
      },
      duplicateTerminal(id: string) {
        const duplicateId = duplicateTerminal(id)
        if (duplicateId) setTerminalStyle(duplicateId, getTerminalStyle(id))
      },
      deleteTerminal(id: string) {
        setSelectedIds((prev) => prev.filter((p) => p !== id))
        removeNode(id)
        removeTerminalStyle(id)
      },
      toggleTerminalEnabled(id: string) {
        const node = nodes.find((n) => n.id === id)
        if (node) setNodeEnabled(id, node.enabled === false)
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
          notes={notes}
          edges={edges}
          noteLinks={noteLinks}
          selectedIds={selectedIds}
          selectedTextIds={selectedTextIds}
          selectedNoteIds={selectedNoteIds}
          selectedEdgeId={selectedEdgeId}
          editingTextId={editingTextId}
          editingNoteId={editingNoteId}
          searchingNoteId={searchingNoteId}
          noteSearchRequestId={noteSearchRequestId}
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
            setSelectedNoteIds([])
            setSelectedIds(ids)
          }}
          onSelectManyTexts={(ids) => {
            setSelectedEdgeId(null)
            setSelectedIds([])
            setSelectedNoteIds([])
            setSelectedTextIds(ids)
          }}
          onSelectManyMixed={(nodeIds, textIds) => {
            setSelectedEdgeId(null)
            setSelectedNoteIds([])
            setSelectedIds(nodeIds)
            setSelectedTextIds(textIds)
          }}
          onCreateText={(position) => {
            const id = createText(position)
            setSelectedIds([])
            setSelectedEdgeId(null)
            setSelectedNoteIds([])
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
          onSelectNote={selectNote}
          onCreateNote={(position) => {
            const id = createNote(position)
            setSelectedIds([])
            setSelectedEdgeId(null)
            setSelectedTextIds([])
            setSelectedNoteIds([id])
            setEditingNoteId(id)
          }}
          onDrawCreate={(type, rect) => {
            if (type === 'terminal') {
              // Defer creation to the modal; carry the drawn footprint through.
              setPendingCreatePos(rect)
              setModalOpen(true)
              return
            }
            // Notes have no creation modal — create immediately at the drawn rect
            // and drop straight into edit mode, matching click-to-create notes.
            const id = createNote(
              { x: rect.x, y: rect.y },
              { width: rect.width, height: rect.height },
            )
            setSelectedIds([])
            setSelectedEdgeId(null)
            setSelectedTextIds([])
            setSelectedNoteIds([id])
            setEditingNoteId(id)
          }}
          onEditNote={setEditingNoteId}
          onMoveNote={moveNote}
          onUpdateNote={updateNote}
          onRemoveNote={(id) => {
            removeNote(id)
            setSelectedNoteIds((prev) => prev.filter((p) => p !== id))
            setEditingNoteId((prev) => (prev === id ? null : prev))
          }}
          onNoteContextMenu={(noteId, x, y) => setNoteCtxMenu({ noteId, x, y })}
          onNoteSearchClose={() => setSearchingNoteId(null)}
          onFocusConsumed={() => setFocusRequest(null)}
          onMoveNode={moveNode}
          onUpdateNode={updateNode}
          onRemoveNode={(id) => {
            setSelectedIds((prev) => prev.filter((p) => p !== id))
            removeNode(id)
            removeTerminalStyle(id)
          }}
          onDeleteEdge={deleteEdge}
          onLinkPick={handleLinkPick}
          onSetTool={(t) => {
            setTool(t)
            if (t !== 'link') setLinkSource(null)
          }}
          onNodeContextMenu={(nodeId, x, y) => setCtxMenu({ nodeId, x, y })}
          onTextContextMenu={(textId, x, y) => setTextCtxMenu({ textId, x, y })}
          onEdgeContextMenu={(edgeId, x, y) => setEdgeCtxMenu({ edgeId, x, y })}
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
            enabled={nodes.find((n) => n.id === ctxMenu.nodeId)?.enabled !== false}
            onClose={() => setCtxMenu(null)}
            onRestart={() => {
              restartTerminal(ctxMenu.nodeId)
              setCtxMenu(null)
            }}
            onToggleEnabled={() => {
              const node = nodes.find((n) => n.id === ctxMenu.nodeId)
              if (node) setNodeEnabled(node.id, node.enabled === false)
              setCtxMenu(null)
            }}
            onDuplicate={() => {
              const duplicateId = duplicateTerminal(ctxMenu.nodeId)
              if (duplicateId) {
                setTerminalStyle(duplicateId, getTerminalStyle(ctxMenu.nodeId))
                setSelectedIds([duplicateId])
                onTerminalSelected(duplicateId)
              }
              setCtxMenu(null)
            }}
            onLink={() => startLinkFrom(ctxMenu.nodeId)}
            onOpenInVSCode={() => {
              const node = nodes.find((n) => n.id === ctxMenu.nodeId)
              if (node) window.windowApi.openInVSCode(node.cwd)
              setCtxMenu(null)
            }}
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

        {noteCtxMenu && (
          <NoteContextMenu
            x={noteCtxMenu.x}
            y={noteCtxMenu.y}
            onClose={() => setNoteCtxMenu(null)}
            onEdit={() => {
              setEditingNoteId(noteCtxMenu.noteId)
              setNoteCtxMenu(null)
            }}
            onLink={() => {
              startLinkFrom(noteCtxMenu.noteId)
              setNoteCtxMenu(null)
            }}
            onDelete={() => {
              const id = noteCtxMenu.noteId
              removeNote(id)
              setSelectedNoteIds((prev) => prev.filter((p) => p !== id))
              setEditingNoteId((prev) => (prev === id ? null : prev))
              setNoteCtxMenu(null)
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
            onNewNote={() => {
              const id = createNote({ x: canvasMenu.worldX, y: canvasMenu.worldY })
              setSelectedIds([])
              setSelectedEdgeId(null)
              setSelectedTextIds([])
              setSelectedNoteIds([id])
              setEditingNoteId(id)
              setCanvasMenu(null)
            }}
          />
        )}

        {edgeCtxMenu && (
          <EdgeContextMenu
            x={edgeCtxMenu.x}
            y={edgeCtxMenu.y}
            onClose={() => setEdgeCtxMenu(null)}
            onDelete={() => {
              deleteEdge(edgeCtxMenu.edgeId)
              setEdgeCtxMenu(null)
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

function EdgeContextMenu({
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
          style={{ color: 'oklch(0.68 0.18 25)' }}
          onClick={onDelete}
        >
          <span
            className="inline-flex items-center justify-center"
            style={{ width: 18, height: 18 }}
          >
            <ITrash size={13} />
          </span>
          Delete link
        </button>
      </div>
    </>
  )
}

function CanvasContextMenu({
  x,
  y,
  onClose,
  onNewTerminal,
  onNewNote,
}: {
  x: number
  y: number
  onClose: () => void
  onNewTerminal: () => void
  onNewNote: () => void
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
        <button
          className="ctx-item flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px]"
          onClick={onNewNote}
        >
          New note here
        </button>
      </div>
    </>
  )
}

function NoteContextMenu({
  x,
  y,
  onClose,
  onEdit,
  onLink,
  onDelete,
}: {
  x: number
  y: number
  onClose: () => void
  onEdit: () => void
  onLink: () => void
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
          onClick={onEdit}
        >
          Edit note
        </button>
        <button
          className="ctx-item flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px]"
          onClick={onLink}
        >
          Link to terminal
        </button>
        <button
          className="ctx-item flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px]"
          onClick={onDelete}
        >
          Delete note
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
