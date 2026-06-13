// Domain types shared across main, preload and renderer.

/** Shell the user can force for a terminal; `default` means the OS default. */
export type ShellType = 'default' | 'bash' | 'zsh'

/**
 * Persisted shape of a terminal node (SQLite row / layout state).
 * This is the single source of truth — do NOT duplicate it per process.
 */
export interface TerminalRecord {
  id: string
  title: string
  cwd: string
  command: string
  shell: string
  /**
   * Base prompt (markdown) defining the agent's role. Injected once when the
   * agent launches — as a native system-prompt flag where the agent supports
   * one (see `promptArg` in `@shared/agents`), otherwise as the first REPL
   * message. Empty string means "no prompt". Persisted as TEXT in SQLite.
   */
  prompt: string
  x: number
  y: number
  width: number
  height: number
  workspace_id: string
  /**
   * Power state. `true` means the terminal runs its pty/xterm session; `false`
   * means it stays on the canvas (persisted, visible) but does NOT spawn a shell
   * — saving RAM/CPU. Persisted as INTEGER 0/1 in SQLite.
   */
  enabled: boolean
}

/** Persisted edge connecting two terminal nodes. */
export interface EdgeRecord {
  id: string
  source: string
  target: string
}
