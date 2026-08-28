// Reads an agent's local logs and turns them into a per-day usage report.
// The logs folder is a parameter (defaulting to each agent's own) so the report
// never depends on a hardcoded machine path.
import { existsSync, readFileSync } from 'fs'
import type { PromptUsage, UsageAgent, UsageQuery, UsageReport } from '@shared/types/usage'
import { parseCodexSession } from './codexUsage.parser'
import { parseClaudeSession } from './claudeUsage.parser'
import { codexFilesForDay, listCodexDays, resolveCodexRoot } from './codexUsage.files'
import { claudeFilesForDay, listClaudeDays, resolveClaudeRoot } from './claudeUsage.files'
import { sessionsOf, totalsOf } from './usageAggregate'
import { DAY_PATTERN, localDay } from './usageDay'
import { getTerminal } from './db.service'

/** Everything that differs between agents lives in one of these. */
interface UsageSource {
  resolveRoot: (root?: string) => string
  listDays: (root: string) => string[]
  filesForDay: (root: string, day: string) => string[]
  parse: (file: string, content: string) => PromptUsage[]
  /** Whether the agent's logs carry rate-limit percentages. */
  hasLimits: boolean
}

const SOURCES: Record<UsageAgent, UsageSource> = {
  codex: {
    resolveRoot: resolveCodexRoot,
    listDays: listCodexDays,
    filesForDay: codexFilesForDay,
    parse: parseCodexSession,
    hasLimits: true,
  },
  claude: {
    resolveRoot: resolveClaudeRoot,
    listDays: listClaudeDays,
    filesForDay: claudeFilesForDay,
    parse: parseClaudeSession,
    // Claude Code does not write rate-limit percentages to its transcripts.
    hasLimits: false,
  },
}

export function resolveUsageRoot(agent: UsageAgent, root?: string): string {
  return SOURCES[agent].resolveRoot(root)
}

/** Days that have logs for the agent, newest first. */
export function listUsageDays(agent: UsageAgent, root?: string): string[] {
  const source = SOURCES[agent]
  return source.listDays(source.resolveRoot(root))
}

/**
 * Terminal titles for the ids found in the logs, resolved once per report. A
 * deleted terminal simply has no title — its spend still shows up.
 */
function terminalTitles(ids: string[]): Map<string, string> {
  const titles = new Map<string, string>()
  for (const id of new Set(ids)) {
    try {
      const terminal = getTerminal(id)
      if (terminal?.title) titles.set(id, terminal.title)
    } catch {
      // The report must render even when the database is unavailable.
    }
  }
  return titles
}

export function getUsageReport(query: UsageQuery): UsageReport {
  const source = SOURCES[query.agent]
  const root = source.resolveRoot(query.root)
  const day = query.day && DAY_PATTERN.test(query.day) ? query.day : localDay()
  const empty: UsageReport = {
    agent: query.agent,
    day,
    root,
    missingRoot: !existsSync(root),
    hasLimits: source.hasLimits,
    entries: [],
    sessions: [],
    totals: totalsOf([]),
  }

  if (empty.missingRoot) return empty

  const parsed: PromptUsage[] = []
  for (const file of source.filesForDay(root, day)) {
    let content: string
    try {
      content = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    for (const entry of source.parse(file, content)) {
      if (localDay(entry.timestamp) === day) parsed.push(entry)
    }
  }

  const titles = terminalTitles(
    parsed.map((entry) => entry.terminalId).filter((id): id is string => id !== null),
  )

  const entries = parsed
    .map((entry) => ({
      ...entry,
      terminalTitle: entry.terminalId ? (titles.get(entry.terminalId) ?? null) : null,
    }))
    .filter((entry) => !query.onlyIao || entry.origin === 'iao')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  return {
    ...empty,
    entries,
    sessions: sessionsOf(entries),
    totals: totalsOf(entries),
  }
}
