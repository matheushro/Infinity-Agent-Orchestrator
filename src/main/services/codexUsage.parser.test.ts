import { describe, it, expect } from 'vitest'
import { parseCodexSession } from './codexUsage.parser'

function line(event: unknown): string {
  return JSON.stringify(event)
}

function userPrompt(text: string, timestamp = '2026-08-28T12:00:00.000Z'): string {
  return line({
    timestamp,
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  })
}

function tokenCount(
  usage: Record<string, number>,
  rate?: { fiveHour?: number; weekly?: number },
): string {
  return line({
    timestamp: '2026-08-28T12:00:05.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { last_token_usage: usage },
      rate_limits: rate
        ? {
            primary: { window_minutes: 300, used_percent: rate.fiveHour ?? 0 },
            secondary: { window_minutes: 10080, used_percent: rate.weekly ?? 0 },
          }
        : undefined,
    },
  })
}

const meta = line({
  timestamp: '2026-08-28T11:59:00.000Z',
  type: 'session_meta',
  payload: { session_id: 'sess-1', cwd: '/repos/app' },
})

const turnContext = line({
  timestamp: '2026-08-28T11:59:01.000Z',
  type: 'turn_context',
  payload: { model: 'gpt-5.6-sol', effort: 'medium' },
})

describe('parseCodexSession', () => {
  it('emite uma entrada por prompt com tokens e metadados da sessão', () => {
    const content = [
      meta,
      turnContext,
      userPrompt('ajusta o layout'),
      tokenCount({ input_tokens: 100, cached_input_tokens: 40, output_tokens: 10, total_tokens: 110 }),
    ].join('\n')

    const [entry, ...rest] = parseCodexSession('/logs/a.jsonl', content)

    expect(rest).toEqual([])
    expect(entry).toMatchObject({
      sessionId: 'sess-1',
      cwd: '/repos/app',
      model: 'gpt-5.6-sol',
      effort: 'medium',
      prompt: 'ajusta o layout',
      inputTokens: 100,
      cachedInputTokens: 40,
      outputTokens: 10,
      totalTokens: 110,
    })
  })

  it('soma todas as requisições disparadas por um mesmo prompt', () => {
    const content = [
      meta,
      userPrompt('roda os testes'),
      tokenCount({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }),
      tokenCount({ input_tokens: 200, output_tokens: 20, total_tokens: 220 }),
    ].join('\n')

    expect(parseCodexSession('/logs/a.jsonl', content)[0]).toMatchObject({
      inputTokens: 300,
      outputTokens: 30,
      totalTokens: 330,
    })
  })

  it('calcula o percentual antes/depois e o consumo da janela de 5h', () => {
    const content = [
      meta,
      tokenCount({ total_tokens: 1 }, { fiveHour: 10, weekly: 30 }),
      userPrompt('primeiro'),
      tokenCount({ total_tokens: 50 }, { fiveHour: 13.5, weekly: 31 }),
      userPrompt('segundo', '2026-08-28T12:10:00.000Z'),
      tokenCount({ total_tokens: 50 }, { fiveHour: 15, weekly: 32 }),
    ].join('\n')

    const [first, second] = parseCodexSession('/logs/a.jsonl', content)

    expect(first.fiveHour).toEqual({ before: 10, after: 13.5, used: 3.5 })
    expect(second.fiveHour).toEqual({ before: 13.5, after: 15, used: 1.5 })
    expect(second.weekly).toEqual({ before: 31, after: 32, used: 1 })
  })

  it('reporta consumo desconhecido quando a janela reseta no meio', () => {
    const content = [
      meta,
      tokenCount({ total_tokens: 1 }, { fiveHour: 90 }),
      userPrompt('depois do reset'),
      tokenCount({ total_tokens: 10 }, { fiveHour: 2 }),
    ].join('\n')

    expect(parseCodexSession('/logs/a.jsonl', content)[0].fiveHour).toEqual({
      before: 90,
      after: 2,
      used: null,
    })
  })

  it('ignora blocos de contexto injetados como mensagem de usuário', () => {
    const content = [
      meta,
      userPrompt('<environment_context>\ncwd: /repos/app\n</environment_context>'),
      userPrompt('prompt de verdade'),
      tokenCount({ total_tokens: 10 }),
    ].join('\n')

    const entries = parseCodexSession('/logs/a.jsonl', content)

    expect(entries).toHaveLength(1)
    expect(entries[0].prompt).toBe('prompt de verdade')
  })

  it('ignora o AGENTS.md injetado como mensagem de usuário', () => {
    const content = [
      meta,
      userPrompt('# AGENTS.md instructions for /repos/app\n\nSempre rode os testes.'),
      userPrompt('prompt de verdade'),
      tokenCount({ total_tokens: 10 }),
    ].join('\n')

    const entries = parseCodexSession('/logs/a.jsonl', content)

    expect(entries).toHaveLength(1)
    expect(entries[0].prompt).toBe('prompt de verdade')
  })

  it('mantém o prompt mesmo sem token_count e ignora linhas inválidas', () => {
    const content = [meta, 'not json', '', userPrompt('sem resposta ainda')].join('\n')

    const entries = parseCodexSession('/logs/a.jsonl', content)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ prompt: 'sem resposta ainda', totalTokens: 0 })
  })

  it('retorna vazio para um arquivo sem prompts', () => {
    expect(parseCodexSession('/logs/a.jsonl', [meta, turnContext].join('\n'))).toEqual([])
    expect(parseCodexSession('/logs/a.jsonl', '')).toEqual([])
  })
})
