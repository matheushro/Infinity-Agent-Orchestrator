// Left rail: workspace list (accordion), terminal list per workspace with PTY
// activity indicators, new workspace button, theme toggle.
import { useState, type ReactNode } from 'react'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import type { WorkspaceRecord } from '@shared/types/workspace'
import { usePtyActivity, type PtyStatus } from '@renderer/features/workspaces/context/PtyActivityContext'
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
  onSwitchWorkspace: (workspaceId: string) => void
  onSelectTerminal: (workspaceId: string, terminalId: string) => void
  onToggleTheme: (t: CanvasTheme) => void
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

function ExpandedSidebar({
  workspaces,
  activeWorkspaceId,
  nodesByWorkspace,
  selectedTerminalId,
  theme,
  onCollapsedChange,
  onNewTerminal,
  onCreateWorkspace,
  onSwitchWorkspace,
  onSelectTerminal,
  onToggleTheme,
}: SidebarProps): JSX.Element {
  const { getStatus } = usePtyActivity()
  const [newWsMode, setNewWsMode] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  // Track which workspace sections are open (default: all open).
  const [openWorkspaces, setOpenWorkspaces] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(workspaces.map((w) => [w.id, true])),
  )

  function toggleWorkspace(id: string): void {
    setOpenWorkspaces((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleCreateWorkspace(): void {
    const name = newWsName.trim()
    if (!name) return
    onCreateWorkspace(name)
    setNewWsName('')
    setNewWsMode(false)
    // Open the new workspace section (it will be added to workspaces list).
    // We can't know its id here, but useWorkspaces will set it active.
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
              onToggle={() => toggleWorkspace(ws.id)}
              onSwitchWorkspace={onSwitchWorkspace}
              onSelectTerminal={onSelectTerminal}
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
    </aside>
  )
}

// ── Workspace section (accordion item) ─────────────────────────────────────

function WorkspaceSection({
  workspace,
  nodes,
  isActiveWs,
  isOpen,
  selectedTerminalId,
  onToggle,
  onSwitchWorkspace,
  onSelectTerminal,
  getStatus,
}: {
  workspace: WorkspaceRecord
  nodes: TerminalNodeData[]
  isActiveWs: boolean
  isOpen: boolean
  selectedTerminalId: string | null
  onToggle: () => void
  onSwitchWorkspace: (id: string) => void
  onSelectTerminal: (wsId: string, terminalId: string) => void
  getStatus: (nodeId: string) => PtyStatus
}): JSX.Element {
  const anyBusy = nodes.some((n) => getStatus(n.id) === 'busy')
  const anyIdle = nodes.some((n) => getStatus(n.id) === 'idle')
  const wsDotStatus: PtyStatus | null = anyBusy ? 'busy' : anyIdle ? 'idle' : null

  return (
    <div className="mb-1">
      {/* Workspace header */}
      <button
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[7px] text-left transition-colors"
        style={{
          background: isActiveWs
            ? 'color-mix(in oklch, var(--accent) 10%, transparent)'
            : 'transparent',
          border: isActiveWs ? '1px solid color-mix(in oklch, var(--accent) 25%, transparent)' : '1px solid transparent',
        }}
        onClick={() => {
          onSwitchWorkspace(workspace.id)
          onToggle()
        }}
        title={isActiveWs ? 'Active workspace' : `Switch to ${workspace.name}`}
      >
        <span style={{ color: 'var(--fg-3)', flexShrink: 0 }}>
          {isOpen ? <IChevDown size={11} /> : <IChevRight size={11} />}
        </span>
        <span
          className="flex-1 text-[12.5px] font-medium truncate"
          style={{ color: isActiveWs ? 'var(--fg)' : 'var(--fg-2)' }}
        >
          {workspace.name}
        </span>
        {/* Active-workspace indicator + PTY dot */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {nodes.length > 0 && (
            <span className="chip">{nodes.length}</span>
          )}
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
      </button>

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
}: {
  terminal: TerminalNodeData
  selected: boolean
  ptyStatus: PtyStatus
  onSelect: () => void
  onFocus: () => void
}): JSX.Element {
  return (
    <div
      className={'term-item ' + (selected ? 'active' : '')}
      onClick={onSelect}
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
