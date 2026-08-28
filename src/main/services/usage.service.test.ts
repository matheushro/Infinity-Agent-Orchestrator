import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---- boundary mocks: a tiny virtual filesystem ----

const fsState = vi.hoisted(() => ({
  dirs: new Map<string, string[]>(),
  files: new Map<string, { content: string; modifiedAt: number }>(),
}))

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn((path: string) => fsState.dirs.has(path) || fsState.files.has(path)),
  readdirSync: vi.fn((path: string) => {
    const entries = fsState.dirs.get(path)
    if (!entries) throw new Error(`ENOENT: ${path}`)
    return entries
  }),
  statSync: vi.fn((path: string) => {
    if (fsState.dirs.has(path)) return { isDirectory: () => true, mtimeMs: 0 }
    const file = fsState.files.get(path)
    if (file) return { isDirectory: () => false, mtimeMs: file.modifiedAt }
    throw new Error(`ENOENT: ${path}`)
  }),
  readFileSync: vi.fn((path: string) => {
    const file = fsState.files.get(path)
    if (!file) throw new Error(`ENOENT: ${path}`)
    return file.content
  }),
}))

vi.mock('fs', () => ({ default: mockFs, ...mockFs }))
vi.mock('os', () => ({ default: { homedir: () => '/home/tester' }, homedir: () => '/home/tester' }))
vi.mock('./db.service', () => ({
  getTerminal: vi.fn((id: string) => (id === 'term-7' ? { id, title: 'API Codex' } : undefined)),
}))

import { getUsageReport, listUsageDays, resolveUsageRoot } from './usage.service'

const CODEX_ROOT = '/logs/codex'
const CLAUDE_ROOT = '/logs/claude'

/** ISO instant for a given local wall-clock time — keeps tests timezone-proof. */
function at(year: number, month: number, day: number, hour: number): string {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString()
}

function codexSession(
  prompts: { text: string; timestamp: string; tokens: number }[],
  cwd = '/repos/app',
): string {
  const lines = [
    JSON.stringify({
      type: 'session_meta',
      timestamp: prompts[0]?.timestamp,
      payload: { session_id: `sess-${prompts[0]?.text}`, cwd },
    }),
  ]
  for (const prompt of prompts) {
    lines.push(
      JSON.stringify({
        timestamp: prompt.timestamp,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: prompt.text }],
        },
      }),
      JSON.stringify({
        timestamp: prompt.timestamp,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: { input_tokens: prompt.tokens, total_tokens: prompt.tokens } },
          rate_limits: { primary: { window_minutes: 300, used_percent: 10 } },
        },
      }),
    )
  }
  return lines.join('\n')
}

function claudeSession(
  prompts: { text: string; timestamp: string; tokens: number }[],
  cwd = '/repos/app',
): string {
  const lines: string[] = []
  for (const prompt of prompts) {
    lines.push(
      JSON.stringify({
        type: 'user',
        timestamp: prompt.timestamp,
        sessionId: 'claude-sess-1',
        cwd,
        gitBranch: 'main',
        message: { role: 'user', content: prompt.text },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: prompt.timestamp,
        sessionId: 'claude-sess-1',
        cwd,
        message: {
          id: `msg-${prompt.text}`,
          model: 'claude-opus-5',
          usage: { input_tokens: prompt.tokens, output_tokens: 10 },
        },
      }),
    )
  }
  return lines.join('\n')
}

function addFile(path: string, content: string, modifiedAt = Date.now()): void {
  fsState.files.set(path, { content, modifiedAt })
  const dir = path.slice(0, path.lastIndexOf('/'))
  const name = path.slice(path.lastIndexOf('/') + 1)
  const parts = dir.split('/')
  for (let i = 1; i < parts.length; i += 1) {
    const current = parts.slice(0, i + 1).join('/')
    const parent = parts.slice(0, i).join('/') || '/'
    const child = parts[i]
    fsState.dirs.set(current, fsState.dirs.get(current) ?? [])
    const siblings = fsState.dirs.get(parent) ?? []
    if (!siblings.includes(child)) fsState.dirs.set(parent, [...siblings, child])
  }
  const names = fsState.dirs.get(dir) ?? []
  if (!names.includes(name)) fsState.dirs.set(dir, [...names, name])
}

/** Local millis for a wall-clock time, used as an mtime. */
function mtime(year: number, month: number, day: number, hour: number): number {
  return new Date(year, month - 1, day, hour).getTime()
}

beforeEach(() => {
  fsState.dirs.clear()
  fsState.files.clear()
  vi.clearAllMocks()
})

describe('resolveUsageRoot', () => {
  it('usa a pasta padrão de cada agente', () => {
    expect(resolveUsageRoot('codex')).toBe('/home/tester/.codex/sessions')
    expect(resolveUsageRoot('claude')).toBe('/home/tester/.claude/projects')
  })

  it('respeita a pasta informada', () => {
    expect(resolveUsageRoot('codex', CODEX_ROOT)).toBe(CODEX_ROOT)
    expect(resolveUsageRoot('claude', '  ')).toBe('/home/tester/.claude/projects')
  })
})

describe('getUsageReport — codex', () => {
  it('sinaliza pasta inexistente sem quebrar', () => {
    const report = getUsageReport({ agent: 'codex', root: '/nao/existe', day: '2026-08-28' })

    expect(report.missingRoot).toBe(true)
    expect(report.entries).toEqual([])
    expect(report.totals.prompts).toBe(0)
  })

  it('lista os prompts do dia com totais e agrupamento por sessão', () => {
    addFile(
      `${CODEX_ROOT}/2026/08/28/rollout-a.jsonl`,
      codexSession([
        { text: 'primeiro', timestamp: at(2026, 8, 28, 9), tokens: 100 },
        { text: 'segundo', timestamp: at(2026, 8, 28, 10), tokens: 200 },
      ]),
    )

    const report = getUsageReport({ agent: 'codex', root: CODEX_ROOT, day: '2026-08-28' })

    expect(report.agent).toBe('codex')
    expect(report.hasLimits).toBe(true)
    expect(report.entries.map((e) => e.prompt)).toEqual(['primeiro', 'segundo'])
    expect(report.totals).toMatchObject({ prompts: 2, totalTokens: 300 })
    expect(report.sessions).toHaveLength(1)
  })

  it('inclui prompts da madrugada gravados na pasta do dia anterior', () => {
    addFile(
      `${CODEX_ROOT}/2026/08/27/rollout-b.jsonl`,
      codexSession([
        { text: 'ontem à noite', timestamp: at(2026, 8, 27, 23), tokens: 10 },
        { text: 'já é hoje', timestamp: at(2026, 8, 28, 1), tokens: 20 },
      ]),
    )

    const report = getUsageReport({ agent: 'codex', root: CODEX_ROOT, day: '2026-08-28' })

    expect(report.entries.map((e) => e.prompt)).toEqual(['já é hoje'])
    expect(report.totals.totalTokens).toBe(20)
  })

  it('ignora arquivos que não são sessões .jsonl', () => {
    addFile(`${CODEX_ROOT}/2026/08/28/notas.txt`, 'nada a ver')

    expect(getUsageReport({ agent: 'codex', root: CODEX_ROOT, day: '2026-08-28' }).entries).toEqual(
      [],
    )
    expect(mockFs.readFileSync).not.toHaveBeenCalled()
  })

  it('cai para o dia de hoje quando o dia informado é inválido', () => {
    const report = getUsageReport({ agent: 'codex', root: CODEX_ROOT, day: 'ontem' })

    expect(report.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('getUsageReport — claude', () => {
  it('lê os transcripts do dia, sem percentuais de limite', () => {
    addFile(
      `${CLAUDE_ROOT}/-repos-app/sess-1.jsonl`,
      claudeSession([
        { text: 'ajusta o layout', timestamp: at(2026, 8, 28, 9), tokens: 100 },
        { text: 'roda os testes', timestamp: at(2026, 8, 28, 10), tokens: 50 },
      ]),
      mtime(2026, 8, 28, 11),
    )

    const report = getUsageReport({ agent: 'claude', root: CLAUDE_ROOT, day: '2026-08-28' })

    expect(report.agent).toBe('claude')
    expect(report.hasLimits).toBe(false)
    expect(report.entries.map((e) => e.prompt)).toEqual(['ajusta o layout', 'roda os testes'])
    expect(report.entries[0]).toMatchObject({
      model: 'claude-opus-5',
      branch: 'main',
      requests: 1,
      totalTokens: 110,
    })
    expect(report.totals).toMatchObject({ prompts: 2, percentUsed: 0 })
  })

  it('ignora transcripts escritos antes do dia pedido', () => {
    addFile(
      `${CLAUDE_ROOT}/-repos-app/antigo.jsonl`,
      claudeSession([{ text: 'semana passada', timestamp: at(2026, 8, 20, 9), tokens: 100 }]),
      mtime(2026, 8, 20, 10),
    )

    const report = getUsageReport({ agent: 'claude', root: CLAUDE_ROOT, day: '2026-08-28' })

    expect(report.entries).toEqual([])
    expect(mockFs.readFileSync).not.toHaveBeenCalled()
  })

  it('vincula o prompt ao terminal do IAO pelo diretório de role', () => {
    addFile(
      `${CLAUDE_ROOT}/-repos-app--iao-roles-term-7/sess-2.jsonl`,
      claudeSession(
        [{ text: 'do terminal', timestamp: at(2026, 8, 28, 9), tokens: 100 }],
        '/repos/app/.iao/roles/term-7',
      ),
      mtime(2026, 8, 28, 10),
    )

    const [entry] = getUsageReport({ agent: 'claude', root: CLAUDE_ROOT, day: '2026-08-28' }).entries

    expect(entry).toMatchObject({
      origin: 'iao',
      terminalId: 'term-7',
      terminalTitle: 'API Codex',
      projectCwd: '/repos/app',
    })
  })
})

describe('listUsageDays', () => {
  it('lista os dias das pastas do Codex, mais recentes primeiro, incluindo hoje', () => {
    addFile(`${CODEX_ROOT}/2026/08/27/rollout-a.jsonl`, '')
    addFile(`${CODEX_ROOT}/2026/08/28/rollout-b.jsonl`, '')
    addFile(`${CODEX_ROOT}/leia-me.md`, '')

    const days = listUsageDays('codex', CODEX_ROOT)

    expect(days).toContain('2026-08-27')
    expect(days).toContain('2026-08-28')
    expect(days).toEqual([...days].sort((a, b) => b.localeCompare(a)))
  })

  it('lista os dias do Claude pela data de modificação dos transcripts', () => {
    addFile(`${CLAUDE_ROOT}/-repos-app/sess-1.jsonl`, '', mtime(2026, 8, 26, 15))

    expect(listUsageDays('claude', CLAUDE_ROOT)).toContain('2026-08-26')
  })

  it('retorna apenas o dia de hoje quando a pasta não existe', () => {
    expect(listUsageDays('codex', '/nao/existe')).toHaveLength(1)
    expect(listUsageDays('claude', '/nao/existe')).toHaveLength(1)
  })
})
