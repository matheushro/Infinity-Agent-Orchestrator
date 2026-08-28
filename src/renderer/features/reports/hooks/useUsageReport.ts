// Owns the usage report shown by the reports screen: which agent and day are
// being looked at, the loaded report, and the live refresh while it is open.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UsageAgent, UsageReport } from '@shared/types/usage'
import { usageRepository } from '../services/usageRepository'
import { localDay, shiftDay } from '../lib/format'

/** How often an open report re-reads the logs while live refresh is on. */
export const REFRESH_INTERVAL_MS = 5000

export interface UseUsageReportResult {
  day: string
  setDay: (day: string) => void
  /** Days that have logs, newest first — always includes the selected day. */
  days: string[]
  report: UsageReport | null
  /** True while the first read of a day is in flight (no rows to show yet). */
  loading: boolean
  /** True while any read is in flight, including live refreshes. */
  fetching: boolean
  /** Keep only prompts sent from an IAO terminal. */
  onlyIao: boolean
  setOnlyIao: (value: boolean) => void
  error: string | null
  live: boolean
  setLive: (value: boolean) => void
  refresh: () => void
  stepDay: (offset: number) => void
}

export function useUsageReport(
  agent: UsageAgent,
  initialDay: string = localDay(),
): UseUsageReportResult {
  const [day, setDay] = useState(initialDay)
  const [days, setDays] = useState<string[]>([initialDay])
  const [report, setReport] = useState<UsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(true)
  const [onlyIao, setOnlyIao] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(true)
  const [tick, setTick] = useState(0)
  // Only the first load of a day (or of a changed filter) blanks the table;
  // live refreshes keep the current rows so the list does not flash every few
  // seconds.
  const loadedKey = useRef<string | null>(null)
  const key = `${agent}|${day}|${onlyIao}`

  const refresh = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    let canceled = false
    void usageRepository
      .days(agent)
      .then((rows) => {
        if (!canceled) setDays(rows.length ? rows : [initialDay])
      })
      .catch(() => undefined)
    return () => {
      canceled = true
    }
  }, [agent, initialDay, tick])

  useEffect(() => {
    let canceled = false
    if (loadedKey.current !== key) setLoading(true)
    setFetching(true)

    void usageRepository
      .report(agent, day, onlyIao)
      .then((result) => {
        if (canceled) return
        loadedKey.current = key
        setReport(result)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (canceled) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (canceled) return
        setLoading(false)
        setFetching(false)
      })

    return () => {
      canceled = true
    }
  }, [agent, day, onlyIao, tick])

  useEffect(() => {
    if (!live) return
    const id = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [live, refresh])

  const stepDay = useCallback((offset: number) => {
    setDay((current) => shiftDay(current, offset))
  }, [])

  const dayOptions = days.includes(day) ? days : [day, ...days].sort((a, b) => b.localeCompare(a))

  return {
    day,
    setDay,
    days: dayOptions,
    report,
    loading,
    fetching,
    onlyIao,
    setOnlyIao,
    error,
    live,
    setLive,
    refresh,
    stepDay,
  }
}
