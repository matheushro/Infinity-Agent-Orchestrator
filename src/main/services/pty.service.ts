// PTY lifecycle: owns the node-pty processes and the shell-resolution logic.
// Knows nothing about IPC — callers wire I/O through callbacks.
import { join, delimiter } from 'path'
import { existsSync } from 'fs'
import os from 'os'
import * as pty from 'node-pty'
import type {
  PtyCreateArgs,
  PtyCreateResult,
  PtyDataPayload,
  PtyExitPayload
} from '@shared/types/ipc'
import * as iaoService from './iao.service'
import * as skillService from './skill.service'

// Active pty processes, indexed by terminal session id.
const ptys = new Map<string, pty.IPty>()

/** Look for an executable in PATH; return the absolute path or null. */
function findOnPath(bin: string): string | null {
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue
    const full = join(dir, bin)
    if (existsSync(full)) return full
  }
  return null
}

/** Allow forcing bash/zsh; fall back if the requested shell does not exist. */
function resolveShell(requested?: string): string {
  if (requested === 'bash' || requested === 'zsh') {
    const found = findOnPath(requested)
    if (found) return found
  }
  return process.env.SHELL || findOnPath('bash') || '/bin/sh'
}

interface PtyCallbacks {
  onData(payload: PtyDataPayload): void
  onExit(payload: PtyExitPayload): void
}

/** Spawn a pty, route its output through the callbacks and fire the agent command. */
export function createPty(args: PtyCreateArgs, callbacks: PtyCallbacks): PtyCreateResult {
  const shellPath = resolveShell(args.shell)
  const workdir = args.cwd && existsSync(args.cwd) ? args.cwd : os.homedir()

  // Ensure the IAO skill template is materialized in the project before the
  // agent starts, so it can pick the skill up on its own. Best-effort: a
  // failure here (missing template, unwritable cwd) must not block the pty.
  let skillPath: string | undefined
  try {
    skillPath = skillService.ensureIAOSkill(workdir)
  } catch (err) {
    console.warn('[pty] iao skill setup skipped:', (err as Error).message)
  }

  // When the pty maps to a known canvas node, register it with the iao bridge
  // and inject the env vars the in-terminal CLI needs. `iao` is exposed by
  // prepending the bundle dir to PATH; IAO_CLI gives an absolute fallback.
  let iaoEnv: Record<string, string> = {}
  if (args.nodeId) {
    const session = iaoService.registerPtySession(args.id, args.nodeId)
    iaoEnv = { ...session }
    const basePath = process.env.PATH || ''
    iaoEnv.PATH = session.IAO_CLI_DIR + (basePath ? delimiter + basePath : '')
  }
  if (skillPath) iaoEnv.IAO_SKILL_PATH = skillPath

  const env: { [key: string]: string } = { ...(process.env as { [key: string]: string }), ...iaoEnv }
  const proc = pty.spawn(shellPath, [], {
    name: 'xterm-color',
    cols: args.cols || 80,
    rows: args.rows || 24,
    cwd: workdir,
    env
  })

  proc.onData((data) => {
    if (args.nodeId) iaoService.appendOutput(args.nodeId, data)
    callbacks.onData({ id: args.id, data })
  })
  proc.onExit(() => {
    iaoService.unregisterPtySession(args.id)
    callbacks.onExit({ id: args.id })
    ptys.delete(args.id)
  })

  ptys.set(args.id, proc)

  // Fire the selected command (Codex / Claude Code) as soon as the shell starts.
  if (args.command) {
    setTimeout(() => proc.write(`${args.command}\r`), 250)
  }

  return { id: args.id, shell: shellPath }
}

export function writeToPty(id: string, data: string): void {
  ptys.get(id)?.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
  try {
    ptys.get(id)?.resize(Math.max(cols, 1), Math.max(rows, 1))
  } catch {
    // ignore invalid resize requests after the terminal has already exited
  }
}

export function killPty(id: string): void {
  iaoService.unregisterPtySession(id)
  ptys.get(id)?.kill()
  ptys.delete(id)
}

export function killAllPtys(): void {
  ptys.forEach((p, id) => {
    iaoService.unregisterPtySession(id)
    p.kill()
  })
  ptys.clear()
}
