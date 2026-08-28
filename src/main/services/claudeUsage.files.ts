// Where Claude Code keeps its logs: `<root>/<project-slug>/<session-id>.jsonl`.
// Nothing in the layout encodes a date, so days come from file mtimes and a
// day's candidate files are the ones last written at or after its midnight.
import { homedir } from 'os'
import { join } from 'path'
import { listDirectory, modifiedAt } from './usageFs'
import { localDay, startOfDay } from './usageDay'

export function resolveClaudeRoot(root?: string): string {
  const trimmed = root?.trim()
  return trimmed ? trimmed : join(homedir(), '.claude', 'projects')
}

/** Every transcript under the root, with its last-modified time. */
function transcripts(root: string): { path: string; modifiedAt: number }[] {
  const files: { path: string; modifiedAt: number }[] = []

  for (const project of listDirectory(root)) {
    const dir = join(root, project)
    for (const name of listDirectory(dir)) {
      if (!name.endsWith('.jsonl')) continue
      const path = join(dir, name)
      const mtime = modifiedAt(path)
      if (mtime !== null) files.push({ path, modifiedAt: mtime })
    }
  }

  return files
}

/**
 * Days that have transcripts, newest first. Derived from mtimes: a session that
 * spanned several days is only listed under the day it was last written to —
 * picking such a day in the UI still reports it correctly, since the day filter
 * runs on the prompts' own timestamps.
 */
export function listClaudeDays(root: string): string[] {
  const days = new Set<string>([localDay()])
  for (const file of transcripts(root)) days.add(localDay(file.modifiedAt))
  return [...days].sort((a, b) => b.localeCompare(a))
}

/**
 * Transcripts that may hold prompts of `day`: everything written at or after
 * that day's midnight (a file older than that cannot contain them).
 */
export function claudeFilesForDay(root: string, day: string): string[] {
  const from = startOfDay(day)
  return transcripts(root)
    .filter((file) => file.modifiedAt >= from)
    .map((file) => file.path)
}
