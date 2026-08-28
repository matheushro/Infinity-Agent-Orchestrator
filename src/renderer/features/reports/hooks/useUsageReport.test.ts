import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageReport } from '@shared/types/usage'
import { REFRESH_INTERVAL_MS, useUsageReport } from './useUsageReport'

const days = vi.fn()
const report_ = vi.fn()

function report(day: string): UsageReport {
  return {
    agent: 'codex',
    day,
    hasLimits: true,
    root: '/logs',
    missingRoot: false,
    entries: [],
    sessions: [],
    totals: {
      prompts: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      percentUsed: 0,
      percentWeeklyUsed: 0,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  days.mockResolvedValue(['2026-08-28', '2026-08-27'])
  report_.mockImplementation(async ({ day }: { day: string }) => report(day))
  ;(window as unknown as { usageApi: unknown }).usageApi = { days, report: report_ }
})

describe('useUsageReport', () => {
  it('carrega o relatório do dia inicial e a lista de dias', async () => {
    const { result } = renderHook(() => useUsageReport('codex', '2026-08-28'))

    await waitFor(() => expect(result.current.report?.day).toBe('2026-08-28'))
    expect(result.current.loading).toBe(false)
    expect(result.current.days).toEqual(['2026-08-28', '2026-08-27'])
    expect(report_).toHaveBeenCalledWith({ agent: 'codex', day: '2026-08-28', onlyIao: false })
  })

  it('recarrega ao trocar de dia e ao andar para trás', async () => {
    const { result } = renderHook(() => useUsageReport('codex', '2026-08-28'))
    await waitFor(() => expect(result.current.report).not.toBeNull())

    act(() => result.current.stepDay(-1))

    await waitFor(() => expect(result.current.day).toBe('2026-08-27'))
    await waitFor(() => expect(report_).toHaveBeenCalledWith({ agent: 'codex', day: '2026-08-27', onlyIao: false }))
  })

  it('inclui o dia selecionado na lista mesmo sem logs registrados', async () => {
    const { result } = renderHook(() => useUsageReport('codex', '2026-08-28'))
    await waitFor(() => expect(result.current.report).not.toBeNull())

    act(() => result.current.setDay('2026-01-01'))

    await waitFor(() => expect(result.current.days[0]).toBe('2026-08-28'))
    expect(result.current.days).toContain('2026-01-01')
  })

  it('atualiza sozinho enquanto o modo tempo real está ligado', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useUsageReport('codex', '2026-08-28'))
      await vi.waitFor(() => expect(report_).toHaveBeenCalledTimes(1))

      await act(async () => {
        vi.advanceTimersByTime(REFRESH_INTERVAL_MS)
      })
      expect(report_).toHaveBeenCalledTimes(2)

      act(() => result.current.setLive(false))
      await act(async () => {
        vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3)
      })
      expect(report_).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('expõe o erro quando a leitura dos logs falha', async () => {
    report_.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useUsageReport('codex', '2026-08-28'))

    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.loading).toBe(false)
  })

  it('recarrega filtrando apenas os prompts do IAO', async () => {
    const { result } = renderHook(() => useUsageReport('codex', '2026-08-28'))
    await waitFor(() => expect(result.current.report).not.toBeNull())

    act(() => result.current.setOnlyIao(true))

    await waitFor(() =>
      expect(report_).toHaveBeenCalledWith({ agent: 'codex', day: '2026-08-28', onlyIao: true }),
    )
  })

  it('recarrega ao trocar de agente', async () => {
    const { rerender, result } = renderHook(({ agent }) => useUsageReport(agent, '2026-08-28'), {
      initialProps: { agent: 'codex' as const },
    })
    await waitFor(() => expect(result.current.report).not.toBeNull())

    rerender({ agent: 'claude' as unknown as 'codex' })

    await waitFor(() =>
      expect(report_).toHaveBeenCalledWith({
        agent: 'claude',
        day: '2026-08-28',
        onlyIao: false,
      }),
    )
    expect(days).toHaveBeenCalledWith('claude')
  })
})
