// Types owned by the terminals feature.
import type { ShellType } from '@shared/types/terminal'

export type { ShellType }

/** Commands supported when opening a terminal. `cmd` is what runs in the pty. */
export type CommandKey = 'codex' | 'claude'

export interface CommandDef {
  key: CommandKey
  label: string
  cmd: string
  icon: string
}

/**
 * In-memory representation of a terminal node in the renderer.
 * `id` is the persistence/layout id (NOT the pty session id — see useTerminalSession).
 */
export interface TerminalNodeData {
  id: string
  x: number
  y: number
  width: number
  height: number
  shell: ShellType
  title: string
  cwd: string
  command: CommandKey
  workspace_id: string
}

/** Per-terminal visual customization. Persisted in localStorage, not in SQLite. */
export interface TerminalStyle {
  theme: 'dark' | 'light'
  fontFamily: string
  fontSize: number
}

export const DEFAULT_TERMINAL_STYLE: TerminalStyle = {
  theme: 'dark',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
}

export const FONT_FAMILY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ui-monospace, SFMono-Regular, Menlo, monospace', label: 'System mono' },
  { value: '"JetBrains Mono", ui-monospace, monospace', label: 'JetBrains Mono' },
  { value: '"Fira Code", ui-monospace, monospace', label: 'Fira Code' },
  { value: '"Cascadia Code", ui-monospace, monospace', label: 'Cascadia Code' },
  { value: '"IBM Plex Mono", ui-monospace, monospace', label: 'IBM Plex Mono' },
]
