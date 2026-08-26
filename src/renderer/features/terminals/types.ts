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
  /**
   * Reasoning-effort level this terminal launches with, appended to the launch
   * command as the agent's effort flag (see `@shared/agents`). '' = agent
   * default (no flag).
   */
  effort: string
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
  /**
   * Row height as a multiple of the glyph height. xterm's DOM renderer clips
   * every row to exactly this box (`overflow: hidden`), so a value of 1 shaves
   * the ascenders/descenders of box-drawing and accented glyphs — and the canvas
   * zoom lands those boundaries on fractional pixels, which is what makes the
   * clipping come and go with the zoom level. Anything above 1 leaves slack.
   */
  lineHeight: number
}

/** Bounds for the line-height control; below MIN xterm starts clipping glyphs. */
export const LINE_HEIGHT_MIN = 1
export const LINE_HEIGHT_MAX = 1.6
export const LINE_HEIGHT_STEP = 0.05

export const DEFAULT_TERMINAL_STYLE: TerminalStyle = {
  theme: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.2,
}

/** True when a style carries no customization, so it can be dropped instead of stored. */
export function isDefaultTerminalStyle(style: TerminalStyle): boolean {
  return (
    style.theme === DEFAULT_TERMINAL_STYLE.theme &&
    style.fontFamily === DEFAULT_TERMINAL_STYLE.fontFamily &&
    style.fontSize === DEFAULT_TERMINAL_STYLE.fontSize &&
    style.lineHeight === DEFAULT_TERMINAL_STYLE.lineHeight
  )
}

export const FONT_FAMILY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ui-monospace, SFMono-Regular, Menlo, monospace', label: 'System mono' },
  { value: '"JetBrains Mono", ui-monospace, monospace', label: 'JetBrains Mono' },
  { value: '"Fira Code", ui-monospace, monospace', label: 'Fira Code' },
  { value: '"Cascadia Code", ui-monospace, monospace', label: 'Cascadia Code' },
  { value: '"IBM Plex Mono", ui-monospace, monospace', label: 'IBM Plex Mono' },
]
