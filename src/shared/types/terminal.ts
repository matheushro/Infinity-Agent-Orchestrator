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
   * Base prompt (markdown) defining the agent's role. Written into the agent's
   * native context file (CLAUDE.md / AGENTS.md / …) inside an IAO-managed marker
   * block when the agent launches, so the agent reads it as part of its normal
   * context (see `promptFile.service`). Empty string means "no prompt".
   * Persisted as TEXT in SQLite.
   */
  prompt: string
  /**
   * Model the agent is pinned to, delivered as the agent's model env var
   * (e.g. `ANTHROPIC_MODEL`) into its pty — so the choice survives the agent's
   * `/clear` and never leaks between terminals that share a global config.
   * Empty string means "agent default" (no pin). Which env var/values apply is
   * declared per agent in `@shared/agents`. Persisted as TEXT in SQLite.
   */
  model: string
  /**
   * Reasoning-effort ("thinking") level the agent launches with, appended to the
   * launch command as the agent's effort flag (Claude `--effort <level>`, Codex
   * `-c model_reasoning_effort="<level>"`). Empty string means "agent default"
   * (no flag). The flag and the valid levels are declared per agent in
   * `@shared/agents`. Persisted as TEXT in SQLite.
   */
  effort: string
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
