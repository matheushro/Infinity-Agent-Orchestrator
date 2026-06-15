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
import { contextFileForCmd } from '@shared/agents'
import * as iaoService from './iao.service'
import * as skillService from './skill.service'
import { applyPrompt } from './promptFile.service'

// Active pty processes, indexed by terminal session id.
const ptys = new Map<string, pty.IPty>()

// Delay before writing the launch command, giving the shell time to come up.
const LAUNCH_CMD_MS = 250

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
  const repoCwd = args.cwd && existsSync(args.cwd) ? args.cwd : os.homedir()

  // Ensure the IAO skill template is materialized in the project before the
  // agent starts, so it can pick the skill up on its own. Best-effort: a
  // failure here (missing template, unwritable cwd) must not block the pty.
  let skillPath: string | undefined
  try {
    skillPath = skillService.ensureIAOSkill(repoCwd)
  } catch (err) {
    console.warn('[pty] iao skill setup skipped:', (err as Error).message)
  }

  // Deliver the per-terminal prompt Maestri-style: write it into a private,
  // gitignored role subdirectory and launch the agent there, so the repo's own
  // CLAUDE.md/AGENTS.md is never touched and two terminals in the same folder can
  // carry different prompts. The agent still merges the repo's root context file
  // (agents resolve context by walking up from the cwd). An empty prompt — or any
  // failure — keeps the agent in the repo root. `nodeId` keys the role dir so it
  // stays stable across StrictMode remounts; `id` is the per-mount fallback.
  let workdir = repoCwd
  if (args.command) {
    const prompt = args.prompt?.trim() ? args.prompt : ''
    const roleDir = applyPrompt(repoCwd, args.nodeId ?? args.id, contextFileForCmd(args.command), prompt)
    if (roleDir) workdir = roleDir
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
  // On macOS, GUI-launched apps inherit a minimal PATH from launchd. Spawning
  // as a login shell makes zsh/bash load /etc/zprofile (path_helper) and the
  // user's ~/.zprofile / ~/.bash_profile, restoring Homebrew, Docker, nvm, etc.
  const shellArgs = process.platform === 'darwin' ? ['-l'] : []
  const proc = pty.spawn(shellPath, shellArgs, {
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

  // Fire the selected command (Codex / Claude Code) once the shell is up. The
  // prompt already lives in the agent's context file, so the launch command
  // carries no prompt and nothing is re-sent per turn.
  if (args.command) {
    setTimeout(() => proc.write(`${args.command}\r`), LAUNCH_CMD_MS)
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

// Grace period between SIGHUP and the SIGKILL backstop when a node is deleted.
const KILL_GRACE_MS = 2000

/**
 * Kill the pty's whole process tree, not just the shell. `proc.kill()` only
 * signals the shell: agents that ignore SIGHUP (claude/codex) survive as
 * orphans and keep burning CPU after their node is deleted. The pty child is
 * its session leader, so `pid` doubles as the process-group id — signalling
 * `-pid` reaches every descendant. SIGHUP first for graceful cleanup, then a
 * SIGKILL backstop for whatever ignored it (immediately when graceMs is 0,
 * e.g. on app quit, where a timer would never fire).
 */
function killProcessTree(proc: pty.IPty, graceMs: number): void {
  const pid = proc.pid
  if (process.platform === 'win32' || !pid) {
    try { proc.kill() } catch { /* already dead */ }
    return
  }
  try { process.kill(-pid, 'SIGHUP') } catch { /* group already gone */ }
  try { proc.kill() } catch { /* already dead */ }
  const reap = (): void => {
    try { process.kill(-pid, 'SIGKILL') } catch { /* group already gone */ }
  }
  if (graceMs <= 0) {
    reap()
    return
  }
  setTimeout(reap, graceMs).unref?.()
}

export function killPty(id: string): void {
  iaoService.unregisterPtySession(id)
  const proc = ptys.get(id)
  if (proc) killProcessTree(proc, KILL_GRACE_MS)
  ptys.delete(id)
}

export function killAllPtys(): void {
  ptys.forEach((p, id) => {
    iaoService.unregisterPtySession(id)
    killProcessTree(p, 0)
  })
  ptys.clear()
}
