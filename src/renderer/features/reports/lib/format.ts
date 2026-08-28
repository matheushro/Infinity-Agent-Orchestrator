// Display helpers for the usage tables. Pure — no React, no window.

/** Local calendar day (`YYYY-MM-DD`) of a date, defaulting to now. */
export function localDay(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Move a `YYYY-MM-DD` day by whole days, staying in local time. */
export function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return localDay(new Date(year, month - 1, date + offset))
}

/** True when the `YYYY-MM-DD` day is later than today (local). */
export function isFutureDay(day: string, today: string = localDay()): boolean {
  return day > today
}

/** Clamp a `YYYY-MM-DD` day so it never lands after today (local). */
export function clampDay(day: string, today: string = localDay()): string {
  return day > today ? today : day
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

/** `HH:MM` in the user's timezone. */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Last two path segments, enough to recognise a project. */
export function shortPath(cwd: string | null): string {
  if (!cwd) return '—'
  return cwd.split('/').filter(Boolean).slice(-2).join('/') || cwd
}

/** `DD/MM/YYYY HH:MM:SS` in the user's timezone. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

/** Human duration between two instants, e.g. `1m 12s`. */
export function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—'
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/** Share of the input tokens served from cache, e.g. `62%`. */
export function cacheHitRate(input: number, cached: number): string {
  if (input <= 0) return '—'
  return `${Math.round((cached / input) * 100)}%`
}
