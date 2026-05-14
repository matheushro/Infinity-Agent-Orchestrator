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
  x: number
  y: number
  width: number
  height: number
}
