// Left rail: brand, new-terminal trigger, search, terminal list grouped by folder,
// link/centre actions per item, and the theme toggle in the footer.
// Collapsed mode shows a narrow strip with terminal icons; clicking the strip
// re-opens the full sidebar.
import { useState, type ReactNode } from 'react'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import {
  IChevDown,
  IChevRight,
  IClose,
  IFolder,
  ILink,
  IMoon,
  IPlus,
  ISearch,
  ISidebarClose,
  ISidebarOpen,
  ISun,
  ITarget,
} from '@renderer/components/ui'

interface SidebarProps {
  terminals: TerminalNodeData[]
  selectedId: string | null
  theme: CanvasTheme
  query: string
  collapsed: boolean
  onCollapsedChange: (next: boolean) => void
  onQuery: (q: string) => void
  onNewTerminal: () => void
  onSelect: (id: string) => void
  onFocus: (id: string) => void
  onStartLink: (id: string) => void
  onToggleTheme: (t: CanvasTheme) => void
}

function projectRoot(cwd: string): string {
  return cwd.split('/').slice(0, 3).join('/') || cwd
}

function terminalGlyph(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return 'T'
  return trimmed[0].toUpperCase()
}

export function Sidebar(props: SidebarProps): JSX.Element {
  return props.collapsed ? <CollapsedRail {...props} /> : <ExpandedSidebar {...props} />
}

function CollapsedRail({
  terminals,
  selectedId,
  onCollapsedChange,
  onSelect,
  onFocus,
  onNewTerminal,
}: SidebarProps): JSX.Element {
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
      title="Open sidebar"
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
        {terminals.map((t) => {
          const active = selectedId === t.id
          return (
            <button
              key={t.id}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(t.id)
                onFocus(t.id)
              }}
              className="flex items-center justify-center text-[10.5px] font-semibold transition-colors"
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: active
                  ? 'color-mix(in oklch, var(--accent) 18%, transparent)'
                  : 'color-mix(in oklch, var(--fg) 6%, transparent)',
                color: active ? 'var(--fg)' : 'var(--fg-2)',
                border: active ? '1px solid var(--accent)' : '1px solid var(--line-2)',
              }}
              title={`${t.title} · ${t.cwd}`}
            >
              {terminalGlyph(t.title)}
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function ExpandedSidebar({
  terminals,
  selectedId,
  theme,
  query,
  onCollapsedChange,
  onQuery,
  onNewTerminal,
  onSelect,
  onFocus,
  onStartLink,
  onToggleTheme,
}: SidebarProps): JSX.Element {
  const [terminalsOpen, setTerminalsOpen] = useState(true)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? terminals.filter(
        (t) => t.title.toLowerCase().includes(q) || t.cwd.toLowerCase().includes(q),
      )
    : terminals

  const grouped = filtered.reduce<Record<string, TerminalNodeData[]>>((acc, t) => {
    const root = projectRoot(t.cwd)
    ;(acc[root] ??= []).push(t)
    return acc
  }, {})

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
      {/* Brand — chevron toggles the terminals list visibility */}
      <button
        className="flex items-center gap-2.5 px-4 pt-4 pb-3 w-full text-left"
        onClick={() => setTerminalsOpen((v) => !v)}
        title={terminalsOpen ? 'Hide terminals' : 'Show terminals'}
      >
        <span className="logo-mark" aria-hidden />
        <div className="flex flex-col leading-none">
          <span
            className="text-[14px] font-semibold tracking-[-0.01em] flex items-center gap-1"
            style={{ color: 'var(--fg)' }}
          >
            IAO
            <span style={{ color: 'var(--fg-3)' }}>
              {terminalsOpen ? <IChevDown size={12} /> : <IChevRight size={12} />}
            </span>
          </span>
          <span className="text-[10.5px] mt-0.5" style={{ color: 'var(--fg-3)' }}>
            Local workspace
          </span>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <span
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation()
              onCollapsedChange(true)
            }}
            title="Collapse sidebar"
          >
            <ISidebarClose size={15} />
          </span>
        </div>
      </button>

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

      {/* Search */}
      <div className="px-3 pb-3">
        <div
          className="flex items-center gap-2 px-2.5 h-8 rounded-[8px]"
          style={{
            background: 'color-mix(in oklch, var(--fg) 4%, transparent)',
            border: '1px solid var(--line-2)',
          }}
        >
          <ISearch size={13} />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search terminals…"
            className="bg-transparent outline-none text-[12.5px] flex-1 min-w-0"
            style={{ color: 'var(--fg)' }}
          />
          {query && (
            <button
              className="icon-btn !w-5 !h-5"
              onClick={() => onQuery('')}
              aria-label="Clear search"
            >
              <IClose size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-1 pb-1.5 flex items-center justify-between">
        <span
          className="text-[10.5px] uppercase tracking-[0.08em]"
          style={{ color: 'var(--fg-3)', fontWeight: 500 }}
        >
          Terminals
        </span>
        <span className="chip">{terminals.length}</span>
      </div>

      <div
        className="flex-1 overflow-y-auto nice-scroll px-2 pb-2"
        style={{ display: terminalsOpen ? 'block' : 'none' }}
      >
        {Object.entries(grouped).map(([root, items], gi) => (
          <div key={root} className={gi > 0 ? 'mt-3' : ''}>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <IChevDown size={11} />
              <IFolder size={12} />
              <span
                className="text-[11.5px] font-medium truncate"
                style={{ color: 'var(--fg-2)' }}
              >
                {root.replace(/^~\//, '') || root}
              </span>
            </div>
            <div className="pl-1">
              {items.map((t) => (
                <div
                  key={t.id}
                  className={'term-item ' + (selectedId === t.id ? 'active' : '')}
                  onClick={() => {
                    onSelect(t.id)
                    onFocus(t.id)
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] truncate" style={{ color: 'inherit' }}>
                      {t.title}
                    </div>
                    <div
                      className="text-[10.5px] truncate font-mono mt-0.5"
                      style={{ color: 'var(--fg-3)' }}
                    >
                      {t.cwd}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      className="icon-btn !w-6 !h-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        onFocus(t.id)
                      }}
                      title="Center on canvas"
                    >
                      <ITarget size={12} />
                    </button>
                    <button
                      className="icon-btn !w-6 !h-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        onStartLink(t.id)
                      }}
                      title="Link from this terminal"
                    >
                      <ILink size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && terminals.length > 0 && (
          <div className="text-center text-[11.5px] py-8" style={{ color: 'var(--fg-3)' }}>
            No terminals match &ldquo;{query}&rdquo;
          </div>
        )}
        {terminals.length === 0 && (
          <div className="text-center text-[11.5px] py-8" style={{ color: 'var(--fg-3)' }}>
            No terminals yet
          </div>
        )}
      </div>

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
