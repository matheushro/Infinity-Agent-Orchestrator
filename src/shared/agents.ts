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
   * Native system-prompt flag, when the agent exposes one. Returns the launch
   * argument (e.g. `--append-system-prompt '<prompt>'`) appended to `cmd` so
   * the prompt lands in the agent's cached prompt prefix — paid for once, then
   * cheap on every following turn. Agents without a reliable flag omit this and
   * fall back to injecting the prompt as the first REPL message (see
   * pty.service). Only ever called with a non-empty prompt.
   */
  promptArg?: (prompt: string) => string
}

/**
 * Wrap a value as a single POSIX shell argument: single-quote it and escape any
 * embedded single quotes. Single quotes preserve everything literally (including
 * newlines), so a multi-line markdown prompt survives intact as one argument in
 * the bash/zsh the pty spawns.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export const AGENTS = {
  codex: {
    key: 'codex',
    label: 'Codex',
    cmd: 'codex',
    icon: '🧠',
    skillDir: '.codex/skills/iao',
  },
  claude: {
    key: 'claude',
    label: 'Claude Code',
    cmd: 'claude',
    icon: '✳️',
    skillDir: '.claude/skills/iao',
    // Claude Code is the only agent with a reliable interactive system-prompt
    // flag. It is a real system prompt (best adherence) and stays in the cached
    // prefix. Other agents have no equivalent, so they use the REPL fallback.
    promptArg: (prompt) => `--append-system-prompt ${shellQuote(prompt)}`,
  },
  gemini: {
    key: 'gemini',
    label: 'Gemini',
    cmd: 'gemini',
    icon: '✦',
    skillDir: '.gemini/skills/iao',
  },
  copilot: {
    key: 'copilot',
    label: 'GitHub Copilot',
    cmd: 'copilot',
    icon: '🐙',
    skillDir: '.copilot/skills/iao',
  },
  opencode: {
    key: 'opencode',
    label: 'Open Code',
    cmd: 'opencode',
    icon: '🧩',
    skillDir: '.opencode/skills/iao',
  },
  cursor: {
    key: 'cursor',
    label: 'Cursor CLI',
    cmd: 'cursor-agent',
    icon: '🖱️',
    skillDir: '.cursor/skills/iao',
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
 * this maps back to the definition (e.g. to read `promptArg`). Returns
 * undefined for a plain terminal (empty cmd) or an unknown command.
 */
export function agentByCmd(cmd: string): AgentDef | undefined {
  if (!cmd) return undefined
  return Object.values(AGENTS).find((agent) => agent.cmd === cmd)
}
