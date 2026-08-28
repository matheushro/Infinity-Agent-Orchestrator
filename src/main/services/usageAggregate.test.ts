import { describe, it, expect } from 'vitest'
import type { PromptUsage } from '@shared/types/usage'
import { sessionsOf, totalsOf } from './usageAggregate'

function entry(overrides: Partial<PromptUsage> = {}): PromptUsage {
  return {
    id: 'a#0',
    timestamp: '2026-08-28T12:00:00.000Z',
    sessionId: 'sess-1',
    cwd: '/repos/app',
    model: 'gpt-5.6-sol',
    effort: 'medium',
    prompt: 'oi',
    requests: 2,
    endedAt: '2026-08-28T12:00:30.000Z',
    origin: 'iao',
    terminalId: 'term-1',
    terminalTitle: 'API Codex',
    projectCwd: '/repos/app',
    inputTokens: 100,
    cachedInputTokens: 40,
    outputTokens: 10,
    reasoningOutputTokens: 4,
    totalTokens: 110,
    fiveHour: { before: 10, after: 12, used: 2 },
    weekly: { before: 30, after: 31, used: 1 },
    ...overrides,
  }
}

describe('totalsOf', () => {
  it('soma tokens e o consumo de 5h de todos os prompts', () => {
    expect(totalsOf([entry(), entry({ id: 'a#1', totalTokens: 90, inputTokens: 80 })])).toEqual({
      prompts: 2,
      inputTokens: 180,
      cachedInputTokens: 80,
      outputTokens: 20,
      totalTokens: 200,
      percentUsed: 4,
      percentWeeklyUsed: 2,
    })
  })

  it('trata consumo desconhecido como zero e lista vazia como zeros', () => {
    expect(totalsOf([entry({ fiveHour: { before: null, after: null, used: null } })]).percentUsed).toBe(0)
    expect(totalsOf([]).prompts).toBe(0)
  })
})

describe('sessionsOf', () => {
  it('agrupa por sessão com intervalo e totais', () => {
    const sessions = sessionsOf([
      entry({ id: 'a#0', timestamp: '2026-08-28T12:00:00.000Z' }),
      entry({ id: 'a#1', timestamp: '2026-08-28T13:00:00.000Z', totalTokens: 40 }),
      entry({
        id: 'b#0',
        sessionId: 'sess-2',
        cwd: '/repos/other',
        timestamp: '2026-08-28T09:00:00.000Z',
      }),
    ])

    expect(sessions.map((s) => s.sessionId)).toEqual(['sess-1', 'sess-2'])
    expect(sessions[0]).toMatchObject({
      prompts: 2,
      totalTokens: 150,
      percentUsed: 4,
      percentWeeklyUsed: 2,
      terminalTitle: 'API Codex',
      firstAt: '2026-08-28T12:00:00.000Z',
      lastAt: '2026-08-28T13:00:00.000Z',
    })
  })
})
