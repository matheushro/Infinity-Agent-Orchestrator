// Roll-ups over parsed prompt entries (any agent): day totals and per-session lines.
// Pure functions — no filesystem, no Electron.
import type { PromptUsage, SessionUsage, UsageTotals } from '@shared/types/usage'

export function totalsOf(entries: PromptUsage[]): UsageTotals {
  return entries.reduce<UsageTotals>(
    (acc, entry) => ({
      prompts: acc.prompts + 1,
      inputTokens: acc.inputTokens + entry.inputTokens,
      cachedInputTokens: acc.cachedInputTokens + entry.cachedInputTokens,
      outputTokens: acc.outputTokens + entry.outputTokens,
      totalTokens: acc.totalTokens + entry.totalTokens,
      percentUsed: acc.percentUsed + (entry.fiveHour.used ?? 0),
      percentWeeklyUsed: acc.percentWeeklyUsed + (entry.weekly.used ?? 0),
    }),
    {
      prompts: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      percentUsed: 0,
      percentWeeklyUsed: 0,
    },
  )
}

/** One line per session, ordered by most recent activity first. */
export function sessionsOf(entries: PromptUsage[]): SessionUsage[] {
  const bySession = new Map<string, SessionUsage>()

  for (const entry of entries) {
    const current = bySession.get(entry.sessionId)
    if (!current) {
      bySession.set(entry.sessionId, {
        sessionId: entry.sessionId,
        cwd: entry.cwd,
        projectCwd: entry.projectCwd,
        model: entry.model,
        origin: entry.origin,
        terminalId: entry.terminalId,
        terminalTitle: entry.terminalTitle,
        prompts: 1,
        totalTokens: entry.totalTokens,
        percentUsed: entry.fiveHour.used ?? 0,
        percentWeeklyUsed: entry.weekly.used ?? 0,
        firstAt: entry.timestamp,
        lastAt: entry.timestamp,
      })
      continue
    }

    current.prompts += 1
    current.totalTokens += entry.totalTokens
    current.percentUsed += entry.fiveHour.used ?? 0
    current.percentWeeklyUsed += entry.weekly.used ?? 0
    current.model = entry.model ?? current.model
    current.terminalTitle = entry.terminalTitle ?? current.terminalTitle
    if (entry.timestamp < current.firstAt) current.firstAt = entry.timestamp
    if (entry.timestamp > current.lastAt) current.lastAt = entry.timestamp
  }

  return [...bySession.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}
