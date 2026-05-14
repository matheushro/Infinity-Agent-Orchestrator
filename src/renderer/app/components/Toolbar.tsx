// Top application chrome: new-terminal action, shell/theme selectors, count.
import { Button, Select } from '@renderer/components/ui'
import type { ShellType } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'

interface ToolbarProps {
  shell: ShellType
  theme: CanvasTheme
  terminalCount: number
  onShellChange: (shell: ShellType) => void
  onThemeChange: (theme: CanvasTheme) => void
  onNewTerminal: () => void
}

export function Toolbar({
  shell,
  theme,
  terminalCount,
  onShellChange,
  onThemeChange,
  onNewTerminal
}: ToolbarProps): JSX.Element {
  return (
    <header className="flex items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-2">
      <h1 className="text-sm font-semibold text-slate-100">IGO</h1>
      <Button size="md" onClick={onNewTerminal}>
        + New terminal
      </Button>
      <Select
        label="Shell:"
        className="ml-auto"
        value={shell}
        onChange={(v) => onShellChange(v as ShellType)}
        options={[
          { value: 'default', label: 'System default' },
          { value: 'bash', label: 'bash' },
          { value: 'zsh', label: 'zsh' }
        ]}
      />
      <Select
        label="Theme:"
        value={theme}
        onChange={(v) => onThemeChange(v as CanvasTheme)}
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' }
        ]}
      />
      <span className="text-xs text-slate-500">
        {terminalCount} {terminalCount === 1 ? 'terminal' : 'terminals'}
      </span>
    </header>
  )
}
