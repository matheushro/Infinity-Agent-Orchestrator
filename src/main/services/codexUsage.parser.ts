// Pure parser for a single Codex rollout log (`~/.codex/sessions/**/*.jsonl`).
// No filesystem access — it takes the file's text and returns one entry per
// user prompt, so it can be unit-tested against fixture strings.
//
// A prompt costs every model request it triggers (tool calls included), so the
// `token_count` events between two user prompts are summed into the first one.
import type { PromptUsage, UsageLimitDelta } from '@shared/types/usage'
import { splitRoleCwd } from './usageCwd'

const FIVE_HOUR_WINDOW = 300
const WEEKLY_WINDOW = 10080

/** Percentages of each known limit window at a point in the log. */
interface RateSnapshot {
  fiveHour: number | null
  weekly: number | null
}

const EMPTY_RATE: RateSnapshot = { fiveHour: null, weekly: null }

/**
 * Codex injects context as user messages — tagged blocks (`<environment_context>`,
 * `<recommended_plugins>`, …) and the project's AGENTS.md. Neither is a prompt.
 */
const INJECTED_BLOCK = /^<[a-zA-Z_][\w-]*>/
const INJECTED_AGENTS_FILE = /^#\s*AGENTS\.md instructions for /i

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readRate(payload: unknown, previous: RateSnapshot): RateSnapshot {
  if (typeof payload !== 'object' || payload === null) return previous
  const limits = (payload as Record<string, unknown>).rate_limits
  if (typeof limits !== 'object' || limits === null) return previous

  let next = previous
  for (const key of ['primary', 'secondary']) {
    const window = (limits as Record<string, unknown>)[key]
    if (typeof window !== 'object' || window === null) continue
    const { window_minutes: minutes, used_percent: used } = window as Record<string, unknown>
    if (typeof used !== 'number') continue
    if (minutes === FIVE_HOUR_WINDOW) next = { ...next, fiveHour: used }
    else if (minutes === WEEKLY_WINDOW) next = { ...next, weekly: used }
  }
  return next
}

/** Text of a user message, or null when it is an injected context block. */
function readPrompt(payload: Record<string, unknown>): string | null {
  if (payload.type !== 'message' || payload.role !== 'user') return null
  const content = payload.content
  if (!Array.isArray(content)) return null

  const text = content
    .map((part) =>
      typeof part === 'object' && part !== null
        ? ((part as Record<string, unknown>).text ?? (part as Record<string, unknown>).input_text)
        : null,
    )
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .trim()

  if (!text || INJECTED_BLOCK.test(text) || INJECTED_AGENTS_FILE.test(text)) return null
  return text
}

function delta(before: number | null, after: number | null): UsageLimitDelta {
  // A limit window that reset mid-prompt reads lower afterwards; report the
  // movement as unknown rather than a negative consumption.
  const used = before !== null && after !== null && after >= before ? after - before : null
  return { before, after, used }
}

/** Prompt being accumulated while its model requests stream in. */
interface PendingPrompt {
  prompt: string
  timestamp: string
  before: RateSnapshot
  model: string | null
  effort: string | null
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  requests: number
  endedAt: string
}

export function parseCodexSession(fileName: string, content: string): PromptUsage[] {
  const entries: PromptUsage[] = []
  let sessionId = fileName
  let cwd: string | null = null
  let model: string | null = null
  let effort: string | null = null
  let rate: RateSnapshot = EMPTY_RATE
  let pending: PendingPrompt | null = null

  const flush = (): void => {
    if (!pending) return
    const { projectCwd, terminalId } = splitRoleCwd(cwd)
    entries.push({
      id: `${fileName}#${entries.length}`,
      timestamp: pending.timestamp,
      sessionId,
      cwd,
      model: pending.model,
      effort: pending.effort,
      prompt: pending.prompt,
      branch: null,
      requests: pending.requests,
      endedAt: pending.endedAt,
      origin: terminalId ? 'iao' : 'external',
      terminalId,
      terminalTitle: null,
      projectCwd,
      inputTokens: pending.inputTokens,
      cachedInputTokens: pending.cachedInputTokens,
      outputTokens: pending.outputTokens,
      reasoningOutputTokens: pending.reasoningOutputTokens,
      totalTokens: pending.totalTokens,
      fiveHour: delta(pending.before.fiveHour, rate.fiveHour),
      weekly: delta(pending.before.weekly, rate.weekly),
    })
    pending = null
  }

  for (const line of content.split('\n')) {
    if (!line.trim()) continue

    let event: Record<string, unknown>
    try {
      event = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    const payload = (event.payload ?? {}) as Record<string, unknown>
    const timestamp = typeof event.timestamp === 'string' ? event.timestamp : ''
    rate = readRate(payload, rate)

    if (event.type === 'session_meta') {
      if (typeof payload.session_id === 'string') sessionId = payload.session_id
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      continue
    }

    if (event.type === 'turn_context') {
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      if (typeof payload.model === 'string') model = payload.model
      if (typeof payload.effort === 'string') effort = payload.effort
      continue
    }

    if (event.type === 'response_item') {
      const prompt = readPrompt(payload)
      if (prompt === null) continue
      // A new prompt closes the previous one at the current rate reading.
      flush()
      pending = {
        prompt,
        timestamp,
        before: rate,
        model,
        effort,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        requests: 0,
        endedAt: timestamp,
      }
      continue
    }

    if (event.type === 'event_msg' && payload.type === 'token_count' && pending) {
      const info = (payload.info ?? {}) as Record<string, unknown>
      const last = (info.last_token_usage ?? {}) as Record<string, unknown>
      pending.inputTokens += toNumber(last.input_tokens)
      pending.cachedInputTokens += toNumber(last.cached_input_tokens)
      pending.outputTokens += toNumber(last.output_tokens)
      pending.reasoningOutputTokens += toNumber(last.reasoning_output_tokens)
      pending.totalTokens += toNumber(last.total_tokens)
      pending.requests += 1
      if (timestamp) pending.endedAt = timestamp
    }
  }

  flush()
  return entries
}
