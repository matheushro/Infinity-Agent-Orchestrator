// Client-side roll-ups for the reports screen. Used when a filter (e.g. one
// terminal) narrows the day's prompts and the main-process totals no longer
// match what is on screen. Pure — no React, no window.
import type { PromptUsage, UsageTotals } from '@shared/types/usage'

const EMPTY_TOTALS: UsageTotals = {
  prompts: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  percentUsed: 0,
  percentWeeklyUsed: 0,
}

/** Re-derive the day's totals from an already-filtered list of prompts. */
export function sumTotals(entries: PromptUsage[]): UsageTotals {
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
    { ...EMPTY_TOTALS },
  )
}

export interface TerminalOption {
  /** Canvas terminal id — the filter value. */
  id: string
  /** Display name: the terminal's title when known, else a short id. */
  label: string
  /** Prompts this terminal sent in the reported day. */
  prompts: number
}

/**
 * Distinct IAO terminals that sent at least one prompt in the day, so the user
 * can narrow the report to a single canvas terminal. Newest activity first.
 */
export function terminalOptions(entries: PromptUsage[]): TerminalOption[] {
  const byId = new Map<string, TerminalOption>()
  for (const entry of entries) {
    if (entry.origin !== 'iao' || !entry.terminalId) continue
    const existing = byId.get(entry.terminalId)
    if (existing) {
      existing.prompts += 1
      if (!existing.label.startsWith('Terminal ') && entry.terminalTitle) {
        existing.label = entry.terminalTitle
      }
      continue
    }
    byId.set(entry.terminalId, {
      id: entry.terminalId,
      label: entry.terminalTitle ?? `Terminal ${entry.terminalId.slice(0, 6)}`,
      prompts: 1,
    })
  }
  return [...byId.values()].sort((a, b) => b.prompts - a.prompts)
}
