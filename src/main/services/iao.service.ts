// iao bridge: lets the in-terminal `iao` CLI talk to the main process.
//
// Transport is the FILESYSTEM, not a socket. Coding agents (codex, claude) run
// shell commands inside a sandbox that denies the `connect()` syscall entirely
// — for AF_INET *and* AF_UNIX — returning EPERM, so neither a TCP nor a Unix
// socket is reachable from the very agents the bridge exists to serve. What the
// sandbox *does* allow is reading/writing files in its workspace + temp dirs
// (that is how the agent edits code). So the CLI drops request files and reads
// response files in a shared spool dir under the OS temp dir, and the (un-
// sandboxed) main process watches that dir and answers.
//
// Internally the request logic is still an HTTP server over a Unix socket; a
// thin in-process relay (request file → self HTTP call → response file) reuses
// every handler, auth check and the streaming /send path unchanged. The main
// process is not sandboxed, so its own loopback `connect()` works fine.
//
// Per-pty bearer tokens (carried inside each request file) still identify the
// caller; only terminals connected through an edge in SQLite are reachable, and
// the 0700 spool dir is owner-only.
import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { EventEmitter } from 'events'
import { app, BrowserWindow } from 'electron'
import {
  mkdirSync, writeFileSync, chmodSync, rmSync, renameSync,
  appendFileSync, readFileSync, readdirSync, unlinkSync, watch, type FSWatcher
} from 'fs'
import { IpcChannels } from '@shared/types/ipc'
import type { TerminalRecord } from '@shared/types/terminal'
import type { NoteRecord } from '@shared/types/notes'
import * as dbService from './db.service'
import * as ptyService from './pty.service'

// Default geometry for a note created through the CLI. Matches the renderer's
// useNotes defaults so a CLI-created note looks identical to a UI-created one.
const CLI_NOTE_WIDTH = 280
const CLI_NOTE_HEIGHT = 200

/**
 * Notify every renderer that notes/links changed so the canvas re-lists them.
 * Best-effort: in the test environment Electron's BrowserWindow is not present,
 * so the optional chaining makes this a no-op instead of throwing.
 */
function broadcastNotesChanged(): void {
  try {
    const windows = BrowserWindow?.getAllWindows?.() ?? []
    for (const win of windows) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.notesChanged)
    }
  } catch {
    /* no renderer available (e.g. unit tests) */
  }
}

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
let socketPath = ''
let bundleDir = ''

// Filesystem RPC spool: the dir the CLI drops `<id>.req` files into and reads
// `<id>.res` files back from. Watched by the main process (startFileRpc).
let rpcDir = ''
let rpcWatcher: FSWatcher | null = null
let rpcScanTimer: NodeJS.Timeout | null = null
const rpcInFlight = new Set<string>()

export interface IaoSessionEnv {
  IAO_RPC_DIR: string
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
    IAO_RPC_DIR: rpcDir,
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

export async function startIaoServer(): Promise<{ socketPath: string }> {
  if (server) return { socketPath }
  ensureBundle()
  socketPath = makeSocketPath()
  // Drop a stale socket left behind by a crashed previous run; otherwise
  // listen() fails with EADDRINUSE.
  try { rmSync(socketPath, { force: true }) } catch { /* best effort */ }
  server = createServer(handleRequest)
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(socketPath, () => resolve())
  })
  // Owner-only: the socket is only ever reached by this same process (the file
  // relay self-connects); agents never touch it.
  try { chmodSync(socketPath, 0o600) } catch { /* best effort */ }
  startFileRpc()
  return { socketPath }
}

export async function stopIaoServer(): Promise<void> {
  if (!server) return
  stopFileRpc()
  await new Promise<void>((resolve) => server!.close(() => resolve()))
  try { rmSync(socketPath, { force: true }) } catch { /* best effort */ }
  server = null
  socketPath = ''
  sessionsByToken.clear()
  sessionsByPty.clear()
  outputByNode.clear()
}

// A short path under the OS temp dir (AF_UNIX paths are capped near 108 bytes).
// Per-pid + random suffix so concurrent app instances never collide.
function makeSocketPath(): string {
  return join(tmpdir(), `iao-${process.pid}-${randomBytes(4).toString('hex')}.sock`)
}

// ---------------------------------------------------------------------------
// Filesystem RPC relay
//
// The agent's sandbox blocks connect() but allows file IO in the temp dir, so
// the CLI talks to us purely through files in `rpcDir`:
//   - CLI writes  `<id>.req`  : { token, method, path, body }
//   - we answer   `<id>.res`  : NDJSON lines, each {"t":"response"|"event"|"end", ...}
// We translate each request file into a self HTTP call over the Unix socket so
// all the existing handlers (auth, routing, streaming /send) are reused as-is.
// ---------------------------------------------------------------------------

function startFileRpc(): void {
  try {
    rpcDir = join(tmpdir(), `iao-rpc-${process.pid}`)
    mkdirSync(rpcDir, { recursive: true })
    try { chmodSync(rpcDir, 0o700) } catch { /* best effort */ }
    // Clear any stale spool files from a previous crashed run.
    sweepRpcDir()
    try { rpcWatcher = watch(rpcDir, () => scanRpcDir()) } catch { rpcWatcher = null }
    // Backstop scan in case the watcher misses an event (or isn't available).
    rpcScanTimer = setInterval(scanRpcDir, 250)
    scanRpcDir()
  } catch {
    // Filesystem RPC unavailable (e.g. mocked fs in unit tests); the socket
    // server still works for any in-process caller.
  }
}

function stopFileRpc(): void {
  try { rpcWatcher?.close() } catch { /* ignore */ }
  rpcWatcher = null
  if (rpcScanTimer) clearInterval(rpcScanTimer)
  rpcScanTimer = null
  sweepRpcDir()
  rpcInFlight.clear()
  rpcDir = ''
}

function sweepRpcDir(): void {
  if (!rpcDir) return
  try {
    for (const name of readdirSync(rpcDir)) {
      if (name.endsWith('.req') || name.endsWith('.res') || name.endsWith('.tmp')) {
        try { unlinkSync(join(rpcDir, name)) } catch { /* ignore */ }
      }
    }
  } catch { /* dir gone / unreadable */ }
}

function scanRpcDir(): void {
  if (!rpcDir) return
  let names: string[]
  try { names = readdirSync(rpcDir) } catch { return }
  for (const name of names) {
    if (!name.endsWith('.req') || rpcInFlight.has(name)) continue
    rpcInFlight.add(name)
    handleReqFile(name)
  }
}

interface RpcRequest {
  token?: string
  method?: string
  path?: string
  body?: unknown
}

function handleReqFile(name: string): void {
  const id = name.slice(0, -'.req'.length)
  const reqPath = join(rpcDir, name)
  const resPath = join(rpcDir, `${id}.res`)
  let raw: string
  try { raw = readFileSync(reqPath, 'utf8') } catch { rpcInFlight.delete(name); return }
  // Consume the request file immediately so it is processed exactly once.
  try { unlinkSync(reqPath) } catch { /* ignore */ }

  const done = (): void => { rpcInFlight.delete(name) }
  let req: RpcRequest
  try { req = JSON.parse(raw) as RpcRequest } catch {
    writeBufferedRes(resPath, 400, { error: 'invalid request file' })
    return done()
  }
  relayToServer(req, resPath, done)
}

function relayToServer(req: RpcRequest, resPath: string, done: () => void): void {
  const payload = req.body != null ? Buffer.from(JSON.stringify(req.body), 'utf8') : null
  const headers: Record<string, string> = {
    authorization: `Bearer ${req.token ?? ''}`,
    accept: 'application/x-ndjson'
  }
  if (payload) {
    headers['content-type'] = 'application/json'
    headers['content-length'] = String(payload.length)
  }

  let settled = false
  const finishErr = (msg: string): void => {
    if (settled) return
    settled = true
    writeBufferedRes(resPath, 502, { error: msg })
    done()
  }

  const creq = httpRequest(
    { socketPath, method: req.method || 'GET', path: req.path || '/', headers },
    (cres) => {
      const ct = String(cres.headers['content-type'] || '')
      const status = cres.statusCode || 0
      if (ct.includes('ndjson')) {
        // Streaming /send: forward each NDJSON line as an event, then end.
        let buf = ''
        cres.setEncoding('utf8')
        cres.on('data', (chunk: string) => {
          buf += chunk
          let idx: number
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim()
            buf = buf.slice(idx + 1)
            if (line) appendRpcLine(resPath, { t: 'event', d: safeJson(line) })
          }
        })
        cres.on('end', () => {
          const tail = buf.trim()
          if (tail) appendRpcLine(resPath, { t: 'event', d: safeJson(tail) })
          appendRpcLine(resPath, { t: 'end', status })
          settled = true
          done()
        })
        cres.on('error', () => finishErr('relay stream error'))
      } else {
        const chunks: Buffer[] = []
        cres.on('data', (c: Buffer) => chunks.push(c))
        cres.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          writeBufferedRes(resPath, status, text ? safeJson(text) : {})
          settled = true
          done()
        })
        cres.on('error', () => finishErr('relay read error'))
      }
    }
  )
  creq.on('error', (e: Error) => finishErr(`bridge relay failed: ${e.message}`))
  if (payload) creq.write(payload)
  creq.end()
}

function safeJson(line: string): unknown {
  try { return JSON.parse(line) } catch { return { raw: line } }
}

// Buffered response: write both the response line and the end marker in one
// atomic rename so the CLI never observes a half-written file.
function writeBufferedRes(resPath: string, status: number, body: unknown): void {
  const data =
    JSON.stringify({ t: 'response', status, body }) + '\n' +
    JSON.stringify({ t: 'end', status }) + '\n'
  try {
    const tmp = `${resPath}.tmp`
    writeFileSync(tmp, data, { mode: 0o600 })
    renameSync(tmp, resPath)
  } catch { /* spool dir gone */ }
}

function appendRpcLine(resPath: string, obj: unknown): void {
  try { appendFileSync(resPath, JSON.stringify(obj) + '\n', { mode: 0o600 }) } catch { /* ignore */ }
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
  // Unix-domain socket connections carry no remote address — the 0600 socket
  // file is the access boundary there. For any connection that does report an
  // address (a stray TCP path), still hard-restrict to loopback as defence in
  // depth.
  const remote = req.socket.remoteAddress || ''
  if (remote && !isLoopback(remote)) {
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
    if (route === 'GET /notes/list') return handleNoteList(session, res)
    if (route === 'GET /notes/read') return handleNoteRead(session, url, res)
    if (route === 'POST /notes/create') {
      readBody(req)
        .then((body) => handleNoteCreate(session, body, res))
        .catch((err) => send(res, 500, { error: (err as Error).message }))
      return
    }
    if (route === 'POST /notes/write') {
      readBody(req)
        .then((body) => handleNoteWrite(session, body, res))
        .catch((err) => send(res, 500, { error: (err as Error).message }))
      return
    }
    if (route === 'POST /notes/edit') {
      readBody(req)
        .then((body) => handleNoteEdit(session, body, res))
        .catch((err) => send(res, 500, { error: (err as Error).message }))
      return
    }
    if (route === 'POST /notes/rename') {
      readBody(req)
        .then((body) => handleNoteRename(session, body, res))
        .catch((err) => send(res, 500, { error: (err as Error).message }))
      return
    }
    if (route === 'POST /notes/delete') {
      readBody(req)
        .then((body) => handleNoteDelete(session, body, res))
        .catch((err) => send(res, 500, { error: (err as Error).message }))
      return
    }
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
    spool: rpcDir,
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
// Notes — a terminal can only reach notes explicitly linked to it.
// ---------------------------------------------------------------------------

function handleNoteCreate(
  session: SessionEntry,
  body: Record<string, unknown>,
  res: ServerResponse
): void {
  const content = typeof body.content === 'string' ? body.content : ''
  const terminal = dbService.getTerminal(session.nodeId)
  if (!terminal) return send(res, 404, { error: 'current terminal not found' })

  const now = Date.now()
  const note: NoteRecord = {
    id: `note-${now}-${randomBytes(4).toString('hex')}`,
    title: deriveNoteTitle(content),
    content,
    // Drop the note just to the right of the creating terminal so it lands in
    // view next to the agent that made it.
    x: terminal.x + terminal.width + 60,
    y: terminal.y,
    width: CLI_NOTE_WIDTH,
    height: CLI_NOTE_HEIGHT,
    workspace_id: terminal.workspace_id,
    created_at: now,
    updated_at: now
  }
  dbService.upsertNote(note)
  // `note create` automatically links the new note to the current terminal.
  dbService.linkNoteToTerminal(note.id, session.nodeId)
  broadcastNotesChanged()
  send(res, 200, { note: { id: note.id, title: note.title } })
}

function handleNoteList(session: SessionEntry, res: ServerResponse): void {
  const notes = dbService.listNotesForTerminal(session.nodeId)
  send(res, 200, {
    notes: notes.map((n) => ({ id: n.id, title: n.title, updated_at: n.updated_at }))
  })
}

function handleNoteRead(session: SessionEntry, url: URL, res: ServerResponse): void {
  const targetName = (url.searchParams.get('target') || '').trim()
  if (!targetName) return send(res, 400, { error: 'note name required' })
  const note = resolveLinkedNote(session.nodeId, targetName)
  if (!note) return sendNoteDenied(res, targetName)

  let content = note.content
  const start = parseLine(url.searchParams.get('start'))
  const end = parseLine(url.searchParams.get('end'))
  if (start != null || end != null) {
    const lines = content.split('\n')
    const from = start != null ? Math.max(1, start) : 1
    const to = end != null ? end : lines.length
    content = lines.slice(from - 1, to).join('\n')
  }
  send(res, 200, { note: { id: note.id, title: note.title }, content })
}

function handleNoteWrite(
  session: SessionEntry,
  body: Record<string, unknown>,
  res: ServerResponse
): void {
  const targetName = String(body.target ?? '').trim()
  if (!targetName) return send(res, 400, { error: 'note name required' })
  if (typeof body.content !== 'string') return send(res, 400, { error: 'content required' })
  const note = resolveLinkedNote(session.nodeId, targetName)
  if (!note) return sendNoteDenied(res, targetName)

  dbService.upsertNote({ ...note, content: body.content })
  broadcastNotesChanged()
  send(res, 200, { note: { id: note.id, title: note.title }, bytes: body.content.length })
}

function handleNoteEdit(
  session: SessionEntry,
  body: Record<string, unknown>,
  res: ServerResponse
): void {
  const targetName = String(body.target ?? '').trim()
  const oldText = typeof body.old === 'string' ? body.old : ''
  const newText = typeof body.new === 'string' ? body.new : ''
  if (!targetName) return send(res, 400, { error: 'note name required' })
  if (!oldText) return send(res, 400, { error: 'old text required' })
  const note = resolveLinkedNote(session.nodeId, targetName)
  if (!note) return sendNoteDenied(res, targetName)

  if (!note.content.includes(oldText)) {
    return send(res, 422, { error: `text not found in note "${note.title}"` })
  }
  const replaced = note.content.split(oldText).length - 1
  const content = note.content.split(oldText).join(newText)
  dbService.upsertNote({ ...note, content })
  broadcastNotesChanged()
  send(res, 200, { note: { id: note.id, title: note.title }, replaced })
}

function handleNoteRename(
  session: SessionEntry,
  body: Record<string, unknown>,
  res: ServerResponse
): void {
  const targetName = String(body.target ?? '').trim()
  const newName = String(body.name ?? '').trim()
  if (!targetName) return send(res, 400, { error: 'current note name required' })
  if (!newName) return send(res, 400, { error: 'new note name required' })
  const note = resolveLinkedNote(session.nodeId, targetName)
  if (!note) return sendNoteDenied(res, targetName)

  dbService.upsertNote({ ...note, title: newName })
  broadcastNotesChanged()
  send(res, 200, { note: { id: note.id, title: newName } })
}

function handleNoteDelete(
  session: SessionEntry,
  body: Record<string, unknown>,
  res: ServerResponse
): void {
  const targetName = String(body.target ?? '').trim()
  if (!targetName) return send(res, 400, { error: 'note name required' })
  const note = resolveLinkedNote(session.nodeId, targetName)
  if (!note) return sendNoteDenied(res, targetName)

  // removeNote also drops every link row for the note.
  dbService.removeNote(note.id)
  broadcastNotesChanged()
  send(res, 200, { deleted: true, note: { id: note.id, title: note.title } })
}

function sendNoteDenied(res: ServerResponse, name: string): void {
  send(res, 403, {
    error: `access denied: no note named "${name}" is linked to this terminal. ` +
      `Run 'iao note list' to see accessible notes, or link the note to this terminal on the canvas.`
  })
}

function resolveLinkedNote(terminalId: string, name: string): NoteRecord | undefined {
  const candidates = dbService.listNotesForTerminal(terminalId)
  const lower = name.toLowerCase()
  const exact = candidates.find((n) => n.title.toLowerCase() === lower)
  if (exact) return exact
  const partial = candidates.filter((n) => n.title.toLowerCase().includes(lower))
  return partial.length === 1 ? partial[0] : undefined
}

function deriveNoteTitle(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim()) || ''
  const cleaned = firstLine.replace(/^#+\s*/, '').trim()
  return cleaned ? cleaned.slice(0, 80) : 'Untitled note'
}

function parseLine(value: string | null): number | null {
  if (value == null || value === '') return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
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
// iao CLI — talks to the IAO bridge through the FILESYSTEM. Agent sandboxes
// block the connect() syscall (TCP and unix sockets alike, EPERM), but allow
// file IO in the temp dir — so we drop a request file in IAO_RPC_DIR and poll
// for the response file the main process writes back. Config arrives via env.
'use strict'
const fs = require('fs')
const path = require('path')

const RPC_DIR = process.env.IAO_RPC_DIR
const TOKEN = process.env.IAO_TOKEN
const NODE_ID = process.env.IAO_NODE_ID
const CLI_PATH = process.env.IAO_CLI

// Give up if the bridge writes nothing new for this long — bounds the hang when
// the app is closed. The bridge heartbeats every ~2s during \`send\` waits, so
// this never trips mid-reply.
const RPC_IDLE_TIMEOUT_MS = 15000
const POLL_MS = 20

function die(msg, code) {
  process.stderr.write('iao: ' + msg + '\\n')
  process.exit(code || 1)
}

function ensureSession() {
  if (!RPC_DIR || !TOKEN) die('not inside an IAO terminal (missing IAO_RPC_DIR/IAO_TOKEN).', 2)
}

function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

// Core RPC over files: write <id>.req, then tail <id>.res. Each response line is
// one of {t:'response',status,body} | {t:'event',d} | {t:'end',status}.
// \`onEvent\` (when given) fires per event line for streaming \`send\` waits.
function rpcCall(method, reqPath, body, onEvent) {
  return new Promise((resolve, reject) => {
    const id = newId()
    const resPath = path.join(RPC_DIR, id + '.res')
    try {
      const tmp = path.join(RPC_DIR, id + '.req.tmp')
      const dst = path.join(RPC_DIR, id + '.req')
      fs.writeFileSync(tmp, JSON.stringify({ token: TOKEN, method: method, path: reqPath, body: body || null }))
      fs.renameSync(tmp, dst)
    } catch (e) {
      return reject(new Error('could not reach IAO bridge: ' + e.message))
    }

    let consumed = 0
    let response = null
    let lastProgress = Date.now()
    const timer = setInterval(() => {
      let txt = null
      try { txt = fs.readFileSync(resPath, 'utf8') } catch (_) { txt = null }
      if (txt != null) {
        const lines = txt.split('\\n')
        // Last element is the trailing partial line (or '' after a final \\n).
        for (; consumed < lines.length - 1; consumed++) {
          const line = lines[consumed].trim()
          if (!line) continue
          let obj
          try { obj = JSON.parse(line) } catch (_) { continue }
          lastProgress = Date.now()
          if (obj.t === 'event') { if (onEvent) { try { onEvent(obj.d) } catch (_) {} } }
          else if (obj.t === 'response') { response = { status: obj.status, body: obj.body } }
          else if (obj.t === 'end') {
            clearInterval(timer)
            try { fs.unlinkSync(resPath) } catch (_) {}
            return resolve(response || { status: obj.status || 0, body: {} })
          }
        }
      }
      if (Date.now() - lastProgress > RPC_IDLE_TIMEOUT_MS) {
        clearInterval(timer)
        try { fs.unlinkSync(resPath) } catch (_) {}
        reject(new Error('IAO bridge did not respond (is the app still running?)'))
      }
    }, POLL_MS)
  })
}

function request(method, reqPath, body) {
  return rpcCall(method, reqPath, body, null)
}

// Stream NDJSON from POST /send (wait mode). \`onEvent\` is invoked once per
// event; resolves with the final status when the response ends.
function streamSendWait(body, onEvent) {
  return rpcCall('POST', '/send', body, onEvent).then((r) => ({ status: r.status }))
}

// Single-shot request to /send for the --no-wait path (buffered JSON reply).
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

function printNotes(list) {
  if (!list || list.length === 0) {
    console.log('(no notes linked to this terminal — create one with: iao note create)')
    return
  }
  for (const n of list) console.log(n.title)
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
    '  iao note create ["content"]                Create a note (auto-linked to this terminal)',
    '  iao note list                              List notes linked to this terminal',
    '  iao note read "Note Name" [start] [end]    Read a linked note (optionally a line range)',
    '  iao note write "Note Name" "content"       Replace a linked note\\'s entire content',
    '  iao note edit "Note Name" "old" "new"      Replace text within a linked note',
    '  iao note rename "Old Name" "New Name"      Rename a linked note',
    '  iao note delete "Note Name"                Delete a linked note (removes its links)',
    '  iao help                                   Show this help',
    '  iao debug                                  Show diagnostic info about the bridge',
    '',
    'Notes:',
    '  - \`iao send\` blocks until the target agent has been idle for a few seconds.',
    '    The wait happens entirely on the bridge — no sleep/inspect loop needed in your own session.',
    '  - \`iao inspect\` is still available for manual debug checks while another agent is working.',
    '  - Only agents connected to this terminal by an edge on the canvas are reachable.',
    '  - \`iao note\` commands only reach notes linked to this terminal on the canvas.',
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
      console.log('rpc spool dir    : ' + (RPC_DIR || body.spool))
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

    case 'note': {
      ensureSession()
      const sub = rest[0]
      const args = rest.slice(1)
      switch (sub) {
        case 'create': {
          const content = args.join(' ')
          const { status, body } = await request('POST', '/notes/create', { content })
          if (status !== 200) die((body && body.error) || ('http ' + status))
          console.log('Created note "' + body.note.title + '" (linked to this terminal).')
          return
        }
        case 'list': {
          const { status, body } = await request('GET', '/notes/list')
          if (status !== 200) die((body && body.error) || ('http ' + status))
          printNotes(body.notes)
          return
        }
        case 'read': {
          if (args.length < 1) die('usage: iao note read "Note Name" [start] [end]')
          // Peel up to two trailing numeric tokens as the [start] [end] range,
          // leaving the rest as the (possibly multi-word) note name.
          const nums = []
          const parts = args.slice()
          while (parts.length > 1 && nums.length < 2 && /^[0-9]+$/.test(parts[parts.length - 1])) {
            nums.unshift(parseInt(parts.pop(), 10))
          }
          const name = parts.join(' ')
          let path = '/notes/read?target=' + encodeURIComponent(name)
          if (nums.length === 1) path += '&start=' + nums[0]
          else if (nums.length === 2) path += '&start=' + nums[0] + '&end=' + nums[1]
          const { status, body } = await request('GET', path)
          if (status !== 200) die((body && body.error) || ('http ' + status))
          if (!body.content) {
            console.log('(note "' + body.note.title + '" is empty)')
          } else {
            process.stdout.write(body.content)
            if (!body.content.endsWith('\\n')) process.stdout.write('\\n')
          }
          return
        }
        case 'write': {
          if (args.length < 2) die('usage: iao note write "Note Name" "content"')
          const name = args[0]
          const content = args.slice(1).join(' ')
          const { status, body } = await request('POST', '/notes/write', { target: name, content })
          if (status !== 200) die((body && body.error) || ('http ' + status))
          console.log('Wrote ' + body.bytes + ' bytes to "' + body.note.title + '".')
          return
        }
        case 'edit': {
          if (args.length < 3) die('usage: iao note edit "Note Name" "old text" "new text"')
          const name = args[0]
          const oldText = args[1]
          const newText = args.slice(2).join(' ')
          const { status, body } = await request('POST', '/notes/edit', { target: name, old: oldText, new: newText })
          if (status !== 200) die((body && body.error) || ('http ' + status))
          console.log('Replaced ' + body.replaced + ' occurrence(s) in "' + body.note.title + '".')
          return
        }
        case 'rename': {
          if (args.length < 2) die('usage: iao note rename "Old Name" "New Name"')
          const oldName = args[0]
          const newName = args.slice(1).join(' ')
          const { status, body } = await request('POST', '/notes/rename', { target: oldName, name: newName })
          if (status !== 200) die((body && body.error) || ('http ' + status))
          console.log('Renamed note to "' + body.note.title + '".')
          return
        }
        case 'delete': {
          if (args.length < 1) die('usage: iao note delete "Note Name"')
          const name = args.join(' ')
          const { status, body } = await request('POST', '/notes/delete', { target: name })
          if (status !== 200) die((body && body.error) || ('http ' + status))
          console.log('Deleted note "' + body.note.title + '".')
          return
        }
        default:
          die('unknown note subcommand "' + (sub || '') + '". Try: iao note list | create | read | write | edit | rename | delete')
      }
      return
    }

    default:
      die('unknown command "' + cmd + '". Try: iao help')
  }
}

main().catch((err) => die(err && err.message ? err.message : String(err)))
`
