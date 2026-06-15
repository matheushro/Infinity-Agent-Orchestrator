// Central registry of launchable agents. To add a new agent, add one entry here —
// no other file needs changing (the modal, types, and skill installer all derive from this).

/** A model the user can pin a terminal to, shown in the create/edit modals. */
export interface ModelOption {
  /** Value exported in the agent's model env var (see `AgentDef.modelEnv`). */
  value: string
  label: string
}

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
  /**
   * Env var the agent reads to pick its default model (e.g. `ANTHROPIC_MODEL`
   * for Claude Code, `GEMINI_MODEL` for Gemini). When a terminal pins a model,
   * IAO injects this var into that pty's environment — so the choice is isolated
   * to the terminal's process and survives the agent's own `/clear`, instead of
   * inheriting the model last selected in another terminal that shares the same
   * global config. Preferred over `modelArg` when both exist.
   */
  modelEnv?: string
  /**
   * Launch flag that selects the model for agents that expose no model env var
   * (Codex, Cursor, Copilot, OpenCode all take `--model`). When a model is
   * pinned and the agent has no `modelEnv`, IAO appends `<modelArg> <model>` to
   * the launch command. This pins the model at startup (per terminal); it does
   * not isolate a mid-session `/model` switch the way an env var does.
   */
  modelArg?: string
  /**
   * Curated models offered as a dropdown (only where the ids are stable, e.g.
   * Claude/Gemini). Agents that support a model (`modelEnv`/`modelArg`) but
   * declare no list get a free-text field instead, so volatile/provider-specific
   * ids never rot here. Absent + no model mechanism → no picker at all.
   */
  models?: ModelOption[]
  /** Placeholder for the free-text model field (agents with `modelArg`, no list). */
  modelHint?: string
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
    modelArg: '--model',
    modelHint: 'e.g. gpt-5.4',
  },
  claude: {
    key: 'claude',
    label: 'Claude Code',
    cmd: 'claude',
    icon: '✳️',
    skillDir: '.claude/skills/iao',
    contextFile: 'CLAUDE.md',
    modelEnv: 'ANTHROPIC_MODEL',
    // Family aliases (not dated ids) so a pin tracks the latest of each tier and
    // does not rot when a new snapshot ships. Claude Code resolves these.
    models: [
      { value: 'opus', label: 'Opus' },
      { value: 'sonnet', label: 'Sonnet' },
      { value: 'haiku', label: 'Haiku' },
    ],
  },
  gemini: {
    key: 'gemini',
    label: 'Gemini',
    cmd: 'gemini',
    icon: '✦',
    skillDir: '.gemini/skills/iao',
    contextFile: 'GEMINI.md',
    // Gemini CLI reads GEMINI_MODEL (flag > GEMINI_MODEL > settings.json > default).
    modelEnv: 'GEMINI_MODEL',
    models: [
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
  },
  copilot: {
    key: 'copilot',
    label: 'GitHub Copilot',
    cmd: 'copilot',
    icon: '🐙',
    skillDir: '.copilot/skills/iao',
    contextFile: '.github/copilot-instructions.md',
    modelArg: '--model',
    modelHint: 'e.g. claude-sonnet-4.5',
  },
  opencode: {
    key: 'opencode',
    label: 'Open Code',
    cmd: 'opencode',
    icon: '🧩',
    skillDir: '.opencode/skills/iao',
    contextFile: 'AGENTS.md',
    // OpenCode takes provider/model ids: `opencode --model anthropic/claude-...`.
    modelArg: '--model',
    modelHint: 'e.g. anthropic/claude-sonnet-4-5',
  },
  cursor: {
    key: 'cursor',
    label: 'Cursor CLI',
    cmd: 'cursor-agent',
    icon: '🖱️',
    skillDir: '.cursor/skills/iao',
    contextFile: 'AGENTS.md',
    modelArg: '--model',
    modelHint: 'e.g. gpt-5.2',
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

/**
 * Resolve the env var an agent reads its default model from, by launch command.
 * Returns undefined for a plain terminal, an unknown command, or an agent that
 * declares no `modelEnv` — in which case no model env is injected.
 */
export function modelEnvForCmd(cmd: string): string | undefined {
  return agentByCmd(cmd)?.modelEnv
}

/**
 * Resolve the launch flag an agent selects its model with (e.g. `--model`), by
 * launch command. Returns undefined when the agent has no such flag — including
 * agents that deliver the model via `modelEnv` instead.
 */
export function modelArgForCmd(cmd: string): string | undefined {
  return agentByCmd(cmd)?.modelArg
}

/** True when the agent can be pinned to a model at all (env var or launch flag). */
export function supportsModel(agent: AgentDef): boolean {
  return Boolean(agent.modelEnv || agent.modelArg)
}
