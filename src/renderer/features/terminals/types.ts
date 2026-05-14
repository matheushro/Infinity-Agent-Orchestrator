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
}
