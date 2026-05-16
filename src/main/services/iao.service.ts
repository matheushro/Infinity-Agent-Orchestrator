// iao bridge: local HTTP server that the in-terminal `iao` CLI talks to.
//
// Per-pty bearer tokens identify the caller; only terminals connected to the
// caller through an edge in SQLite are reachable. Nothing here is exposed
// outside 127.0.0.1.
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { EventEmitter } from 'events'
import { app } from 'electron'
import { mkdirSync, writeFileSync, chmodSync } from 'fs'
import type { TerminalRecord } from '@shared/types/terminal'
import * as dbService from './db.service'
import * as ptyService from './pty.service'

// Activity bus: fires whenever a node's output buffer grows. The /send (wait)
// handler subscribes to this instead of having the in-terminal CLI poll —
// keeping the wait loop entirely on the bridge side so agents do not burn
// tokens running sleep+inspect cycles.
const outputEvents = new EventEmitter()
outputEvents.setMaxListeners(200)

interface SessionEntry {
  ptyId: string
  nodeId: string
  token: string
}

const sessionsByToken = new Map<string, SessionEntry>()
const sessionsByPty = new Map<string, SessionEntry>()

// Per-node ring buffer of raw pty output. Keeps the last MAX_BUFFER bytes.
const MAX_BUFFER = 64 * 1024
const outputByNode = new Map<string, string>()

let server: Server | null = null
let serverPort = 0
let bundleDir = ''

export interface IaoSessionEnv {
  IAO_PORT: string
  IAO_TOKEN: string
  IAO_NODE_ID: string
  IAO_CLI: string
  IAO_NODE_BIN: string
  IAO_NODE_CLI: string
  IAO_CLI_DIR: string
}

export function appendOutput(nodeId: string, chunk: string): void {
  const existing = outputByNode.get(nodeId) ?? ''
  const next = existing + chunk
  outputByNode.set(
    nodeId,
    next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next
  )
  outputEvents.emit('change', nodeId)
}

export function clearOutput(nodeId: string): void {
  outputByNode.delete(nodeId)
}

export function registerPtySession(ptyId: string, nodeId: string): IaoSessionEnv {
  const token = randomBytes(24).toString('hex')
  const entry: SessionEntry = { ptyId, nodeId, token }
  sessionsByToken.set(token, entry)
  sessionsByPty.set(ptyId, entry)
  // Fresh session starts with an empty buffer so `inspect` does not surface
  // stale output from a previous run of the same node.
  outputByNode.set(nodeId, '')

  const { iaoBin, cliJs, dir } = ensureBundle()
  return {
    IAO_PORT: String(serverPort),
    IAO_TOKEN: token,
    IAO_NODE_ID: nodeId,
    IAO_CLI: iaoBin,
    IAO_NODE_BIN: process.execPath,
    IAO_NODE_CLI: cliJs,
    IAO_CLI_DIR: dir
  }
}

export function unregisterPtySession(ptyId: string): void {
  const entry = sessionsByPty.get(ptyId)
  if (!entry) return
  sessionsByPty.delete(ptyId)
  sessionsByToken.delete(entry.token)
}

export async function startIaoServer(): Promise<{ port: number }> {
  if (server) return { port: serverPort }
  ensureBundle()
  server = createServer(handleRequest)
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      serverPort = typeof addr === 'object' && addr ? addr.port : 0
      resolve()
    })
  })
  return { port: serverPort }
}

export async function stopIaoServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = null
  serverPort = 0
  sessionsByToken.clear()
  sessionsByPty.clear()
  outputByNode.clear()
}

function ensureBundle(): { dir: string; iaoBin: string; cliJs: string } {
  if (bundleDir) {
    return { dir: bundleDir, iaoBin: join(bundleDir, 'iao'), cliJs: join(bundleDir, 'cli.cjs') }
  }
  const dir = join(app.getPath('userData'), 'iao-cli')
  mkdirSync(dir, { recursive: true })
  const cliJs = join(dir, 'cli.cjs')
  const iaoBin = join(dir, 'iao')
  writeFileSync(cliJs, CLI_JS_SOURCE, { mode: 0o644 })
  writeFileSync(iaoBin, IAO_WRAPPER_SOURCE, { mode: 0o755 })
  try { chmodSync(iaoBin, 0o755) } catch { /* best effort */ }
  bundleDir = dir
  return { dir, iaoBin, cliJs }
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // Hard-restrict to loopback. Node's listen('127.0.0.1') already does this at
  // the bind level; the check below is defence in depth.
  const remote = req.socket.remoteAddress || ''
  if (!isLoopback(remote)) {
    return send(res, 403, { error: 'forbidden' })
  }

  const auth = req.headers['authorization'] || ''
  const match = /^Bearer\s+(.+)$/i.exec(String(auth))
  const session = match ? sessionsByToken.get(match[1].trim()) : undefined
  if (!session) return send(res, 401, { error: 'unauthorized' })

  const url = new URL(req.url || '/', 'http://localhost')
  const route = `${req.method} ${url.pathname}`

  try {
    if (route === 'GET /agents') return handleAgents(session, res)
    if (route === 'GET /inspect') return handleInspect(session, url, res)
    if (route === 'GET /debug') return handleDebug(session, res)
    if (route === 'POST /send') {
      readBody(req)
        .then((body) => {
          if (body && body.wait === true) return handleSendWait(session, body, req, res)
          return handleSend(session, body, res)
        })
        .catch((err) => send(res, 500, { error: (err as Error).message }))
      return
    }
    return send(res, 404, { error: 'not found' })
  } catch (err) {
    return send(res, 500, { error: (err as Error).message })
  }
}

function handleAgents(session: SessionEntry, res: ServerResponse): void {
  const agents = listLinkedAgents(session.nodeId)
  send(res, 200, {
    self: describeSelf(session),
    agents: agents.map((a) => ({ id: a.id, title: a.title, command: a.command }))
  })
}

function handleSend(
  session: SessionEntry,
  body: Record<string, unknown>,
  res: ServerResponse
): void {
  const targetName = String(body.target ?? '').trim()
  const prompt = String(body.prompt ?? '')
  if (!targetName) return send(res, 400, { error: 'target required' })
  if (!prompt) return send(res, 400, { error: 'prompt required' })

  const target = resolveLinkedAgent(session.nodeId, targetName)
  if (!target) return send(res, 404, { error: `no linked agent matches "${targetName}"` })

  const targetPty = findPtyForNode(target.id)
  if (!targetPty) return send(res, 409, { error: `agent "${target.title}" has no live terminal` })

  // Clear any text the target may already have in its input box (Ctrl+U),
  // then deliver the prompt wrapped in explicit bracketed-paste markers so
  // the TUI (claude/codex) knows exactly when the paste ends. Without the
  // markers the TUI auto-detects large input as a paste and the trailing
  // \r can arrive while bracketed-paste mode is still active, making the
  // TUI insert a literal newline instead of submitting. Wrapping with
  // \x1b[200~ ... \x1b[201~ lets the TUI exit paste mode on the closing
  // marker, so the \r that follows is guaranteed to be treated as Enter.
  ptyService.writeToPty(targetPty, '\x15')
  ptyService.writeToPty(targetPty, `\x1b[200~${prompt}\x1b[201~`)
  setTimeout(() => ptyService.writeToPty(targetPty, '\r'), enterDelay(prompt.length))
  send(res, 200, { delivered: true, target: { id: target.id, title: target.title } })
}

// In-flight wait sessions keyed by (caller nodeId → target nodeId). Prevents a
// caller from queuing multiple overlapping waits against the same target.
const inflightWaits = new Map<string, Set<string>>()

function inflightKey(callerId: string): Set<string> {
  let set = inflightWaits.get(callerId)
  if (!set) {
    set = new Set()
    inflightWaits.set(callerId, set)
  }
  return set
}

interface SendWaitBody {
  target?: unknown
  prompt?: unknown
  wait?: unknown
  timeoutMs?: unknown
  idleMs?: unknown
  heartbeatMs?: unknown
}

function handleSendWait(
  session: SessionEntry,
  body: SendWaitBody,
  req: IncomingMessage,
  res: ServerResponse
): void {
  const targetName = String(body.target ?? '').trim()
  const prompt = String(body.prompt ?? '')
  if (!targetName) return send(res, 400, { error: 'target required' })
  if (!prompt) return send(res, 400, { error: 'prompt required' })

  const target = resolveLinkedAgent(session.nodeId, targetName)
  if (!target) return send(res, 404, { error: `no linked agent matches "${targetName}"` })

  const targetPty = findPtyForNode(target.id)
  if (!targetPty) return send(res, 409, { error: `agent "${target.title}" has no live terminal` })

  const callerWaits = inflightKey(session.nodeId)
  if (callerWaits.has(target.id)) {
    return send(res, 429, {
      error: `already waiting on "${target.title}" from this terminal`
    })
  }

  // Clamp configuration to defensive bounds. Defaults chosen so a typical
  // coding-agent reply (which streams over seconds with brief pauses for tool
  // calls) is detected as "done" once it has been idle for ~3s.
  const timeoutMs = clampNum(body.timeoutMs, 120_000, 1_000, 30 * 60_000)
  const idleMs = clampNum(body.idleMs, 3_000, 500, 60_000)
  const heartbeatMs = clampNum(body.heartbeatMs, 2_000, 500, 30_000)

  callerWaits.add(target.id)

  // NDJSON stream: one JSON object per line. The CLI parses each line so it
  // can surface progress to the user without buffering the whole reply.
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no'
  })

  const startedAt = Date.now()
  const initialLen = (outputByNode.get(target.id) ?? '').length
  let lastActivityAt = startedAt
  let seenActivity = false
  let finished = false

  const writeLine = (obj: Record<string, unknown>): void => {
    if (res.writableEnded) return
    try { res.write(JSON.stringify(obj) + '\n') } catch { /* socket closed */ }
  }

  writeLine({
    type: 'sent',
    target: { id: target.id, title: target.title },
    initialBytes: initialLen,
    timeoutMs,
    idleMs
  })

  // Clear any pending input (Ctrl+U), then deliver the prompt wrapped in
  // explicit bracketed-paste markers — same rationale as handleSend.
  ptyService.writeToPty(targetPty, '\x15')
  ptyService.writeToPty(targetPty, `\x1b[200~${prompt}\x1b[201~`)
  const enterTimer = setTimeout(() => ptyService.writeToPty(targetPty, '\r'), enterDelay(prompt.length))

  let idleTimer: NodeJS.Timeout | null = null
  let heartbeatTimer: NodeJS.Timeout | null = null
  let masterTimer: NodeJS.Timeout | null = null

  const onChange = (changedNodeId: string): void => {
    if (changedNodeId !== target.id) return
    seenActivity = true
    lastActivityAt = Date.now()
    scheduleIdle()
  }

  const scheduleIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (finished || !seenActivity) return
      finish(false)
    }, idleMs)
  }

  const cleanup = (): void => {
    outputEvents.off('change', onChange)
    if (idleTimer) clearTimeout(idleTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    if (masterTimer) clearTimeout(masterTimer)
    clearTimeout(enterTimer)
    callerWaits.delete(target.id)
    if (callerWaits.size === 0) inflightWaits.delete(session.nodeId)
  }

  const finish = (timedOut: boolean): void => {
    if (finished) return
    finished = true
    cleanup()

    const raw = outputByNode.get(target.id) ?? ''
    const delta = raw.length >= initialLen ? raw.slice(initialLen) : raw
    writeLine({
      type: 'result',
      target: { id: target.id, title: target.title },
      output: stripAnsi(delta),
      bytes: delta.length,
      timedOut,
      elapsedMs: Date.now() - startedAt
    })
    if (!res.writableEnded) res.end()
  }

  outputEvents.on('change', onChange)

  heartbeatTimer = setInterval(() => {
    if (finished) return
    const raw = outputByNode.get(target.id) ?? ''
    const bytes = Math.max(0, raw.length - initialLen)
    writeLine({
      type: 'status',
      elapsedMs: Date.now() - startedAt,
      bytes,
      idleFor: Date.now() - lastActivityAt,
      seenActivity
    })
  }, heartbeatMs)

  masterTimer = setTimeout(() => finish(true), timeoutMs)

  // If the client (CLI) goes away, drop the wait so we do not leak listeners.
  const onClose = (): void => {
    if (finished) return
    finished = true
    cleanup()
  }
  req.on('close', onClose)
  res.on('close', onClose)
}

// Scale the Enter delay to payload size so large bracketed-paste inputs are
// fully consumed by the TUI before \r arrives. Min 50ms, max 500ms.
function enterDelay(byteLen: number): number {
  return Math.min(500, Math.max(50, Math.ceil(byteLen / 50) * 10))
}

function clampNum(input: unknown, fallback: number, min: number, max: number): number {
  const n = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function handleInspect(session: SessionEntry, url: URL, res: ServerResponse): void {
  const targetName = (url.searchParams.get('target') || '').trim()
  if (!targetName) return send(res, 400, { error: 'target required' })
  const target = resolveLinkedAgent(session.nodeId, targetName)
  if (!target) return send(res, 404, { error: `no linked agent matches "${targetName}"` })

  const raw = outputByNode.get(target.id) ?? ''
  send(res, 200, {
    target: { id: target.id, title: target.title },
    output: stripAnsi(raw),
    bytes: raw.length
  })
}

function handleDebug(session: SessionEntry, res: ServerResponse): void {
  const self = describeSelf(session)
  const agents = listLinkedAgents(session.nodeId)
  send(res, 200, {
    self,
    port: serverPort,
    cli: {
      bin: join(bundleDir, 'iao'),
      script: join(bundleDir, 'cli.cjs'),
      nodeBin: process.execPath
    },
    linked: agents.map((a) => ({ id: a.id, title: a.title, command: a.command })),
    buffered_bytes: outputByNode.get(session.nodeId)?.length ?? 0
  })
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function listLinkedAgents(callerNodeId: string): TerminalRecord[] {
  const linkedIds = new Set<string>()
  for (const edge of dbService.listEdges()) {
    if (edge.source === callerNodeId) linkedIds.add(edge.target)
    else if (edge.target === callerNodeId) linkedIds.add(edge.source)
  }
  if (linkedIds.size === 0) return []
  return dbService
    .listActiveTerminals()
    .filter((t) => linkedIds.has(t.id) && t.id !== callerNodeId)
}

function resolveLinkedAgent(callerNodeId: string, name: string): TerminalRecord | undefined {
  const candidates = listLinkedAgents(callerNodeId)
  const lower = name.toLowerCase()
  // Exact match (case-insensitive) wins; otherwise a unique substring match.
  const exact = candidates.find((t) => t.title.toLowerCase() === lower)
  if (exact) return exact
  const partial = candidates.filter((t) => t.title.toLowerCase().includes(lower))
  return partial.length === 1 ? partial[0] : undefined
}

function findPtyForNode(nodeId: string): string | undefined {
  for (const entry of sessionsByPty.values()) {
    if (entry.nodeId === nodeId) return entry.ptyId
  }
  return undefined
}

function describeSelf(session: SessionEntry): { nodeId: string; title: string | null } {
  const me = dbService.listActiveTerminals().find((t) => t.id === session.nodeId)
  return { nodeId: session.nodeId, title: me?.title ?? null }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLoopback(addr: string): boolean {
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '::ffff:127.0.0.1'
  )
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload)
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer) => {
      total += c.length
      if (total > 1_000_000) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) }
      catch { reject(new Error('invalid json body')) }
    })
    req.on('error', reject)
  })
}

// Cheap ANSI/control stripper for human-friendly `inspect` output.
// Keeps newlines and printable chars; drops CSI sequences, OSC and SOS/PM/APC.
function stripAnsi(input: string): string {
  return input
    .replace(/\x1B\][\s\S]*?(?:\x07|\x1B\\)/g, '') // OSC
    .replace(/\x1B[PX^_][\s\S]*?\x1B\\/g, '')      // DCS/SOS/PM/APC
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')        // CSI
    .replace(/\x1B[@-Z\\-_]/g, '')                   // 2-byte ESC
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

// ---------------------------------------------------------------------------
// CLI bundle sources (written to disk at startup so the in-terminal `iao`
// command can invoke them via the user's shell).
// ---------------------------------------------------------------------------

const IAO_WRAPPER_SOURCE = `#!/usr/bin/env bash
# iao — Infinity Agent Orchestrator in-terminal CLI wrapper.
# Runs the Node script through the Electron binary using ELECTRON_RUN_AS_NODE=1
# so no separate Node install is required on the host.
if [ -z "\${IAO_NODE_BIN:-}" ] || [ -z "\${IAO_NODE_CLI:-}" ]; then
  echo "iao: missing IAO_NODE_BIN / IAO_NODE_CLI — are you inside an IAO terminal?" >&2
  exit 2
fi
ELECTRON_RUN_AS_NODE=1 exec "$IAO_NODE_BIN" "$IAO_NODE_CLI" "$@"
`

const CLI_JS_SOURCE = `#!/usr/bin/env node
// iao CLI — talks to the local IAO bridge over 127.0.0.1.
// All required configuration arrives via env vars set by the main process.
'use strict'
const http = require('http')

const PORT = process.env.IAO_PORT
const TOKEN = process.env.IAO_TOKEN
const NODE_ID = process.env.IAO_NODE_ID
const CLI_PATH = process.env.IAO_CLI

function die(msg, code) {
  process.stderr.write('iao: ' + msg + '\\n')
  process.exit(code || 1)
}

function ensureSession() {
  if (!PORT || !TOKEN) die('not inside an IAO terminal (missing IAO_PORT/IAO_TOKEN).', 2)
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(PORT),
        method,
        path,
        headers: Object.assign(
          { authorization: 'Bearer ' + TOKEN },
          data ? { 'content-type': 'application/json', 'content-length': data.length } : {}
        )
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let parsed = null
          try { parsed = text ? JSON.parse(text) : {} } catch (_) { parsed = { raw: text } }
          resolve({ status: res.statusCode || 0, body: parsed })
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// Stream NDJSON from POST /send (wait mode). \`onEvent\` is invoked once per
// line; resolves with the final HTTP status when the response ends.
function streamSendWait(body, onEvent) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8')
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(PORT),
        method: 'POST',
        path: '/send',
        headers: {
          authorization: 'Bearer ' + TOKEN,
          'content-type': 'application/json',
          'content-length': data.length,
          accept: 'application/x-ndjson'
        }
      },
      (res) => {
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          buf += chunk
          let idx
          while ((idx = buf.indexOf('\\n')) >= 0) {
            const line = buf.slice(0, idx).trim()
            buf = buf.slice(idx + 1)
            if (!line) continue
            let parsed
            try { parsed = JSON.parse(line) } catch (_) { continue }
            try { onEvent(parsed) } catch (_) { /* keep streaming */ }
          }
        })
        res.on('end', () => {
          const tail = buf.trim()
          if (tail) {
            try { onEvent(JSON.parse(tail)) } catch (_) { /* ignore */ }
          }
          resolve({ status: res.statusCode || 0 })
        })
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// Single-shot non-streaming request to /send for the --no-wait path. Reuses
// the same socket pattern but waits for a buffered JSON body.
function postSend(body) {
  return request('POST', '/send', body)
}

function printAgents(list) {
  if (!list || list.length === 0) {
    console.log('(no linked agents — connect this terminal to another on the canvas first)')
    return
  }
  const width = list.reduce((m, a) => Math.max(m, a.title.length), 0)
  for (const a of list) {
    console.log(a.title.padEnd(width) + '  · ' + (a.command || '?'))
  }
}

function helpText() {
  return [
    'iao — Infinity Agent Orchestrator in-terminal CLI',
    '',
    'Usage:',
    '  iao agents                                 List terminals linked to this one',
    '  iao send "Agent Name" "prompt"             Send a prompt and wait (default) for the reply',
    '  iao send --no-wait "Agent" "prompt"        Fire-and-forget — return immediately after delivery',
    '  iao send --timeout 300 "Agent" "prompt"    Cap the wait at 300s (default 120s)',
    '  iao send --quiet "Agent" "prompt"          Suppress progress lines on stderr',
    '  iao inspect "Agent Name"                   Read the current output buffer of a linked agent',
    '  iao help                                   Show this help',
    '  iao debug                                  Show diagnostic info about the bridge',
    '',
    'Notes:',
    '  - \`iao send\` blocks until the target agent has been idle for a few seconds.',
    '    The wait happens entirely on the bridge — no sleep/inspect loop needed in your own session.',
    '  - \`iao inspect\` is still available for manual debug checks while another agent is working.',
    '  - Only agents connected to this terminal by an edge on the canvas are reachable.',
    '  - If \`iao\` is not on PATH, run "$IAO_CLI" with the same arguments.',
    ''
  ].join('\\n')
}

async function main() {
  const [, , cmd, ...rest] = process.argv
  switch (cmd) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      process.stdout.write(helpText())
      return

    case 'agents': {
      ensureSession()
      const { status, body } = await request('GET', '/agents')
      if (status !== 200) die((body && body.error) || ('http ' + status))
      printAgents(body.agents)
      return
    }

    case 'send': {
      ensureSession()
      // Flag parsing: --no-wait disables sync mode (legacy behaviour),
      // --timeout <seconds> overrides the bridge-side cap, --quiet hides the
      // periodic progress lines. Positional args after flags are
      // "<target>" "<prompt...>".
      let noWait = false
      let quiet = false
      let timeoutSec = null
      const positional = []
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]
        if (a === '--no-wait') noWait = true
        else if (a === '--quiet') quiet = true
        else if (a === '--timeout' && rest[i + 1] != null) {
          const n = parseInt(rest[++i], 10)
          if (!isNaN(n) && n > 0) timeoutSec = n
        } else if (a === '--') {
          for (let j = i + 1; j < rest.length; j++) positional.push(rest[j])
          break
        } else {
          positional.push(a)
        }
      }
      if (positional.length < 2) die('usage: iao send [--no-wait] [--timeout <s>] [--quiet] "Agent Name" "prompt"')
      const [target, ...promptParts] = positional
      const prompt = promptParts.join(' ')

      if (noWait) {
        const { status, body } = await postSend({ target, prompt })
        if (status !== 200) die((body && body.error) || ('http ' + status))
        console.log('Delivered to "' + body.target.title + '". Run: iao inspect "' + body.target.title + '" to read the reply.')
        return
      }

      const envTimeout = parseInt(process.env.IAO_SEND_TIMEOUT_MS || '', 10)
      const timeoutMs = timeoutSec != null
        ? timeoutSec * 1000
        : (!isNaN(envTimeout) && envTimeout > 0 ? envTimeout : 120000)

      let finalEvent = null
      let sawSent = false
      const { status } = await streamSendWait(
        { target, prompt, wait: true, timeoutMs },
        (event) => {
          if (event.type === 'sent') {
            sawSent = true
            if (!quiet) {
              process.stderr.write('iao: delivered to "' + event.target.title + '", waiting for reply (timeout ' + Math.round((event.timeoutMs || timeoutMs) / 1000) + 's)...\\n')
            }
          } else if (event.type === 'status') {
            if (!quiet) {
              process.stderr.write('iao: waiting... ' + Math.round(event.elapsedMs / 1000) + 's elapsed, ' + event.bytes + ' bytes received, idle ' + Math.round(event.idleFor / 1000) + 's\\n')
            }
          } else if (event.type === 'result') {
            finalEvent = event
          }
        }
      )
      if (status !== 200) {
        // Bridge returned an error before streaming started — body is JSON
        if (!sawSent) {
          const { body } = await postSend({ target, prompt: '' })
          die((body && body.error) || ('http ' + status))
        }
        die('http ' + status)
      }
      if (!finalEvent) die('wait stream ended without a result')
      if (finalEvent.timedOut) {
        process.stderr.write('iao: timed out after ' + Math.round(finalEvent.elapsedMs / 1000) + 's waiting for "' + finalEvent.target.title + '". Partial output below; rerun \`iao inspect\` later for more.\\n')
      }
      if (!finalEvent.output) {
        console.log('(no output captured from "' + finalEvent.target.title + '")')
      } else {
        process.stdout.write(finalEvent.output)
        if (!finalEvent.output.endsWith('\\n')) process.stdout.write('\\n')
      }
      if (finalEvent.timedOut) process.exit(124)
      return
    }

    case 'inspect': {
      ensureSession()
      if (rest.length < 1) die('usage: iao inspect "Agent Name"')
      const target = rest.join(' ')
      const { status, body } = await request('GET', '/inspect?target=' + encodeURIComponent(target))
      if (status !== 200) die((body && body.error) || ('http ' + status))
      if (!body.output) {
        console.log('(no output captured yet for "' + body.target.title + '")')
      } else {
        process.stdout.write(body.output)
        if (!body.output.endsWith('\\n')) process.stdout.write('\\n')
      }
      return
    }

    case 'debug': {
      ensureSession()
      const { status, body } = await request('GET', '/debug')
      if (status !== 200) die((body && body.error) || ('http ' + status))
      console.log('current terminal : ' + (body.self.title || body.self.nodeId))
      console.log('node id          : ' + body.self.nodeId)
      console.log('bridge port      : 127.0.0.1:' + body.port)
      console.log('iao binary       : ' + (CLI_PATH || body.cli.bin))
      console.log('node binary      : ' + body.cli.nodeBin)
      console.log('cli script       : ' + body.cli.script)
      console.log('buffered output  : ' + body.buffered_bytes + ' bytes')
      console.log('linked agents    : ' + (body.linked.length === 0 ? '(none)' : ''))
      for (const a of body.linked) console.log('  - ' + a.title + ' · ' + (a.command || '?'))
      console.log('env IAO_NODE_ID  : ' + (NODE_ID || '(unset)'))
      console.log('env IAO_TOKEN    : ' + (TOKEN ? '(set, ' + TOKEN.length + ' chars)' : '(unset)'))
      return
    }

    default:
      die('unknown command "' + cmd + '". Try: iao help')
  }
}

main().catch((err) => die(err && err.message ? err.message : String(err)))
`
