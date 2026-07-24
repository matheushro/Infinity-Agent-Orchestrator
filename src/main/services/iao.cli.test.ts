import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as realPath from 'path'
import vm from 'vm'

// The in-terminal CLI talks to the bridge purely through files (the agent
// sandbox blocks connect()). These tests run the bundled CLI source in a vm
// with a mocked `fs`: when the CLI renames a `<id>.req` into place we play the
// role of the bridge, materializing the matching `<id>.res` from a queued
// response. The CLI then polls and parses it exactly as in production.

type ResponseSpec = {
  /** Buffered JSON reply. */
  statusCode?: number
  body?: unknown
  /** Streaming reply (POST /send wait): NDJSON text the bridge would emit. */
  chunks?: string[]
}

type RpcCall = {
  method: string
  path: string
  body: unknown
  token: string
}

class ExitSignal extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`)
    this.name = 'ExitSignal'
  }
}

function extractCliSource(): string {
  const servicePath = join(process.cwd(), 'src/main/services/iao.service.ts')
  const file = readFileSync(servicePath, 'utf8')
  const startMarker = 'const CLI_JS_SOURCE = `'
  const start = file.indexOf(startMarker)
  if (start < 0) throw new Error('CLI_JS_SOURCE not found')
  const startIndex = start + startMarker.length
  const endIndex = file.lastIndexOf('`')
  if (endIndex < startIndex) throw new Error('CLI_JS_SOURCE terminator not found')
  const raw = file.slice(startIndex, endIndex)
  return Function(`"use strict"; return \`${raw}\`;`)()
}

function removeAutoRun(source: string): string {
  const autoRunIndex = source.lastIndexOf('\nmain().catch(')
  if (autoRunIndex < 0) throw new Error('auto-run call not found')
  return source.slice(0, autoRunIndex)
}

/** Translate a queued response spec into the NDJSON `.res` file the bridge writes. */
function resFileFor(spec: ResponseSpec): string {
  if (spec.chunks) {
    const joined = spec.chunks.join('')
    let out = ''
    for (const raw of joined.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      out += JSON.stringify({ t: 'event', d: JSON.parse(line) }) + '\n'
    }
    out += JSON.stringify({ t: 'end', status: spec.statusCode ?? 200 }) + '\n'
    return out
  }
  const status = spec.statusCode ?? 200
  const body = spec.body ?? {}
  return (
    JSON.stringify({ t: 'response', status, body }) + '\n' +
    JSON.stringify({ t: 'end', status }) + '\n'
  )
}

function makeFsMock(responses: ResponseSpec[]) {
  const files = new Map<string, string>()
  const rpcCalls: RpcCall[] = []
  const queue = [...responses]

  const fs = {
    writeFileSync: vi.fn((p: unknown, data: unknown) => {
      files.set(String(p), String(data))
    }),
    renameSync: vi.fn((from: unknown, to: unknown) => {
      const f = String(from)
      const t = String(to)
      const data = files.get(f)
      files.delete(f)
      if (data !== undefined) files.set(t, data)
      // A rename into `<id>.req` is the CLI handing us a request. Act as the
      // bridge: record it and drop the matching `<id>.res` for the CLI to read.
      if (t.endsWith('.req') && data !== undefined) {
        let reqObj: { method?: string; path?: string; body?: unknown; token?: string } = {}
        try { reqObj = JSON.parse(data) } catch { /* malformed */ }
        rpcCalls.push({
          method: reqObj.method ?? '',
          path: reqObj.path ?? '',
          body: reqObj.body,
          token: reqObj.token ?? ''
        })
        const spec = queue.shift()
        if (!spec) throw new Error('missing mocked bridge response')
        const resPath = t.slice(0, -'.req'.length) + '.res'
        files.set(resPath, resFileFor(spec))
      }
    }),
    readFileSync: vi.fn((p: unknown) => {
      const v = files.get(String(p))
      if (v === undefined) {
        const err = new Error('ENOENT') as Error & { code: string }
        err.code = 'ENOENT'
        throw err
      }
      return v
    }),
    unlinkSync: vi.fn((p: unknown) => { files.delete(String(p)) })
  }

  return { fs, rpcCalls }
}

async function loadCli(options: {
  argv?: string[]
  env?: Record<string, string | undefined>
  responses?: ResponseSpec[]
}) {
  const stdout: string[] = []
  const stderr: string[] = []
  const { fs, rpcCalls } = makeFsMock(options.responses ?? [])

  const processMock = {
    argv: options.argv ?? ['node', 'iao'],
    env: options.env ?? {},
    execPath: '/fake/node',
    stdout: { write: (chunk: string | Buffer) => { stdout.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)); return true } },
    stderr: { write: (chunk: string | Buffer) => { stderr.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)); return true } },
    exit: (code?: number) => { throw new ExitSignal(code ?? 1) }
  }

  const consoleMock = {
    log: (...args: unknown[]) => {
      stdout.push(`${args.map(String).join(' ')}\n`)
    },
    error: (...args: unknown[]) => {
      stderr.push(`${args.map(String).join(' ')}\n`)
    }
  }

  const source = removeAutoRun(extractCliSource())
  const script = `${source}\n;globalThis.__iaoTestExports = { main, request, streamSendWait, postSend, printAgents, helpText }`

  const context = vm.createContext({
    Buffer,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    clearInterval,
    clearTimeout,
    console: consoleMock,
    isNaN,
    parseInt,
    process: processMock,
    require: (id: string) => {
      if (id === 'fs') return fs
      if (id === 'path') return realPath
      throw new Error(`unexpected require: ${id}`)
    },
    setInterval,
    setTimeout,
    clearImmediate,
    setImmediate
  })

  vm.runInContext(script, context, { filename: 'cli.cjs' })
  const exports = (context as unknown as { __iaoTestExports: {
    main: () => Promise<void>
    request: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: unknown }>
    streamSendWait: (body: Record<string, unknown>, onEvent: (event: unknown) => void) => Promise<{ status: number }>
    postSend: (body: Record<string, unknown>) => Promise<{ status: number; body: unknown }>
    printAgents: (list: Array<{ title: string; command?: string }>) => void
    helpText: () => string
  } }).__iaoTestExports

  return {
    ...exports,
    stdout: () => stdout.join(''),
    stderr: () => stderr.join(''),
    rpcCalls,
    runMain: async () => {
      try {
        await exports.main()
      } catch (err) {
        if (!(err instanceof ExitSignal)) throw err
      }
    }
  }
}

const ENV = { IAO_RPC_DIR: '/tmp/iao-rpc-test', IAO_TOKEN: 'test-token' }

afterEach(() => {
  vi.clearAllMocks()
})

describe('CLI bundle', () => {
  it('writes a request file with method, path and bearer token from env', async () => {
    const cli = await loadCli({
      env: {
        IAO_RPC_DIR: '/tmp/iao-rpc-test',
        IAO_TOKEN: 'test-token',
        IAO_NODE_ID: 'node-self',
        IAO_CLI: '/custom/bin/iao'
      },
      responses: [{ statusCode: 200, body: { self: { nodeId: 'node-self', title: 'Self' }, agents: [] } }],
      argv: ['node', 'iao', 'agents']
    })

    await cli.request('GET', '/agents')

    expect(cli.rpcCalls).toHaveLength(1)
    expect(cli.rpcCalls[0]).toMatchObject({
      method: 'GET',
      path: '/agents',
      token: 'test-token'
    })
  })

  it('prints help for no args, -h, and --help without touching the spool', async () => {
    const noArgs = await loadCli({ argv: ['node', 'iao'] })
    const shortHelp = await loadCli({ argv: ['node', 'iao', '-h'] })
    const longHelp = await loadCli({ argv: ['node', 'iao', '--help'] })

    await noArgs.runMain()
    await shortHelp.runMain()
    await longHelp.runMain()

    expect(noArgs.stdout()).toContain('iao — Infinity Agent Orchestrator in-terminal CLI')
    expect(noArgs.stdout()).toContain('Usage:')
    expect(shortHelp.stdout()).toContain('iao send "Agent Name" "prompt"')
    expect(longHelp.stdout()).toContain('iao debug                                  Show diagnostic info about the bridge')
    expect(noArgs.rpcCalls).toHaveLength(0)
    expect(shortHelp.rpcCalls).toHaveLength(0)
    expect(longHelp.rpcCalls).toHaveLength(0)
  })

  it('lists linked agents and formats title plus command', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { self: { nodeId: 'self', title: 'Self' }, agents: [
        { id: 'a1', title: 'Alpha', command: 'claude' },
        { id: 'b1', title: 'Beta', command: 'codex' }
      ] } }],
      argv: ['node', 'iao', 'agents']
    })

    await cli.runMain()

    expect(cli.stdout()).toMatch(/Alpha\s+· claude/)
    expect(cli.stdout()).toMatch(/Beta\s+· codex/)
    expect(cli.rpcCalls[0]).toMatchObject({ method: 'GET', path: '/agents' })
  })

  it('prints the empty-list hint when no linked agents are available', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { self: { nodeId: 'self', title: 'Self' }, agents: [] } }],
      argv: ['node', 'iao', 'agents']
    })

    await cli.runMain()

    expect(cli.stdout()).toContain('(no linked agents — connect this terminal to another on the canvas first)')
  })

  it('requires target and prompt for send', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      argv: ['node', 'iao', 'send', 'Beta']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('iao: usage: iao send [--no-wait] [--timeout <s>] [--quiet] "Agent Name" "prompt"')
  })

  it('concatenates multi-word prompts and prints the delivery confirmation with the resolved title', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{
        statusCode: 200,
        body: {
          delivered: true,
          target: { id: 'node-beta', title: 'Beta Agent' }
        }
      }],
      argv: ['node', 'iao', 'send', '--no-wait', 'Beta', 'hello', 'from', 'the', 'bundle']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0].body).toMatchObject({
      target: 'Beta',
      prompt: 'hello from the bundle'
    })
    expect(cli.stdout()).toContain('Delivered to "Beta Agent". Run: iao inspect "Beta Agent" to read the reply.')
    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/send' })
  })

  it('parses NDJSON from the bridge and emits send wait events in order', async () => {
    const events: unknown[] = []
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{
        statusCode: 200,
        chunks: [
          '{"type":"sent","target":{"id":"node-beta","title":"Beta Agent"},"timeoutMs":120000,"idleMs":3000}\n{"type":"status","elapsedMs":1500,"bytes":12,"idleFor":750,"seenActivity":true}\n',
          '{"type":"result","target":{"id":"node-beta","title":"Beta Agent"},"output":"reply body","bytes":10,"timedOut":false,"elapsedMs":3500}\n'
        ]
      }]
    })

    const result = await cli.streamSendWait({ target: 'Beta', prompt: 'hello', wait: true, timeoutMs: 120000 }, (event) => {
      events.push(event)
    })

    expect(result.status).toBe(200)
    expect(events).toEqual([
      { type: 'sent', target: { id: 'node-beta', title: 'Beta Agent' }, timeoutMs: 120000, idleMs: 3000 },
      { type: 'status', elapsedMs: 1500, bytes: 12, idleFor: 750, seenActivity: true },
      { type: 'result', target: { id: 'node-beta', title: 'Beta Agent' }, output: 'reply body', bytes: 10, timedOut: false, elapsedMs: 3500 }
    ])
    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/send' })
    expect(cli.rpcCalls[0].body).toMatchObject({ target: 'Beta', wait: true })
  })

  it('prints inspect output or the fallback message when the buffer is empty', async () => {
    const populated = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { target: { id: 'node-beta', title: 'Beta Agent' }, output: 'line one', bytes: 8 } }],
      argv: ['node', 'iao', 'inspect', 'Beta Agent']
    })
    const empty = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { target: { id: 'node-beta', title: 'Beta Agent' }, output: '', bytes: 0 } }],
      argv: ['node', 'iao', 'inspect', 'Beta Agent']
    })

    await populated.runMain()
    await empty.runMain()

    expect(populated.stdout()).toContain('line one\n')
    expect(empty.stdout()).toContain('(no output captured yet for "Beta Agent")')
  })

  it('prints debug output with the self record, spool dir, paths, and env state', async () => {
    const cli = await loadCli({
      env: {
        IAO_RPC_DIR: '/tmp/iao-rpc-test',
        IAO_TOKEN: 'test-token',
        IAO_NODE_ID: 'node-self',
        IAO_CLI: '/custom/bin/iao'
      },
      responses: [{
        statusCode: 200,
        body: {
          self: { nodeId: 'node-self', title: 'Self Terminal' },
          spool: '/tmp/iao-rpc-test',
          cli: {
            bin: '/bundle/iao',
            script: '/bundle/cli.cjs',
            nodeBin: '/fake/node'
          },
          linked: [{ id: 'node-beta', title: 'Beta Agent', command: 'claude' }],
          buffered_bytes: 99
        }
      }],
      argv: ['node', 'iao', 'debug']
    })

    await cli.runMain()

    expect(cli.stdout()).toContain('current terminal : Self Terminal')
    expect(cli.stdout()).toContain('node id          : node-self')
    expect(cli.stdout()).toContain('rpc spool dir    : /tmp/iao-rpc-test')
    expect(cli.stdout()).toContain('iao binary       : /custom/bin/iao')
    expect(cli.stdout()).toContain('node binary      : /fake/node')
    expect(cli.stdout()).toContain('cli script       : /bundle/cli.cjs')
    expect(cli.stdout()).toContain('buffered output  : 99 bytes')
    expect(cli.stdout()).toContain('linked agents    :')
    expect(cli.stdout()).toContain('  - Beta Agent · claude')
    expect(cli.stdout()).toContain('env IAO_NODE_ID  : node-self')
    expect(cli.stdout()).toContain('env IAO_TOKEN    : (set, 10 chars)')
  })

  it('exits 2 with a clear message when IAO_RPC_DIR or IAO_TOKEN is missing', async () => {
    const cli = await loadCli({
      env: { IAO_RPC_DIR: '/tmp/iao-rpc-test' },
      argv: ['node', 'iao', 'agents']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('iao: not inside an IAO terminal (missing IAO_RPC_DIR/IAO_TOKEN).')
  })

  it('exits 1 for unknown commands', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      argv: ['node', 'iao', 'what-is-this']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('iao: unknown command "what-is-this". Try: iao help')
  })

  it('note list prints linked note titles', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { notes: [{ id: 'n1', title: 'Alpha' }, { id: 'n2', title: 'Beta' }] } }],
      argv: ['node', 'iao', 'note', 'list']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'GET', path: '/notes/list' })
    expect(cli.stdout()).toContain('Alpha')
    expect(cli.stdout()).toContain('Beta')
  })

  it('note list prints the empty hint when no notes are linked', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { notes: [] } }],
      argv: ['node', 'iao', 'note', 'list']
    })
    await cli.runMain()
    expect(cli.stdout()).toContain('(no notes linked to this terminal')
  })

  it('note create posts the joined content and confirms with the resolved title', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'My Title' } } }],
      argv: ['node', 'iao', 'note', 'create', '# My Title', 'and body']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/notes/create' })
    expect(cli.rpcCalls[0].body).toEqual({ content: '# My Title and body' })
    expect(cli.stdout()).toContain('Created note "My Title" (linked to this terminal).')
  })

  it('note read prints the body of a linked note', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'Plan' }, content: 'hello\nworld' } }],
      argv: ['node', 'iao', 'note', 'read', 'Plan']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'GET', path: '/notes/read?target=Plan' })
    expect(cli.stdout()).toContain('hello\nworld')
  })

  it('note read peels trailing numeric args into a start/end line range', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'Plan' }, content: 'line two\nline three' } }],
      argv: ['node', 'iao', 'note', 'read', 'Plan', '2', '3']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0].path).toBe('/notes/read?target=Plan&start=2&end=3')
  })

  it('note write posts target and content', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'Plan' }, bytes: 9 } }],
      argv: ['node', 'iao', 'note', 'write', 'Plan', 'new body']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/notes/write' })
    expect(cli.rpcCalls[0].body).toEqual({ target: 'Plan', content: 'new body' })
    expect(cli.stdout()).toContain('Wrote 9 bytes to "Plan".')
  })

  it('note edit posts target/old/new and reports replacement count', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'Plan' }, replaced: 2 } }],
      argv: ['node', 'iao', 'note', 'edit', 'Plan', 'foo', 'bar']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/notes/edit' })
    expect(cli.rpcCalls[0].body).toEqual({ target: 'Plan', old: 'foo', new: 'bar' })
    expect(cli.stdout()).toContain('Replaced 2 occurrence(s) in "Plan".')
  })

  it('note rename posts the old and new names', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'Roadmap' } } }],
      argv: ['node', 'iao', 'note', 'rename', 'Plan', 'Roadmap']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/notes/rename' })
    expect(cli.rpcCalls[0].body).toEqual({ target: 'Plan', name: 'Roadmap' })
    expect(cli.stdout()).toContain('Renamed note to "Roadmap".')
  })

  it('note delete posts the target name', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { deleted: true, note: { id: 'n1', title: 'Plan' } } }],
      argv: ['node', 'iao', 'note', 'delete', 'Plan']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/notes/delete' })
    expect(cli.rpcCalls[0].body).toEqual({ target: 'Plan' })
    expect(cli.stdout()).toContain('Deleted note "Plan".')
  })

  it('note link posts the note and agent names and confirms the share', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'Plan' }, agent: { id: 'a1', title: 'Beta' }, alreadyLinked: false } }],
      argv: ['node', 'iao', 'note', 'link', 'Plan', 'Beta']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/notes/link' })
    expect(cli.rpcCalls[0].body).toEqual({ target: 'Plan', agent: 'Beta' })
    expect(cli.stdout()).toContain('Shared note "Plan" with "Beta"')
  })

  it('note link reports when the note is already shared', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'Plan' }, agent: { id: 'a1', title: 'Beta' }, alreadyLinked: true } }],
      argv: ['node', 'iao', 'note', 'link', 'Plan', 'Beta']
    })

    await cli.runMain()

    expect(cli.stdout()).toContain('is already shared with "Beta".')
  })

  it('note unlink posts the note and agent names and confirms the revoke', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 200, body: { note: { id: 'n1', title: 'Plan' }, agent: { id: 'a1', title: 'Beta' }, unlinked: true } }],
      argv: ['node', 'iao', 'note', 'unlink', 'Plan', 'Beta']
    })

    await cli.runMain()

    expect(cli.rpcCalls[0]).toMatchObject({ method: 'POST', path: '/notes/unlink' })
    expect(cli.rpcCalls[0].body).toEqual({ target: 'Plan', agent: 'Beta' })
    expect(cli.stdout()).toContain('Unshared note "Plan" from "Beta".')
  })

  it('note link requires both a note name and an agent name', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      argv: ['node', 'iao', 'note', 'link', 'Plan']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('usage: iao note link "Note Name" "Agent Name"')
    expect(cli.rpcCalls).toHaveLength(0)
  })

  it('note read surfaces the access-denied error from the bridge', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 403, body: { error: 'access denied: no note named "Plan" is linked to this terminal.' } }],
      argv: ['node', 'iao', 'note', 'read', 'Plan']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('iao: access denied: no note named "Plan" is linked to this terminal.')
  })

  it('rejects an unknown note subcommand', async () => {
    const cli = await loadCli({
      env: { ...ENV },
      argv: ['node', 'iao', 'note', 'frobnicate']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('iao: unknown note subcommand "frobnicate"')
    expect(cli.rpcCalls).toHaveLength(0)
  })

  it('propagates bridge errors from body.error or falls back to http <status>', async () => {
    const bodyError = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 503, body: { error: 'bridge unavailable' } }],
      argv: ['node', 'iao', 'agents']
    })
    const fallbackStatus = await loadCli({
      env: { ...ENV },
      responses: [{ statusCode: 500, body: {} }],
      argv: ['node', 'iao', 'inspect', 'Beta Agent']
    })

    await bodyError.runMain()
    await fallbackStatus.runMain()

    expect(bodyError.stderr()).toContain('iao: bridge unavailable')
    expect(fallbackStatus.stderr()).toContain('iao: http 500')
  })
})
