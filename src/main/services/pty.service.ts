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
import {
  contextFileForCmd,
  modelEnvForCmd,
  modelArgForCmd,
  effortArgForCmd,
  effortValueForCmd,
  addDirArgForCmd,
  addDirExtraArgsForCmd,
} from '@shared/agents'
import * as iaoService from './iao.service'
import * as skillService from './skill.service'
import { applyPrompt, ensureRoleDir } from './promptFile.service'

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

/** Single-quote a value for safe interpolation into the launch shell line. */
function quoteArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Build the shell line that launches the agent.
 *
 * Effort: agents that expose a reasoning-effort flag (Claude `--effort`, Codex's
 * `-c model_reasoning_effort=…` config override) get `<effortArg> <value>`
 * appended, so how hard the agent thinks is pinned per terminal rather than
 * inherited from its global config.
 *
 * Model: for agents that select their model via a flag and expose no model env
 * var (Codex, Cursor, Copilot, OpenCode), append `<modelArg> <model>`. Env-var
 * agents (Claude, Gemini) receive the model through their environment instead,
 * so that part stays bare.
 *
 * Workspace: when the agent was launched in its private role subdir (`addDir`
 * set to the repo root), append the agent's "add directory" flag so the project
 * root is part of its accessible workspace — otherwise it sits *outside* the
 * agent's cwd and the agent prompts before touching every project file. Some
 * agents (Codex) also need extra tokens for that flag to take effect (a sandbox
 * mode that permits additional writable roots); those are appended alongside it.
 * Agents without such a flag get nothing appended.
 */
function launchLine(command: string, model?: string, addDir?: string, effort?: string): string {
  let line = command
  if (model && !modelEnvForCmd(command)) {
    const arg = modelArgForCmd(command)
    if (arg) line += ` ${arg} ${quoteArg(model)}`
  }
  if (effort) {
    const arg = effortArgForCmd(command)
    if (arg) line += ` ${arg} ${quoteArg(effortValueForCmd(command, effort))}`
  }
  if (addDir) {
    const dirArg = addDirArgForCmd(command)
    if (dirArg) {
      line += ` ${dirArg} ${quoteArg(addDir)}`
      const extra = addDirExtraArgsForCmd(command)
      if (extra) line += ` ${extra}`
    }
  }
  return line
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
  //
  // The cwd then sits *under* the repo, so the repo root is outside the agent's
  // workspace and it would prompt before touching every project file. We re-add
  // the repo root via the agent's "add directory" flag (see `launchLine`) so
  // edits behave as if the agent had launched at the repo root.
  let workdir = repoCwd
  if (args.command) {
    const prompt = args.prompt?.trim() ? args.prompt : ''
    const roleId = args.nodeId ?? args.id
    // Even with no prompt the agent runs in its role directory, so its session
    // logs carry the terminal id (see ensureRoleDir) and the usage report can
    // attribute the spend to this terminal.
    const roleDir =
      applyPrompt(repoCwd, roleId, contextFileForCmd(args.command), prompt) ??
      ensureRoleDir(repoCwd, roleId)
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

  // Pin the agent to a specific model. Agents with a model env var (Claude →
  // ANTHROPIC_MODEL, Gemini → GEMINI_MODEL) get it injected per-pty, so the
  // choice is isolated to this terminal and survives the agent's own `/clear` —
  // it never inherits a model last selected in another terminal sharing the
  // global config. Agents without one receive `--model <model>` on the launch
  // line instead (see `launchLine`). No model leaves the agent on its default.
  if (args.command && args.model) {
    const modelEnv = modelEnvForCmd(args.command)
    if (modelEnv) iaoEnv[modelEnv] = args.model
  }

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
  // carries no prompt and nothing is re-sent per turn. When the agent was
  // launched in a role subdir, re-add the repo root to its workspace so it does
  // not prompt for every project file (see `launchLine`).
  if (args.command) {
    const addDir = workdir !== repoCwd ? repoCwd : undefined
    const line = launchLine(args.command, args.model, addDir, args.effort)
    setTimeout(() => proc.write(`${line}\r`), LAUNCH_CMD_MS)
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
