// Left rail: workspace list (accordion), terminal list per workspace with PTY
// activity indicators, new workspace button, theme toggle.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import type { WorkspaceRecord } from '@shared/types/workspace'
import { usePtyActivity, type PtyStatus } from '@renderer/features/workspaces/context/PtyActivityContext'
import { TerminalContextMenu } from '@renderer/features/terminals/components/TerminalContextMenu'
import {
  IChevDown,
  IChevRight,
  IClose,
  IMoon,
  IPlus,
  ISidebarClose,
  ISidebarOpen,
  ISun,
  ITarget,
} from '@renderer/components/ui'

interface SidebarProps {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string
  nodesByWorkspace: Record<string, TerminalNodeData[]>
  selectedTerminalId: string | null
  theme: CanvasTheme
  collapsed: boolean
  onCollapsedChange: (next: boolean) => void
  onNewTerminal: () => void
  onCreateWorkspace: (name: string) => void
  onRenameWorkspace: (id: string, name: string) => void
  onDeleteWorkspace: (id: string) => void
  onDuplicateWorkspace: (id: string) => void
  onSwitchWorkspace: (workspaceId: string) => void
  onSelectTerminal: (workspaceId: string, terminalId: string) => void
  onToggleTheme: (t: CanvasTheme) => void
  onTerminalDelete: (workspaceId: string, terminalId: string) => void
  onTerminalLink: (workspaceId: string, terminalId: string) => void
  onTerminalStyle: (workspaceId: string, terminalId: string) => void
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

export function Sidebar(props: SidebarProps): JSX.Element {
  return props.collapsed ? <CollapsedRail {...props} /> : <ExpandedSidebar {...props} />
}

// ── Collapsed rail ─────────────────────────────────────────────────────────

function CollapsedRail({
  workspaces,
  activeWorkspaceId,
  nodesByWorkspace,
  selectedTerminalId,
  onCollapsedChange,
  onSelectTerminal,
  onSwitchWorkspace,
  onNewTerminal,
}: SidebarProps): JSX.Element {
  const { getStatus } = usePtyActivity()
  const allNodes = workspaces.flatMap((w) => nodesByWorkspace[w.id] ?? [])

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

function ExpandedSidebar({
  workspaces,
  activeWorkspaceId,
  nodesByWorkspace,
  selectedTerminalId,
  theme,
  onCollapsedChange,
  onNewTerminal,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onDuplicateWorkspace,
  onSwitchWorkspace,
  onSelectTerminal,
  onToggleTheme,
  onTerminalDelete,
  onTerminalLink,
  onTerminalStyle,
}: SidebarProps): JSX.Element {
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
      <div className="flex-1 overflow-y-auto nice-scroll px-2 pb-2">
        {workspaces.map((ws) => {
          const nodes = nodesByWorkspace[ws.id] ?? []
          const isActiveWs = ws.id === activeWorkspaceId
          const isOpen = openWorkspaces[ws.id] !== false

          return (
            <WorkspaceSection
              key={ws.id}
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
              getStatus={getStatus}
            />
          )
        })}

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

      {/* Theme toggle */}
      <div
        className="px-3 py-2.5 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <div
          className="flex-1 flex items-center rounded-[8px] p-0.5"
          style={{
            background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
            border: '1px solid var(--line-2)',
          }}
        >
          <ThemeChip
            label="Light"
            icon={<ISun size={12} />}
            active={theme === 'light'}
            onClick={() => onToggleTheme('light')}
          />
          <ThemeChip
            label="Dark"
            icon={<IMoon size={12} />}
            active={theme === 'dark'}
            onClick={() => onToggleTheme('dark')}
          />
        </div>
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
        </div>
      </div>

      {/* Terminal list */}
      {isOpen && (
        <div className="pl-1 mt-0.5">
          {nodes.map((t) => (
            <TerminalItem
              key={t.id}
              terminal={t}
              selected={selectedTerminalId === t.id}
              ptyStatus={getStatus(t.id)}
              onSelect={() => {
                onSwitchWorkspace(t.workspace_id)
                onSelectTerminal(t.workspace_id, t.id)
              }}
              onFocus={() => {
                onSwitchWorkspace(t.workspace_id)
                onSelectTerminal(t.workspace_id, t.id)
              }}
              onContextMenu={(x, y) => onTerminalContextMenu(t, x, y)}
            />
          ))}
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
  onFocus,
  onContextMenu,
}: {
  terminal: TerminalNodeData
  selected: boolean
  ptyStatus: PtyStatus
  onSelect: () => void
  onFocus: () => void
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
        className="icon-btn !w-6 !h-6"
        onClick={(e) => {
          e.stopPropagation()
          onFocus()
        }}
        title="Center on canvas"
      >
        <ITarget size={12} />
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

// ── Theme chip ──────────────────────────────────────────────────────────────

function ThemeChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: ReactNode
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-[6px] text-[11.5px] transition-colors"
      style={{
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--fg-3)',
        fontWeight: active ? 500 : 400,
        boxShadow: active ? '0 1px 2px rgb(0 0 0 / 0.10)' : 'none',
      }}
    >
      {icon} {label}
    </button>
  )
}
