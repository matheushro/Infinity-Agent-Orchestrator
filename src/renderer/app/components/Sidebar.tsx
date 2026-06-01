// Left rail: workspace list (accordion), terminal list per workspace with PTY
// activity indicators, new workspace button, theme toggle.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { WorkspaceRecord } from '@shared/types/workspace'
import { usePtyActivity, type PtyStatus } from '@renderer/features/workspaces/context/PtyActivityContext'
import { TerminalContextMenu } from '@renderer/features/terminals/components/TerminalContextMenu'
import { terminalRepository } from '@renderer/features/terminals/services/terminalRepository'
import {
  IChevDown,
  IChevRight,
  IClose,
  IGear,
  IPlus,
  ISidebarClose,
  ISidebarOpen,
} from '@renderer/components/ui'

interface SidebarProps {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string
  nodesByWorkspace: Record<string, TerminalNodeData[]>
  selectedTerminalId: string | null
  collapsed: boolean
  onCollapsedChange: (next: boolean) => void
  onNewTerminal: () => void
  onCreateWorkspace: (name: string) => void
  onRenameWorkspace: (id: string, name: string) => void
  onDeleteWorkspace: (id: string) => void
  onDuplicateWorkspace: (id: string) => void
  onReorderWorkspaces: (orderedIds: string[]) => void
  onSwitchWorkspace: (workspaceId: string) => void
  onSelectTerminal: (workspaceId: string, terminalId: string) => void
  onOpenSettings: () => void
  onTerminalDelete: (workspaceId: string, terminalId: string) => void
  onTerminalLink: (workspaceId: string, terminalId: string) => void
  onTerminalStyle: (workspaceId: string, terminalId: string) => void
}

interface SidebarStateProps extends SidebarProps {
  terminalOrderByWorkspace: Record<string, string[]>
  onReorderTerminals: (workspaceId: string, orderedIds: string[]) => void
}

const STATUS_COLOR: Record<PtyStatus, string> = {
  idle: '#22c55e',
  busy: '#eab308',
  offline: '#6b7280',
}

const STATUS_SHADOW: Record<PtyStatus, string> = {
  idle: '0 0 5px #22c55e88',
  busy: '0 0 5px #eab30888',
  offline: 'none',
}

const STATUS_LABEL: Record<PtyStatus, string> = {
  idle: 'Available',
  busy: 'Working',
  offline: 'Offline',
}

function terminalGlyph(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return 'T'
  return trimmed[0].toUpperCase()
}

function orderTerminalNodes(
  nodes: TerminalNodeData[],
  orderedIds: string[] | undefined,
): TerminalNodeData[] {
  if (!orderedIds?.length) return nodes

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ordered = orderedIds.flatMap((id) => {
    const node = byId.get(id)
    return node ? [node] : []
  })
  const remaining = nodes.filter((node) => !orderedIds.includes(node.id))
  return [...ordered, ...remaining]
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const [terminalOrderByWorkspace, setTerminalOrderByWorkspace] = useState<Record<string, string[]>>(
    {},
  )

  const onReorderTerminals = useCallback((workspaceId: string, orderedIds: string[]): void => {
    setTerminalOrderByWorkspace((prev) => ({ ...prev, [workspaceId]: orderedIds }))
    terminalRepository.reorder(workspaceId, orderedIds)
  }, [])

  const stateProps: SidebarStateProps = {
    ...props,
    terminalOrderByWorkspace,
    onReorderTerminals,
  }

  return props.collapsed ? <CollapsedRail {...stateProps} /> : <ExpandedSidebar {...stateProps} />
}

// ── Collapsed rail ─────────────────────────────────────────────────────────

function CollapsedRail({
  workspaces,
  activeWorkspaceId,
  nodesByWorkspace,
  terminalOrderByWorkspace,
  selectedTerminalId,
  onCollapsedChange,
  onSelectTerminal,
  onSwitchWorkspace,
  onNewTerminal,
}: SidebarStateProps): JSX.Element {
  const { getStatus } = usePtyActivity()
  const allNodes = workspaces.flatMap((w) =>
    orderTerminalNodes(nodesByWorkspace[w.id] ?? [], terminalOrderByWorkspace[w.id]),
  )

  return (
    <aside
      className="flex h-full flex-col items-center gap-1 py-2"
      style={{
        width: 44,
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--line)',
        flexShrink: 0,
        cursor: 'pointer',
      }}
      onClick={() => onCollapsedChange(false)}
    >
      <button
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation()
          onCollapsedChange(false)
        }}
        title="Open sidebar"
      >
        <ISidebarOpen size={15} />
      </button>
      <button
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation()
          onNewTerminal()
        }}
        title="New terminal"
      >
        <IPlus size={14} stroke={2} />
      </button>
      <div className="w-6 h-px my-1" style={{ background: 'var(--line)' }} />
      <div className="flex-1 w-full overflow-y-auto nice-scroll flex flex-col items-center gap-1.5 pt-1">
        {allNodes.map((t) => {
          const active = selectedTerminalId === t.id
          const ptyStatus = getStatus(t.id)
          return (
            <button
              key={t.id}
              onClick={(e) => {
                e.stopPropagation()
                onSwitchWorkspace(t.workspace_id)
                onSelectTerminal(t.workspace_id, t.id)
              }}
              className="relative flex items-center justify-center text-[10.5px] font-semibold transition-colors"
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: active
                  ? 'color-mix(in oklch, var(--accent) 18%, transparent)'
                  : t.workspace_id !== activeWorkspaceId
                    ? 'color-mix(in oklch, var(--fg) 3%, transparent)'
                    : 'color-mix(in oklch, var(--fg) 6%, transparent)',
                color: active ? 'var(--fg)' : 'var(--fg-2)',
                border: active ? '1px solid var(--accent)' : '1px solid var(--line-2)',
              }}
              title={`${t.title} · ${t.cwd} — ${STATUS_LABEL[ptyStatus]}`}
            >
              {terminalGlyph(t.title)}
              <span
                className="absolute"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: STATUS_COLOR[ptyStatus],
                  bottom: 2,
                  right: 2,
                  boxShadow: STATUS_SHADOW[ptyStatus],
                  transition: 'background 0.3s, box-shadow 0.3s',
                }}
              />
            </button>
          )
        })}
      </div>
    </aside>
  )
}

// ── Expanded sidebar ────────────────────────────────────────────────────────

interface TerminalCtxMenu {
  terminal: TerminalNodeData
  x: number
  y: number
}

interface WorkspaceCtxMenu {
  workspaceId: string
  x: number
  y: number
}

interface DragState {
  id: string
  name: string
  // Pointer position in viewport coords (for the floating preview).
  pointerX: number
  pointerY: number
  // Insert position in the workspace list (0..workspaces.length).
  dropIndex: number
}

interface TerminalDragState {
  workspaceId: string
  id: string
  name: string
  pointerX: number
  pointerY: number
  dropIndex: number
}

function ExpandedSidebar({
  workspaces,
  activeWorkspaceId,
  nodesByWorkspace,
  selectedTerminalId,
  onCollapsedChange,
  onNewTerminal,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onDuplicateWorkspace,
  onReorderWorkspaces,
  onReorderTerminals,
  onSwitchWorkspace,
  onSelectTerminal,
  onOpenSettings,
  onTerminalDelete,
  onTerminalLink,
  onTerminalStyle,
  terminalOrderByWorkspace,
}: SidebarStateProps): JSX.Element {
  const { getStatus } = usePtyActivity()
  const [newWsMode, setNewWsMode] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [openWorkspaces, setOpenWorkspaces] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(workspaces.map((w) => [w.id, true])),
  )
  const [termCtxMenu, setTermCtxMenu] = useState<TerminalCtxMenu | null>(null)
  const [wsCtxMenu, setWsCtxMenu] = useState<WorkspaceCtxMenu | null>(null)
  // id of the workspace whose name is being inline-edited
  const [renamingWsId, setRenamingWsId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [terminalDrag, setTerminalDrag] = useState<TerminalDragState | null>(null)
  const wsRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const terminalRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const wsListRef = useRef<HTMLDivElement>(null)

  // Compute the drop index given the cursor's viewport Y by inspecting each
  // workspace row's bounding rect. The index is the insertion slot in the
  // current `workspaces` order (0..len).
  const computeDropIndex = useCallback(
    (clientY: number): number => {
      for (let i = 0; i < workspaces.length; i++) {
        const el = wsRowRefs.current.get(workspaces[i].id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) return i
      }
      return workspaces.length
    },
    [workspaces],
  )

  const computeTerminalDropIndex = useCallback(
    (workspaceId: string, nodes: TerminalNodeData[], clientY: number): number => {
      for (let i = 0; i < nodes.length; i++) {
        const el = terminalRowRefs.current.get(nodes[i].id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) return i
      }
      return nodes.length
    },
    [],
  )

  function startWorkspaceDrag(ws: WorkspaceRecord, e: React.PointerEvent): void {
    // Use only the primary button; ignore right-click etc.
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    let active = false

    function onMove(ev: PointerEvent): void {
      if (!active) {
        // Activate after a small threshold so single clicks still work.
        if (Math.abs(ev.clientY - startY) < 4 && Math.abs(ev.clientX - startX) < 4) return
        active = true
      }
      setDrag({
        id: ws.id,
        name: ws.name,
        pointerX: ev.clientX,
        pointerY: ev.clientY,
        dropIndex: computeDropIndex(ev.clientY),
      })
    }

    function onUp(ev: PointerEvent): void {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!active) {
        setDrag(null)
        return
      }
      const dropIndex = computeDropIndex(ev.clientY)
      const fromIndex = workspaces.findIndex((w) => w.id === ws.id)
      setDrag(null)
      if (fromIndex < 0 || dropIndex === fromIndex || dropIndex === fromIndex + 1) return
      const next = workspaces.map((w) => w.id)
      next.splice(fromIndex, 1)
      next.splice(dropIndex > fromIndex ? dropIndex - 1 : dropIndex, 0, ws.id)
      onReorderWorkspaces(next)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startTerminalDrag(
    workspaceId: string,
    terminal: TerminalNodeData,
    orderedNodes: TerminalNodeData[],
    e: React.PointerEvent,
  ): void {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    let active = false

    function onMove(ev: PointerEvent): void {
      if (!active) {
        if (Math.abs(ev.clientY - startY) < 4 && Math.abs(ev.clientX - startX) < 4) return
        active = true
      }
      setTerminalDrag({
        workspaceId,
        id: terminal.id,
        name: terminal.title,
        pointerX: ev.clientX,
        pointerY: ev.clientY,
        dropIndex: computeTerminalDropIndex(workspaceId, orderedNodes, ev.clientY),
      })
    }

    function onUp(ev: PointerEvent): void {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!active) {
        setTerminalDrag(null)
        return
      }
      const dropIndex = computeTerminalDropIndex(workspaceId, orderedNodes, ev.clientY)
      const fromIndex = orderedNodes.findIndex((n) => n.id === terminal.id)
      setTerminalDrag(null)
      if (fromIndex < 0 || dropIndex === fromIndex || dropIndex === fromIndex + 1) return
      const next = orderedNodes.map((n) => n.id)
      next.splice(fromIndex, 1)
      next.splice(dropIndex > fromIndex ? dropIndex - 1 : dropIndex, 0, terminal.id)
      onReorderTerminals(workspaceId, next)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function toggleWorkspace(id: string): void {
    setOpenWorkspaces((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleCreateWorkspace(): void {
    const name = newWsName.trim()
    if (!name) return
    onCreateWorkspace(name)
    setNewWsName('')
    setNewWsMode(false)
  }

  const totalTerminals = workspaces.reduce(
    (sum, w) => sum + (nodesByWorkspace[w.id]?.length ?? 0),
    0,
  )

  return (
    <aside
      className="flex h-full flex-col"
      style={{
        width: 260,
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--line)',
        flexShrink: 0,
      }}
    >
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 w-full">
        <span className="logo-mark" aria-hidden />
        <div className="flex flex-col leading-none">
          <span
            className="text-[14px] font-semibold tracking-[-0.01em]"
            style={{ color: 'var(--fg)' }}
          >
            IAO
          </span>
          <span className="text-[10.5px] mt-0.5" style={{ color: 'var(--fg-3)' }}>
            {totalTerminals} terminal{totalTerminals !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            className="icon-btn"
            onClick={() => onCollapsedChange(true)}
            title="Collapse sidebar"
          >
            <ISidebarClose size={15} />
          </button>
        </div>
      </div>

      {/* New terminal */}
      <div className="px-3 pb-3">
        <button
          className="new-term-btn w-full flex items-center justify-center gap-2"
          onClick={onNewTerminal}
        >
          <IPlus size={14} stroke={2} />
          <span>New terminal</span>
          <span className="ml-1 font-mono text-[10.5px]" style={{ opacity: 0.55 }}>
            ⌘ N
          </span>
        </button>
      </div>

      {/* Workspace label */}
      <div className="px-4 pt-1 pb-1.5 flex items-center justify-between">
        <span
          className="text-[10.5px] uppercase tracking-[0.08em]"
          style={{ color: 'var(--fg-3)', fontWeight: 500 }}
        >
          Workspaces
        </span>
        <span className="chip">{workspaces.length}/5</span>
      </div>

      {/* Workspace list */}
      <div ref={wsListRef} className="flex-1 overflow-y-auto nice-scroll px-2 pb-2">
        {workspaces.map((ws, idx) => {
          const nodes = orderTerminalNodes(
            nodesByWorkspace[ws.id] ?? [],
            terminalOrderByWorkspace[ws.id],
          )
          const isActiveWs = ws.id === activeWorkspaceId
          const isOpen = openWorkspaces[ws.id] !== false
          const isDragging = drag?.id === ws.id

          return (
            <div key={ws.id}>
              {drag && drag.id !== ws.id && drag.dropIndex === idx && <DropIndicator />}
              <div
                ref={(el) => {
                  if (el) wsRowRefs.current.set(ws.id, el)
                  else wsRowRefs.current.delete(ws.id)
                }}
                style={{
                  opacity: isDragging ? 0.35 : 1,
                  transition: 'opacity 120ms ease',
                }}
              >
                <WorkspaceSection
                  workspace={ws}
                  nodes={nodes}
                  isActiveWs={isActiveWs}
                  isOpen={isOpen}
                  selectedTerminalId={selectedTerminalId}
                  isRenaming={renamingWsId === ws.id}
                  onToggle={() => toggleWorkspace(ws.id)}
                  onSwitchWorkspace={onSwitchWorkspace}
                  onSelectTerminal={onSelectTerminal}
                  onRename={(name) => {
                    onRenameWorkspace(ws.id, name)
                    setRenamingWsId(null)
                  }}
                  onStartRename={() => setRenamingWsId(ws.id)}
                  onCancelRename={() => setRenamingWsId(null)}
                  onWorkspaceContextMenu={(x, y) => setWsCtxMenu({ workspaceId: ws.id, x, y })}
                  onTerminalContextMenu={(terminal, x, y) => setTermCtxMenu({ terminal, x, y })}
                  onDragHandlePointerDown={(e) => startWorkspaceDrag(ws, e)}
                  onTerminalDragHandlePointerDown={(terminal, e) =>
                    startTerminalDrag(ws.id, terminal, nodes, e)
                  }
                  terminalDrag={terminalDrag?.workspaceId === ws.id ? terminalDrag : null}
                  terminalRowRefs={terminalRowRefs}
                  getStatus={getStatus}
                />
              </div>
            </div>
          )
        })}
        {drag && drag.dropIndex === workspaces.length && <DropIndicator />}

        {/* New workspace button / form */}
        {workspaces.length < 5 && (
          <div className="mt-2 px-1">
            {newWsMode ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateWorkspace()
                    if (e.key === 'Escape') {
                      setNewWsMode(false)
                      setNewWsName('')
                    }
                  }}
                  placeholder="Workspace name…"
                  className="bg-transparent outline-none text-[12px] flex-1 min-w-0 px-2 h-7 rounded-[6px]"
                  style={{
                    border: '1px solid var(--accent)',
                    color: 'var(--fg)',
                    background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
                  }}
                />
                <button
                  className="icon-btn !w-6 !h-6"
                  onClick={handleCreateWorkspace}
                  title="Confirm"
                >
                  <IPlus size={12} stroke={2} />
                </button>
                <button
                  className="icon-btn !w-6 !h-6"
                  onClick={() => {
                    setNewWsMode(false)
                    setNewWsName('')
                  }}
                  title="Cancel"
                >
                  <IClose size={11} />
                </button>
              </div>
            ) : (
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[7px] text-[12px] transition-colors"
                style={{ color: 'var(--fg-3)' }}
                onClick={() => setNewWsMode(true)}
              >
                <IPlus size={12} stroke={2} />
                New workspace
              </button>
            )}
          </div>
        )}
      </div>

      {/* Settings footer */}
      <div
        className="px-3 py-2.5 flex items-center"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <button
          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-[7px] text-[12px] transition-colors"
          style={{ color: 'var(--fg-2)' }}
          onClick={onOpenSettings}
          title="Open settings"
        >
          <IGear size={13} />
          <span>Settings</span>
        </button>
      </div>

      {/* Terminal right-click menu */}
      {termCtxMenu && (
        <TerminalContextMenu
          x={termCtxMenu.x}
          y={termCtxMenu.y}
          onClose={() => setTermCtxMenu(null)}
          onLink={() => {
            onTerminalLink(termCtxMenu.terminal.workspace_id, termCtxMenu.terminal.id)
            setTermCtxMenu(null)
          }}
          onDelete={() => {
            onTerminalDelete(termCtxMenu.terminal.workspace_id, termCtxMenu.terminal.id)
            setTermCtxMenu(null)
          }}
          onStyle={() => {
            onTerminalStyle(termCtxMenu.terminal.workspace_id, termCtxMenu.terminal.id)
            setTermCtxMenu(null)
          }}
        />
      )}

      {/* Drag preview floating with the cursor */}
      {drag && <DragPreview name={drag.name} x={drag.pointerX} y={drag.pointerY} />}
      {terminalDrag && (
        <DragPreview name={terminalDrag.name} x={terminalDrag.pointerX} y={terminalDrag.pointerY} />
      )}

      {/* Workspace right-click menu */}
      {wsCtxMenu && (
        <WorkspaceContextMenu
          x={wsCtxMenu.x}
          y={wsCtxMenu.y}
          canDuplicate={workspaces.length < 5}
          onClose={() => setWsCtxMenu(null)}
          onRename={() => {
            setRenamingWsId(wsCtxMenu.workspaceId)
            setWsCtxMenu(null)
          }}
          onDelete={() => {
            onDeleteWorkspace(wsCtxMenu.workspaceId)
            setWsCtxMenu(null)
          }}
          onDuplicate={() => {
            onDuplicateWorkspace(wsCtxMenu.workspaceId)
            setWsCtxMenu(null)
          }}
        />
      )}
    </aside>
  )
}

// ── Workspace section (accordion item) ─────────────────────────────────────

function WorkspaceSection({
  workspace,
  nodes,
  isActiveWs,
  isOpen,
  isRenaming,
  selectedTerminalId,
  onToggle,
  onSwitchWorkspace,
  onSelectTerminal,
  onRename,
  onStartRename,
  onCancelRename,
  onWorkspaceContextMenu,
  onTerminalContextMenu,
  onDragHandlePointerDown,
  onTerminalDragHandlePointerDown,
  terminalDrag,
  terminalRowRefs,
  getStatus,
}: {
  workspace: WorkspaceRecord
  nodes: TerminalNodeData[]
  isActiveWs: boolean
  isOpen: boolean
  isRenaming: boolean
  selectedTerminalId: string | null
  onToggle: () => void
  onSwitchWorkspace: (id: string) => void
  onSelectTerminal: (wsId: string, terminalId: string) => void
  onRename: (name: string) => void
  onStartRename: () => void
  onCancelRename: () => void
  onWorkspaceContextMenu: (x: number, y: number) => void
  onTerminalContextMenu: (terminal: TerminalNodeData, x: number, y: number) => void
  onDragHandlePointerDown: (e: React.PointerEvent) => void
  onTerminalDragHandlePointerDown: (terminal: TerminalNodeData, e: React.PointerEvent) => void
  terminalDrag: TerminalDragState | null
  terminalRowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  getStatus: (nodeId: string) => PtyStatus
}): JSX.Element {
  const anyBusy = nodes.some((n) => getStatus(n.id) === 'busy')
  const anyIdle = nodes.some((n) => getStatus(n.id) === 'idle')
  const wsDotStatus: PtyStatus | null = anyBusy ? 'busy' : anyIdle ? 'idle' : null
  const [renameValue, setRenameValue] = useState(workspace.name)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Keep the rename input value in sync if isRenaming activates
  useEffect(() => {
    if (isRenaming) {
      setRenameValue(workspace.name)
      // Focus on next tick so the input is mounted
      setTimeout(() => renameInputRef.current?.select(), 0)
    }
  }, [isRenaming, workspace.name])

  function commitRename(): void {
    const trimmed = renameValue.trim()
    if (trimmed) onRename(trimmed)
    else onCancelRename()
  }

  return (
    <div className="mb-1">
      {/* Workspace header */}
      <div
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[7px] text-left transition-colors"
        style={{
          background: isActiveWs
            ? 'color-mix(in oklch, var(--accent) 10%, transparent)'
            : 'transparent',
          border: isActiveWs
            ? '1px solid color-mix(in oklch, var(--accent) 25%, transparent)'
            : '1px solid transparent',
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onWorkspaceContextMenu(e.clientX, e.clientY)
        }}
      >
        {/* Chevron + toggle */}
        <button
          className="flex-shrink-0 flex items-center"
          style={{ color: 'var(--fg-3)' }}
          onClick={() => {
            onSwitchWorkspace(workspace.id)
            onToggle()
          }}
          title={isActiveWs ? 'Active workspace' : `Switch to ${workspace.name}`}
        >
          {isOpen ? <IChevDown size={11} /> : <IChevRight size={11} />}
        </button>

        {/* Workspace name — click to rename */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') onCancelRename()
            }}
            onBlur={commitRename}
            className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] font-medium px-1 rounded-[4px]"
            style={{
              color: 'var(--fg)',
              border: '1px solid var(--accent)',
              background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
            }}
          />
        ) : (
          <span
            className="flex-1 text-[12.5px] font-medium truncate cursor-text"
            style={{ color: isActiveWs ? 'var(--fg)' : 'var(--fg-2)' }}
            onClick={(e) => {
              e.stopPropagation()
              onSwitchWorkspace(workspace.id)
              onStartRename()
            }}
            title="Click to rename"
          >
            {workspace.name}
          </span>
        )}

        {/* Chip + dot */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {nodes.length > 0 && <span className="chip">{nodes.length}</span>}
          {wsDotStatus && (
            <span
              title={STATUS_LABEL[wsDotStatus]}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: STATUS_COLOR[wsDotStatus],
                boxShadow: STATUS_SHADOW[wsDotStatus],
                display: 'inline-block',
                flexShrink: 0,
                transition: 'background 0.3s, box-shadow 0.3s',
              }}
            />
          )}
          <button
            className="ws-drag-handle flex items-center justify-center"
            style={{
              width: 14,
              height: 18,
              cursor: 'grab',
              color: 'var(--fg-3)',
              touchAction: 'none',
            }}
            title="Drag to reorder"
            onPointerDown={onDragHandlePointerDown}
            onClick={(e) => e.stopPropagation()}
            aria-label="Drag to reorder workspace"
          >
            <svg width={10} height={14} viewBox="0 0 10 14" fill="currentColor">
              <circle cx={2} cy={3} r={1} />
              <circle cx={8} cy={3} r={1} />
              <circle cx={2} cy={7} r={1} />
              <circle cx={8} cy={7} r={1} />
              <circle cx={2} cy={11} r={1} />
              <circle cx={8} cy={11} r={1} />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal list */}
      {isOpen && (
        <div className="pl-1 mt-0.5">
          {nodes.map((t, idx) => {
            const isDragging = terminalDrag?.id === t.id
            return (
              <div key={t.id}>
                {terminalDrag && terminalDrag.id !== t.id && terminalDrag.dropIndex === idx && (
                  <DropIndicator />
                )}
                <div
                  ref={(el) => {
                    if (el) terminalRowRefs.current.set(t.id, el)
                    else terminalRowRefs.current.delete(t.id)
                  }}
                  style={{
                    opacity: isDragging ? 0.35 : 1,
                    transition: 'opacity 120ms ease',
                  }}
                >
                  <TerminalItem
                    terminal={t}
                    selected={selectedTerminalId === t.id}
                    ptyStatus={getStatus(t.id)}
                    onSelect={() => {
                      onSwitchWorkspace(t.workspace_id)
                      onSelectTerminal(t.workspace_id, t.id)
                    }}
                    onDragHandlePointerDown={(e) => onTerminalDragHandlePointerDown(t, e)}
                    onContextMenu={(x, y) => onTerminalContextMenu(t, x, y)}
                  />
                </div>
              </div>
            )
          })}
          {terminalDrag && terminalDrag.dropIndex === nodes.length && <DropIndicator />}
          {nodes.length === 0 && (
            <div
              className="px-3 py-2 text-[11.5px]"
              style={{ color: 'var(--fg-3)' }}
            >
              No terminals
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Terminal item ───────────────────────────────────────────────────────────

function TerminalItem({
  terminal,
  selected,
  ptyStatus,
  onSelect,
  onDragHandlePointerDown,
  onContextMenu,
}: {
  terminal: TerminalNodeData
  selected: boolean
  ptyStatus: PtyStatus
  onSelect: () => void
  onDragHandlePointerDown: (e: React.PointerEvent) => void
  onContextMenu: (x: number, y: number) => void
}): JSX.Element {
  return (
    <div
      className={'term-item ' + (selected ? 'active' : '')}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e.clientX, e.clientY)
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: STATUS_COLOR[ptyStatus],
          boxShadow: STATUS_SHADOW[ptyStatus],
          transition: 'background 0.3s, box-shadow 0.3s',
        }}
        title={STATUS_LABEL[ptyStatus]}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] truncate" style={{ color: 'inherit' }}>
          {terminal.title}
        </div>
        <div
          className="text-[10.5px] truncate font-mono mt-0.5"
          style={{ color: 'var(--fg-3)' }}
        >
          {terminal.cwd}
        </div>
      </div>
      <button
        className="term-drag-handle flex items-center justify-center"
        style={{
          width: 24,
          height: 24,
          cursor: 'grab',
          color: 'var(--fg-3)',
          touchAction: 'none',
          flexShrink: 0,
        }}
        onPointerDown={onDragHandlePointerDown}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder"
        aria-label="Drag to reorder terminal"
      >
        <svg width={10} height={14} viewBox="0 0 10 14" fill="currentColor">
          <circle cx={2} cy={3} r={1} />
          <circle cx={8} cy={3} r={1} />
          <circle cx={2} cy={7} r={1} />
          <circle cx={8} cy={7} r={1} />
          <circle cx={2} cy={11} r={1} />
          <circle cx={8} cy={11} r={1} />
        </svg>
      </button>
    </div>
  )
}

// ── Workspace context menu ──────────────────────────────────────────────────

function WorkspaceContextMenu({
  x,
  y,
  canDuplicate,
  onClose,
  onRename,
  onDelete,
  onDuplicate,
}: {
  x: number
  y: number
  canDuplicate: boolean
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onDuplicate: () => void
}): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    function onScroll(): void {
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onScroll, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onScroll)
    }
  }, [onClose])

  return createPortal(
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
        className="fixed z-[101] min-w-[200px] py-1 rounded-[10px]"
        style={{
          left: x,
          top: y,
          background: 'color-mix(in oklch, var(--bg-2) 96%, transparent)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--line)',
          boxShadow: '0 12px 32px -8px rgb(var(--shadow-color) / 0.32)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          className="ctx-item flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px]"
          style={{ color: 'var(--fg)' }}
          onClick={() => { onRename(); onClose() }}
        >
          <WsIcon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          Rename
        </button>
        <button
          className="ctx-item flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px]"
          style={{ color: canDuplicate ? 'var(--fg)' : 'var(--fg-3)', cursor: canDuplicate ? 'pointer' : 'not-allowed' }}
          onClick={() => { if (canDuplicate) { onDuplicate(); onClose() } }}
          disabled={!canDuplicate}
          title={canDuplicate ? undefined : 'Workspace limit reached (5)'}
        >
          <WsIcon d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          Duplicate
        </button>
        <div style={{ height: 1, margin: '2px 8px', background: 'var(--line)' }} />
        <button
          className="ctx-item flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px]"
          style={{ color: 'oklch(0.68 0.18 25)' }}
          onClick={() => { onDelete(); onClose() }}
        >
          <WsIcon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" danger />
          Delete workspace
        </button>
      </div>
    </>,
    document.body,
  )
}

function WsIcon({ d, danger }: { d: string; danger?: boolean }): JSX.Element {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ width: 18, height: 18, color: danger ? 'oklch(0.68 0.18 25)' : 'var(--fg-2)' }}
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  )
}

// ── Drag preview + drop indicator ──────────────────────────────────────────

function DropIndicator(): JSX.Element {
  return (
    <div
      aria-hidden
      style={{
        height: 2,
        margin: '2px 6px',
        borderRadius: 2,
        background: 'var(--accent)',
        boxShadow: '0 0 6px color-mix(in oklch, var(--accent) 60%, transparent)',
      }}
    />
  )
}

function DragPreview({ name, x, y }: { name: string; x: number; y: number }): JSX.Element {
  // Floating chip "pulled" by the cursor — offset slightly so the cursor sits
  // on the chip's top-left rather than dead center.
  return createPortal(
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: x + 12,
        top: y + 8,
        zIndex: 200,
        pointerEvents: 'none',
        padding: '6px 10px',
        borderRadius: 8,
        background: 'color-mix(in oklch, var(--bg-2) 95%, transparent)',
        border: '1px solid var(--accent)',
        boxShadow: '0 12px 28px -8px rgb(var(--shadow-color) / 0.4)',
        color: 'var(--fg)',
        fontSize: 12.5,
        fontWeight: 500,
        maxWidth: 220,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        backdropFilter: 'blur(8px)',
      }}
    >
      {name}
    </div>,
    document.body,
  )
}
