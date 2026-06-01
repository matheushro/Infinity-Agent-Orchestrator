import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { writeFileSync, renameSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

// Integration test for the FILESYSTEM RPC relay — the transport the in-terminal
// CLI actually uses, because the agent sandbox blocks connect(). Unlike
// iao.service.test.ts (which mocks fs and drives the handlers over the socket),
// here fs is REAL: we drop request files into the spool dir exactly like the
// sandboxed CLI would, and assert the relay writes back correct response files.

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() }
  // BrowserWindow intentionally absent — broadcastNotesChanged tolerates it.
}))

vi.mock('./db.service', () => ({
  listEdges: vi.fn(() => []),
  listActiveTerminals: vi.fn(() => []),
  getTerminal: vi.fn(() => undefined),
  listNotesForTerminal: vi.fn(() => []),
  upsertNote: vi.fn(),
  linkNoteToTerminal: vi.fn(),
  removeNote: vi.fn()
}))

vi.mock('./pty.service', () => ({ writeToPty: vi.fn() }))

import * as dbService from './db.service'
import {
  startIaoServer,
  stopIaoServer,
  registerPtySession,
  appendOutput
} from './iao.service'

const mockListEdges = vi.mocked(dbService.listEdges)
const mockListActive = vi.mocked(dbService.listActiveTerminals)

function makeTerminal(id: string, title: string) {
  return {
    id, title, command: 'claude', active: 1, shell: 'default' as const,
    cwd: '/p', x: 0, y: 0, width: 800, height: 600,
    created_at: '2024-01-01T00:00:00.000Z'
  }
}

interface FileRpcResult {
  status: number
  body: any
  events: any[]
}

/** Mirror the bundled CLI: drop `<id>.req`, then tail `<id>.res`. */
async function fileRpc(
  rpcDir: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 4000
): Promise<FileRpcResult> {
  const id = `t-${randomBytes(5).toString('hex')}`
  const reqPath = join(rpcDir, `${id}.req`)
  const resPath = join(rpcDir, `${id}.res`)
  writeFileSync(`${reqPath}.tmp`, JSON.stringify({ token, method, path, body: body ?? null }))
  renameSync(`${reqPath}.tmp`, reqPath)

  const start = Date.now()
  let consumed = 0
  let response: { status: number; body: any } | null = null
  const events: any[] = []
  while (Date.now() - start < timeoutMs) {
    let txt: string | null = null
    try { txt = readFileSync(resPath, 'utf8') } catch { txt = null }
    if (txt != null) {
      const lines = txt.split('\n')
      for (; consumed < lines.length - 1; consumed++) {
        const line = lines[consumed].trim()
        if (!line) continue
        const obj = JSON.parse(line)
        if (obj.t === 'event') events.push(obj.d)
        else if (obj.t === 'response') response = { status: obj.status, body: obj.body }
        else if (obj.t === 'end') {
          try { unlinkSync(resPath) } catch { /* ignore */ }
          return { status: response?.status ?? obj.status, body: response?.body ?? {}, events }
        }
      }
    }
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('fileRpc timed out waiting for response file')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListEdges.mockReturnValue([])
  mockListActive.mockReturnValue([])
})

afterEach(async () => {
  await stopIaoServer()
})

describe('filesystem RPC relay', () => {
  it('exposes a spool dir via IAO_RPC_DIR and answers a buffered request', async () => {
    await startIaoServer()
    const env = registerPtySession('pty-1', 'node-1')
    expect(env.IAO_RPC_DIR).toContain('iao-rpc-')
    mockListActive.mockReturnValue([makeTerminal('node-1', 'Self')])

    const res = await fileRpc(env.IAO_RPC_DIR, env.IAO_TOKEN, 'GET', '/agents')

    expect(res.status).toBe(200)
    expect(res.body.self.nodeId).toBe('node-1')
    expect(res.body.agents).toEqual([])
  })

  it('rejects a bad token with 401 through the relay', async () => {
    await startIaoServer()
    const env = registerPtySession('pty-1', 'node-1')

    const res = await fileRpc(env.IAO_RPC_DIR, 'not-the-token', 'GET', '/agents')

    expect(res.status).toBe(401)
  })

  it('answers 400 for a malformed request file', async () => {
    await startIaoServer()
    const env = registerPtySession('pty-1', 'node-1')
    const id = `t-${randomBytes(5).toString('hex')}`
    const reqPath = join(env.IAO_RPC_DIR, `${id}.req`)
    const resPath = join(env.IAO_RPC_DIR, `${id}.res`)
    writeFileSync(`${reqPath}.tmp`, 'not-json{')
    renameSync(`${reqPath}.tmp`, reqPath)

    // Tail the response the same way the CLI would.
    const start = Date.now()
    let body: any = null
    while (Date.now() - start < 3000 && !body) {
      try {
        const txt = readFileSync(resPath, 'utf8')
        const first = txt.split('\n').find((l) => l.trim())
        if (first) body = JSON.parse(first)
      } catch { /* not ready */ }
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(body?.status).toBe(400)
  })

  it('streams /send wait events (sent → result) as NDJSON event lines', async () => {
    await startIaoServer()
    const envA = registerPtySession('pty-A', 'node-A')
    registerPtySession('pty-B', 'node-B')
    mockListEdges.mockReturnValue([{ id: 'e', source: 'node-A', target: 'node-B', created_at: '2024' }])
    mockListActive.mockReturnValue([
      makeTerminal('node-A', 'Alpha'),
      makeTerminal('node-B', 'Beta')
    ])

    const pending = fileRpc(envA.IAO_RPC_DIR, envA.IAO_TOKEN, 'POST', '/send', {
      target: 'Beta', prompt: 'hi', wait: true, idleMs: 400, heartbeatMs: 5000, timeoutMs: 3000
    })
    // Produce target output shortly after the prompt is delivered.
    setTimeout(() => appendOutput('node-B', 'reply chunk'), 200)

    const res = await pending
    expect(res.status).toBe(200)
    expect(res.events.find((e) => e.type === 'sent')?.target.title).toBe('Beta')
    const result = res.events.find((e) => e.type === 'result')
    expect(result?.timedOut).toBe(false)
    expect(result?.output).toContain('reply chunk')
  })
})
