// Local-day helpers shared by the usage sources. Agent logs stamp UTC, while a
// "day" in the report is the user's own calendar day.
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Local calendar day (`YYYY-MM-DD`) of an instant, '' when unparseable. */
export function localDay(value: string | number | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Move a `YYYY-MM-DD` day by whole days, staying in local time. */
export function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return localDay(new Date(year, month - 1, date + offset))
}

/** Local midnight that starts a `YYYY-MM-DD` day, as epoch millis. */
export function startOfDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).getTime()
}
