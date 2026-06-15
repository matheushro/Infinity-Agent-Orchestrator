// Types owned by the terminals feature.
import type { ShellType } from '@shared/types/terminal'

export type { ShellType }

// CommandKey is derived from the AGENTS registry — adding a new agent there
// automatically expands this type without any manual edit here.
export type { AgentKey as CommandKey, AgentDef as CommandDef } from '@shared/agents'

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
  /** Base prompt (markdown) injected once when the agent launches. '' = none. */
  prompt: string
  /**
   * Model this terminal is pinned to, exported as the agent's model env var when
   * the pty launches (see `@shared/agents`). '' = agent default (no pin).
   */
  model: string
  workspace_id: string
  /** Power state. When `false`, the node stays on the canvas but runs no pty/xterm. */
  enabled: boolean
}

/** Per-terminal visual customization. Persisted in localStorage, not in SQLite. */
export interface TerminalStyle {
  // 'auto' follows the global app theme; 'dark'/'light' force a fixed look.
  theme: 'auto' | 'dark' | 'light'
  fontFamily: string
  fontSize: number
}

export const DEFAULT_TERMINAL_STYLE: TerminalStyle = {
  theme: 'auto',
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
