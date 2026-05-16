import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { join } from 'path'
import vm from 'vm'

type HttpResponseSpec = {
  statusCode?: number
  body?: unknown
  chunks?: string[]
  error?: Error
}

type RequestCall = {
  options: Record<string, unknown>
  body: string
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

function makeHttpMock(responses: HttpResponseSpec[]) {
  const calls: RequestCall[] = []
  const queue = [...responses]

  const request = vi.fn((options: Record<string, unknown>, callback: (res: EventEmitter) => void) => {
    const call: RequestCall = { options, body: '' }
    calls.push(call)

    const req = new EventEmitter() as EventEmitter & {
      write: (chunk: string | Buffer) => boolean
      end: () => void
      destroy: () => void
    }

    req.write = (chunk: string | Buffer) => {
      call.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      return true
    }

    req.destroy = () => {
      req.emit('close')
    }

    req.end = () => {
      const spec = queue.shift()
      if (!spec) throw new Error('missing mocked http response')
      if (spec.error) {
        req.emit('error', spec.error)
        return
      }

      const res = new EventEmitter() as EventEmitter & {
        statusCode: number
        setEncoding: (encoding: string) => void
      }
      res.statusCode = spec.statusCode ?? 200
      res.setEncoding = vi.fn()

      callback(res)

      if (spec.body !== undefined) {
        const text = typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body)
        res.emit('data', Buffer.from(text, 'utf8'))
      }

      for (const chunk of spec.chunks ?? []) {
        res.emit('data', chunk)
      }

      res.emit('end')
    }

    return req
  })

  return { request, calls }
}

async function loadCli(options: {
  argv?: string[]
  env?: Record<string, string | undefined>
  responses?: HttpResponseSpec[]
}) {
  const stdout: string[] = []
  const stderr: string[] = []
  const http = makeHttpMock(options.responses ?? [])

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
      if (id === 'http') return { request: http.request }
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
    httpCalls: http.calls,
    runMain: async () => {
      try {
        await exports.main()
      } catch (err) {
        if (!(err instanceof ExitSignal)) throw err
      }
    }
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('CLI bundle', () => {
  it('boots the local HTTP client on 127.0.0.1 with the bearer token from env', async () => {
    const cli = await loadCli({
      env: {
        IAO_PORT: '4312',
        IAO_TOKEN: 'test-token',
        IAO_NODE_ID: 'node-self',
        IAO_CLI: '/custom/bin/iao'
      },
      responses: [{ statusCode: 200, body: { self: { nodeId: 'node-self', title: 'Self' }, agents: [] } }],
      argv: ['node', 'iao', 'agents']
    })

    await cli.request('GET', '/agents')

    expect(cli.httpCalls).toHaveLength(1)
    expect(cli.httpCalls[0].options).toMatchObject({
      host: '127.0.0.1',
      port: 4312,
      method: 'GET',
      path: '/agents'
    })
    expect((cli.httpCalls[0].options.headers as Record<string, string>).authorization).toBe('Bearer test-token')
  })

  it('prints help for no args, -h, and --help without hitting http', async () => {
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
    expect(noArgs.httpCalls).toHaveLength(0)
    expect(shortHelp.httpCalls).toHaveLength(0)
    expect(longHelp.httpCalls).toHaveLength(0)
  })

  it('lists linked agents and formats title plus command', async () => {
    const cli = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
      responses: [{ statusCode: 200, body: { self: { nodeId: 'self', title: 'Self' }, agents: [
        { id: 'a1', title: 'Alpha', command: 'claude' },
        { id: 'b1', title: 'Beta', command: 'codex' }
      ] } }],
      argv: ['node', 'iao', 'agents']
    })

    await cli.runMain()

    expect(cli.stdout()).toMatch(/Alpha\s+· claude/)
    expect(cli.stdout()).toMatch(/Beta\s+· codex/)
    expect(cli.httpCalls[0].options).toMatchObject({ method: 'GET', path: '/agents' })
  })

  it('prints the empty-list hint when no linked agents are available', async () => {
    const cli = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
      responses: [{ statusCode: 200, body: { self: { nodeId: 'self', title: 'Self' }, agents: [] } }],
      argv: ['node', 'iao', 'agents']
    })

    await cli.runMain()

    expect(cli.stdout()).toContain('(no linked agents — connect this terminal to another on the canvas first)')
  })

  it('requires target and prompt for send', async () => {
    const cli = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
      argv: ['node', 'iao', 'send', 'Beta']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('iao: usage: iao send [--no-wait] [--timeout <s>] [--quiet] "Agent Name" "prompt"')
  })

  it('concatenates multi-word prompts and prints the delivery confirmation with the resolved title', async () => {
    const cli = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
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

    expect(JSON.parse(cli.httpCalls[0].body)).toMatchObject({
      target: 'Beta',
      prompt: 'hello from the bundle'
    })
    expect(cli.stdout()).toContain('Delivered to "Beta Agent". Run: iao inspect "Beta Agent" to read the reply.')
    expect(cli.httpCalls[0].options).toMatchObject({ method: 'POST', path: '/send' })
  })

  it('parses NDJSON from the bridge and emits send wait events in order', async () => {
    const events: unknown[] = []
    const cli = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
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
    expect(cli.httpCalls[0].options).toMatchObject({
      method: 'POST',
      path: '/send',
      host: '127.0.0.1',
      port: 4312
    })
    expect((cli.httpCalls[0].options.headers as Record<string, string>).accept).toBe('application/x-ndjson')
  })

  it('prints inspect output or the fallback message when the buffer is empty', async () => {
    const populated = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
      responses: [{ statusCode: 200, body: { target: { id: 'node-beta', title: 'Beta Agent' }, output: 'line one', bytes: 8 } }],
      argv: ['node', 'iao', 'inspect', 'Beta Agent']
    })
    const empty = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
      responses: [{ statusCode: 200, body: { target: { id: 'node-beta', title: 'Beta Agent' }, output: '', bytes: 0 } }],
      argv: ['node', 'iao', 'inspect', 'Beta Agent']
    })

    await populated.runMain()
    await empty.runMain()

    expect(populated.stdout()).toContain('line one\n')
    expect(empty.stdout()).toContain('(no output captured yet for "Beta Agent")')
  })

  it('prints debug output with the self record, port, paths, and env state', async () => {
    const cli = await loadCli({
      env: {
        IAO_PORT: '4312',
        IAO_TOKEN: 'test-token',
        IAO_NODE_ID: 'node-self',
        IAO_CLI: '/custom/bin/iao'
      },
      responses: [{
        statusCode: 200,
        body: {
          self: { nodeId: 'node-self', title: 'Self Terminal' },
          port: 4312,
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
    expect(cli.stdout()).toContain('bridge port      : 127.0.0.1:4312')
    expect(cli.stdout()).toContain('iao binary       : /custom/bin/iao')
    expect(cli.stdout()).toContain('node binary      : /fake/node')
    expect(cli.stdout()).toContain('cli script       : /bundle/cli.cjs')
    expect(cli.stdout()).toContain('buffered output  : 99 bytes')
    expect(cli.stdout()).toContain('linked agents    :')
    expect(cli.stdout()).toContain('  - Beta Agent · claude')
    expect(cli.stdout()).toContain('env IAO_NODE_ID  : node-self')
    expect(cli.stdout()).toContain('env IAO_TOKEN    : (set, 10 chars)')
  })

  it('exits 2 with a clear message when IAO_PORT or IAO_TOKEN is missing', async () => {
    const cli = await loadCli({
      env: { IAO_PORT: '4312' },
      argv: ['node', 'iao', 'agents']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('iao: not inside an IAO terminal (missing IAO_PORT/IAO_TOKEN).')
  })

  it('exits 1 for unknown commands', async () => {
    const cli = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
      argv: ['node', 'iao', 'what-is-this']
    })

    await cli.runMain()

    expect(cli.stderr()).toContain('iao: unknown command "what-is-this". Try: iao help')
  })

  it('propagates HTTP errors from body.error or falls back to http <status>', async () => {
    const bodyError = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
      responses: [{ statusCode: 503, body: { error: 'bridge unavailable' } }],
      argv: ['node', 'iao', 'agents']
    })
    const fallbackStatus = await loadCli({
      env: { IAO_PORT: '4312', IAO_TOKEN: 'test-token' },
      responses: [{ statusCode: 500, body: {} }],
      argv: ['node', 'iao', 'inspect', 'Beta Agent']
    })

    await bodyError.runMain()
    await fallbackStatus.runMain()

    expect(bodyError.stderr()).toContain('iao: bridge unavailable')
    expect(fallbackStatus.stderr()).toContain('iao: http 500')
  })
})
