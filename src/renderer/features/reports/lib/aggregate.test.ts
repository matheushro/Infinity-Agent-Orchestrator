import { describe, expect, it } from 'vitest'
import type { PromptUsage } from '@shared/types/usage'
import { sumTotals, terminalOptions } from './aggregate'

function prompt(overrides: Partial<PromptUsage> = {}): PromptUsage {
  return {
    id: 'a#0',
    timestamp: new Date(2026, 7, 28, 9, 0).toISOString(),
    sessionId: 's1',
    cwd: null,
    model: 'gpt-5.6',
    effort: null,
    branch: null,
    prompt: 'oi',
    requests: 2,
    endedAt: new Date(2026, 7, 28, 9, 1).toISOString(),
    origin: 'external',
    terminalId: null,
    terminalTitle: null,
    projectCwd: '/home/dev/repos/app',
    inputTokens: 100,
    cachedInputTokens: 40,
    outputTokens: 10,
    reasoningOutputTokens: 0,
    totalTokens: 110,
    fiveHour: { before: 1, after: 3, used: 2 },
    weekly: { before: 10, after: 11, used: 1 },
    ...overrides,
  }
}

describe('sumTotals', () => {
  it('soma tokens e percentuais das entradas filtradas', () => {
    const totals = sumTotals([prompt(), prompt({ inputTokens: 50, outputTokens: 5, totalTokens: 55 })])
    expect(totals.prompts).toBe(2)
    expect(totals.inputTokens).toBe(150)
    expect(totals.totalTokens).toBe(165)
    expect(totals.percentUsed).toBe(4)
    expect(totals.percentWeeklyUsed).toBe(2)
  })

  it('trata percentuais desconhecidos como zero', () => {
    const totals = sumTotals([prompt({ fiveHour: { before: null, after: null, used: null } })])
    expect(totals.percentUsed).toBe(0)
  })
})

describe('terminalOptions', () => {
  it('lista os terminais do IAO com a contagem de prompts, mais ativos primeiro', () => {
    const options = terminalOptions([
      prompt({ origin: 'iao', terminalId: 't1', terminalTitle: 'API' }),
      prompt({ origin: 'iao', terminalId: 't1', terminalTitle: 'API' }),
      prompt({ origin: 'iao', terminalId: 't2', terminalTitle: 'Web' }),
      prompt({ origin: 'external', terminalId: null }),
    ])
    expect(options).toEqual([
      { id: 't1', label: 'API', prompts: 2 },
      { id: 't2', label: 'Web', prompts: 1 },
    ])
  })

  it('usa um id curto quando o terminal não tem título', () => {
    const options = terminalOptions([
      prompt({ origin: 'iao', terminalId: 'abcdef123456', terminalTitle: null }),
    ])
    expect(options[0].label).toBe('Terminal abcdef')
  })
})
