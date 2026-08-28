// Where Codex keeps its logs: `<root>/YYYY/MM/DD/rollout-*.jsonl`.
import { homedir } from 'os'
import { join } from 'path'
import { listDirectory } from './usageFs'
import { localDay, shiftDay } from './usageDay'

export function resolveCodexRoot(root?: string): string {
  const trimmed = root?.trim()
  return trimmed ? trimmed : join(homedir(), '.codex', 'sessions')
}

/** Days that have a `YYYY/MM/DD` folder in the sessions root, newest first. */
export function listCodexDays(root: string): string[] {
  const days = new Set<string>([localDay()])

  for (const year of listDirectory(root)) {
    if (!/^\d{4}$/.test(year)) continue
    for (const month of listDirectory(join(root, year))) {
      if (!/^\d{2}$/.test(month)) continue
      for (const day of listDirectory(join(root, year, month))) {
        if (/^\d{2}$/.test(day)) days.add(`${year}-${month}-${day}`)
      }
    }
  }

  return [...days].sort((a, b) => b.localeCompare(a))
}

/** `.jsonl` files stored under the folder of one day. */
function filesOfDayFolder(root: string, day: string): string[] {
  const [year, month, date] = day.split('-')
  const dir = join(root, year, month, date)
  return listDirectory(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => join(dir, name))
}

/**
 * Session files that may hold prompts of `day`. A session started late keeps
 * logging past midnight (and the folder name is local while timestamps are
 * UTC), so the neighbouring folders are scanned too; entries are filtered by
 * their own local day afterwards.
 */
export function codexFilesForDay(root: string, day: string): string[] {
  return [shiftDay(day, -1), day, shiftDay(day, 1)].flatMap((candidate) =>
    filesOfDayFolder(root, candidate),
  )
}
