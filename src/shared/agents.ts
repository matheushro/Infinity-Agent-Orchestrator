// Central registry of launchable agents. To add a new agent, add one entry here —
// no other file needs changing (the modal, types, and skill installer all derive from this).
export interface AgentDef {
  key: string
  /** Shell input written into the pty after the shell starts. Empty for a plain terminal. */
  cmd: string
  label: string
  icon: string
  /** Path relative to os.homedir() where the IAO SKILL.md should be installed. */
  skillDir?: string
  /**
   * Context file the agent reads natively on startup, relative to its working
   * directory (e.g. `CLAUDE.md`, `AGENTS.md`). The per-terminal prompt is
   * written into this file inside an IAO-managed marker block, so the agent
   * picks the role up as part of its normal context — no runtime flag, no REPL
   * injection. The path may include directories (e.g.
   * `.github/copilot-instructions.md`); they are created as needed. Agents that
   * declare none fall back to `DEFAULT_CONTEXT_FILE`.
   */
  contextFile?: string
}

/** Context file used when an agent declares none, or its command is unknown. */
export const DEFAULT_CONTEXT_FILE = 'AGENTS.md'

export const AGENTS = {
  codex: {
    key: 'codex',
    label: 'Codex',
    cmd: 'codex',
    icon: '🧠',
    skillDir: '.codex/skills/iao',
    contextFile: 'AGENTS.md',
  },
  claude: {
    key: 'claude',
    label: 'Claude Code',
    cmd: 'claude',
    icon: '✳️',
    skillDir: '.claude/skills/iao',
    contextFile: 'CLAUDE.md',
  },
  gemini: {
    key: 'gemini',
    label: 'Gemini',
    cmd: 'gemini',
    icon: '✦',
    skillDir: '.gemini/skills/iao',
    contextFile: 'GEMINI.md',
  },
  copilot: {
    key: 'copilot',
    label: 'GitHub Copilot',
    cmd: 'copilot',
    icon: '🐙',
    skillDir: '.copilot/skills/iao',
    contextFile: '.github/copilot-instructions.md',
  },
  opencode: {
    key: 'opencode',
    label: 'Open Code',
    cmd: 'opencode',
    icon: '🧩',
    skillDir: '.opencode/skills/iao',
    contextFile: 'AGENTS.md',
  },
  cursor: {
    key: 'cursor',
    label: 'Cursor CLI',
    cmd: 'cursor-agent',
    icon: '🖱️',
    skillDir: '.cursor/skills/iao',
    contextFile: 'AGENTS.md',
  },
  // Plain terminal: opens a shell with no agent. Empty cmd → pty.service writes nothing.
  terminal: {
    key: 'terminal',
    label: 'Terminal',
    cmd: '',
    icon: '⌨️',
  },
} satisfies Record<string, AgentDef>

export type AgentKey = keyof typeof AGENTS

/**
 * Resolve an agent by the shell command it launches (`cmd`). The pty service
 * only knows the command string it was asked to run, not the registry key, so
 * this maps back to the definition (e.g. to read `contextFile`). Returns
 * undefined for a plain terminal (empty cmd) or an unknown command.
 */
export function agentByCmd(cmd: string): AgentDef | undefined {
  if (!cmd) return undefined
  return Object.values(AGENTS).find((agent) => agent.cmd === cmd)
}

/**
 * Resolve the context file an agent reads its prompt from, by launch command.
 * Falls back to `DEFAULT_CONTEXT_FILE` for agents without a declared file or an
 * unknown command, so the prompt always has somewhere to live.
 */
export function contextFileForCmd(cmd: string): string {
  return agentByCmd(cmd)?.contextFile ?? DEFAULT_CONTEXT_FILE
}
