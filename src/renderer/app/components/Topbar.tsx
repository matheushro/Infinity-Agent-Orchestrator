// Workspace topbar: breadcrumb, terminal count chip, link tool, theme toggle.
import {
  IChevRight,
  IGrid,
  IKeyboard,
  IMoon,
  ISun,
  Select,
} from '@renderer/components/ui'
import type { ShellType } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'

interface TopbarProps {
  terminalCount: number
  theme: CanvasTheme
  shell: ShellType
  onToggleTheme: () => void
  onShellChange: (s: ShellType) => void
}

export function Topbar({
  terminalCount,
  theme,
  shell,
  onToggleTheme,
  onShellChange,
}: TopbarProps): JSX.Element {
  return (
    <header
      className="topbar flex items-center gap-3 px-4"
      style={{ height: 44, flexShrink: 0 }}
    >
      <div
        className="flex items-center gap-2 text-[12.5px]"
        style={{ color: 'var(--fg-3)' }}
      >
        <span>Workspace</span>
        <IChevRight size={11} />
        <span style={{ color: 'var(--fg)', fontWeight: 500 }}>IAO-app</span>
        <span className="chip ml-1">
          {terminalCount} {terminalCount === 1 ? 'terminal' : 'terminals'}
        </span>
      </div>

      <div className="flex-1" />

      <Select
        label="Shell:"
        value={shell}
        onChange={(v) => onShellChange(v as ShellType)}
        options={[
          { value: 'default', label: 'System default' },
          { value: 'bash', label: 'bash' },
          { value: 'zsh', label: 'zsh' },
        ]}
      />

      <div className="flex items-center gap-1">
        <button className="icon-btn" title="Toggle grid">
          <IGrid size={14} />
        </button>
        <button className="icon-btn" title="Shortcuts">
          <IKeyboard size={14} />
        </button>
        <div className="w-px h-5 mx-1" style={{ background: 'var(--line)' }} />
        <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? <ISun size={14} /> : <IMoon size={14} />}
        </button>
      </div>
    </header>
  )
}
