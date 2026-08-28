// Usage-report contracts. The main process reads each agent's local session
// logs and returns already-aggregated data — the renderer never parses logs.

/** Agents whose local logs the report can read. */
export const USAGE_AGENTS = ['codex', 'claude'] as const
export type UsageAgent = (typeof USAGE_AGENTS)[number]

/** Rate-limit movement across a single prompt, for one limit window. */
export interface UsageLimitDelta {
  /** Percentage of the window already used before the prompt ran. */
  before: number | null
  /** Percentage used once the prompt finished. */
  after: number | null
  /** after - before, when both are known and the window did not reset. */
  used: number | null
}

/**
 * Where a prompt was typed. `iao` means the agent was launched by IAO in its
 * terminal's role directory (`<repo>/.iao/roles/<terminalId>`), so the spend is
 * attributable to a canvas terminal.
 */
export type UsageOrigin = 'iao' | 'external'

/** One user prompt and what it cost. */
export interface PromptUsage {
  /** Stable per-report id: session file + ordinal. */
  id: string
  /** ISO timestamp of the prompt (UTC, as written by the agent). */
  timestamp: string
  sessionId: string
  /** Folder the session runs in, when the log records one. */
  cwd: string | null
  model: string | null
  /** Reasoning effort, when the agent records one (Codex). */
  effort: string | null
  /** Git branch the session was on, when the agent records one (Claude). */
  branch: string | null
  prompt: string
  /** Model requests the prompt triggered (tool calls and subagents included). */
  requests: number
  /** Timestamp of the prompt's last model request — end of the turn. */
  endedAt: string
  origin: UsageOrigin
  /** Canvas terminal id, when the session ran in an IAO role directory. */
  terminalId: string | null
  /** Terminal title from the database, when the terminal still exists. */
  terminalTitle: string | null
  /** Repository root, i.e. `cwd` without the `.iao/roles/<id>` suffix. */
  projectCwd: string | null
  /** Every input token billed, cache included. */
  inputTokens: number
  /** Input tokens served from cache. */
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  /** 5-hour window. All null for agents that do not log rate limits. */
  fiveHour: UsageLimitDelta
  /** Weekly window. All null for agents that do not log rate limits. */
  weekly: UsageLimitDelta
}

/** Per-session roll-up of the prompts inside the reported day. */
export interface SessionUsage {
  sessionId: string
  cwd: string | null
  projectCwd: string | null
  model: string | null
  origin: UsageOrigin
  terminalId: string | null
  terminalTitle: string | null
  prompts: number
  totalTokens: number
  /** Sum of the 5-hour percentages consumed by this session's prompts. */
  percentUsed: number
  /** Sum of the weekly percentages consumed by this session's prompts. */
  percentWeeklyUsed: number
  firstAt: string
  lastAt: string
}

export interface UsageTotals {
  prompts: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  /** Sum of the per-prompt 5-hour consumption. */
  percentUsed: number
  /** Sum of the per-prompt weekly consumption. */
  percentWeeklyUsed: number
}

export interface UsageReport {
  agent: UsageAgent
  /** Local calendar day the report covers, `YYYY-MM-DD`. */
  day: string
  /** Logs root actually scanned — useful when the default path is empty. */
  root: string
  /** True when the logs folder does not exist. */
  missingRoot: boolean
  /**
   * True when the agent records rate-limit percentages (Codex does, Claude does
   * not). The UI hides the limit columns and cards when false.
   */
  hasLimits: boolean
  entries: PromptUsage[]
  sessions: SessionUsage[]
  totals: UsageTotals
}

export interface UsageQuery {
  agent: UsageAgent
  /** Local day to report on, `YYYY-MM-DD`. Defaults to today. */
  day?: string
  /** Keep only prompts sent from an IAO terminal. Defaults to false. */
  onlyIao?: boolean
  /** Logs folder. Defaults to the agent's own (`~/.codex/sessions`, …). */
  root?: string
}
