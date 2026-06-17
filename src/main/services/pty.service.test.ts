import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---- boundary mocks (hoisted before module imports) ----

vi.mock('node-pty', () => ({ spawn: vi.fn() }))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: vi.fn() }
})

vi.mock('os', () => ({
  default: { homedir: vi.fn(() => '/home/testuser') }
}))

vi.mock('./iao.service', () => ({
  registerPtySession: vi.fn(),
  appendOutput: vi.fn(),
  unregisterPtySession: vi.fn()
}))

vi.mock('./skill.service', () => ({
  ensureIAOSkill: vi.fn()
}))

vi.mock('./promptFile.service', () => ({
  applyPrompt: vi.fn()
}))

import { existsSync } from 'fs'
import * as nodePty from 'node-pty'
import * as iaoService from './iao.service'
import * as skillService from './skill.service'
import { applyPrompt } from './promptFile.service'
import { createPty, writeToPty, resizePty, killPty, killAllPtys } from './pty.service'

const mockExistsSync = vi.mocked(existsSync)
const mockSpawn = vi.mocked(nodePty.spawn)
const mockRegister = vi.mocked(iaoService.registerPtySession)
const mockAppend = vi.mocked(iaoService.appendOutput)
const mockUnregister = vi.mocked(iaoService.unregisterPtySession)
const mockEnsureSkill = vi.mocked(skillService.ensureIAOSkill)
const mockApplyPrompt = vi.mocked(applyPrompt)

// On macOS the pty is spawned as a login shell (`-l`) so it inherits the
// user's full PATH (Homebrew, Docker, nvm, ...). Everywhere else: no args.
const expectedShellArgs = process.platform === 'darwin' ? ['-l'] : []

// ---- mock pty proc factory ----

type MockProc = {
  pid: number
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  onData: (cb: (d: string) => void) => void
  onExit: (cb: () => void) => void
  _triggerData: (d: string) => void
  _triggerExit: () => void
}

function makeMockProc(pid = 4242): MockProc {
  let dataCb: ((d: string) => void) | null = null
  let exitCb: (() => void) | null = null
  return {
    pid,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData(cb) { dataCb = cb },
    onExit(cb) { exitCb = cb },
    _triggerData(d) { dataCb?.(d) },
    _triggerExit() { exitCb?.() }
  }
}

// ---- IAO session env stub ----

const IAO_SESSION = {
  IAO_RPC_DIR: '/tmp/iao-rpc-test',
  IAO_TOKEN: 'tok-abc',
  IAO_NODE_ID: 'node-1',
  IAO_CLI: '/iao/bin/iao',
  IAO_NODE_BIN: '/usr/bin/node',
  IAO_NODE_CLI: '/iao/cli.cjs',
  IAO_CLI_DIR: '/iao'
}

// ---- helpers ----

function makeArgs(overrides: Partial<Parameters<typeof createPty>[0]> = {}) {
  return { id: 'pty-1', cols: 80, rows: 24, cwd: '/project', ...overrides }
}

function makeCallbacks() {
  return { onData: vi.fn(), onExit: vi.fn() }
}

// ---- lifecycle ----

// killPty/killAllPtys signal the pty's process group via process.kill(-pid).
// The spy must swallow those calls — a real signal to group 4242 could hit
// arbitrary processes on the machine running the suite.
let mockProcessKill: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // resetAllMocks clears both call records AND implementations, preventing
  // mockImplementation() calls from leaking across tests.
  vi.resetAllMocks()
  mockProcessKill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  mockExistsSync.mockImplementation(() => false)
  mockRegister.mockReturnValue(IAO_SESSION as any)
  mockEnsureSkill.mockReturnValue('/SKILL.md')
})

afterEach(() => {
  killAllPtys()
})

// ===========================================================================
// resolveShell / findOnPath — tested through createPty's pty.spawn first arg
// ===========================================================================

describe("resolveShell('bash')", () => {
  it('returns the absolute bash path when bash exists on PATH', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    const savedPath = process.env.PATH
    process.env.PATH = '/usr/bin:/bin'
    mockExistsSync.mockImplementation((p: unknown) =>
      p === '/usr/bin/bash' || p === '/project'
    )

    createPty(makeArgs({ shell: 'bash' }), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith('/usr/bin/bash', expectedShellArgs, expect.any(Object))
    process.env.PATH = savedPath
  })
})

describe("resolveShell('zsh')", () => {
  it('falls back to $SHELL when zsh is not found on PATH', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    const savedPath = process.env.PATH
    const savedShell = process.env.SHELL
    process.env.PATH = '/usr/bin'
    process.env.SHELL = '/bin/fish'
    // zsh not on PATH (existsSync returns false for /usr/bin/zsh)
    mockExistsSync.mockImplementation((p: unknown) => p === '/project')

    createPty(makeArgs({ shell: 'zsh' }), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith('/bin/fish', expectedShellArgs, expect.any(Object))
    process.env.PATH = savedPath
    process.env.SHELL = savedShell
  })
})

describe("resolveShell('default')", () => {
  it('returns process.env.SHELL', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    const savedShell = process.env.SHELL
    process.env.SHELL = '/usr/bin/zsh'
    mockExistsSync.mockImplementation((p: unknown) => p === '/project')

    createPty(makeArgs({ shell: 'default' }), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith('/usr/bin/zsh', expectedShellArgs, expect.any(Object))
    process.env.SHELL = savedShell
  })
})

describe('resolveShell() — final fallback', () => {
  it('falls back to /bin/sh when SHELL is unset and no bash on PATH', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    const savedShell = process.env.SHELL
    const savedPath = process.env.PATH
    delete process.env.SHELL
    process.env.PATH = '/nonexistent'
    mockExistsSync.mockImplementation((p: unknown) => p === '/project')

    createPty(makeArgs(), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith('/bin/sh', expectedShellArgs, expect.any(Object))
    process.env.SHELL = savedShell
    process.env.PATH = savedPath
  })
})

describe('findOnPath', () => {
  it('returns null for a binary not found on PATH (tested via bash fallback → /bin/sh)', () => {
    // vi.mock('fs') does not intercept named imports inside pty.service.ts
    // (CJS live-binding limitation). Use an empty PATH so findOnPath has no
    // directories to scan — the real existsSync never gets the chance to find bash.
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    const savedShell = process.env.SHELL
    const savedPath = process.env.PATH
    delete process.env.SHELL
    process.env.PATH = '' // empty → split gives [''] → skipped by `if (!dir) continue`

    createPty(makeArgs({ shell: 'bash', cwd: undefined }), makeCallbacks())

    // bash not found → SHELL unset → bash not found → /bin/sh
    expect(mockSpawn).toHaveBeenCalledWith('/bin/sh', expectedShellArgs, expect.any(Object))
    process.env.SHELL = savedShell
    process.env.PATH = savedPath
  })

  it('returns the absolute path when the binary is found', () => {
    // Use the real /usr/bin where bash actually lives on this machine.
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    const savedPath = process.env.PATH
    process.env.PATH = '/usr/bin'

    createPty(makeArgs({ shell: 'bash', cwd: undefined }), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith('/usr/bin/bash', expectedShellArgs, expect.any(Object))
    process.env.PATH = savedPath
  })
})

// ===========================================================================
// createPty
// ===========================================================================

describe('createPty — cwd', () => {
  it('uses provided cwd when the directory exists', () => {
    // /tmp always exists on Linux; avoids relying on the fs mock which doesn't
    // intercept pty.service.ts named imports (CJS live-binding limitation).
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)

    createPty(makeArgs({ cwd: '/tmp' }), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String), expectedShellArgs,
      expect.objectContaining({ cwd: '/tmp' })
    )
  })

  it('falls back to os.homedir() when cwd does not exist', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(false)

    createPty(makeArgs({ cwd: '/nonexistent' }), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String), expectedShellArgs,
      expect.objectContaining({ cwd: '/home/testuser' })
    )
  })

  it('falls back to os.homedir() when cwd is undefined', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(false)

    createPty(makeArgs({ cwd: undefined }), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String), expectedShellArgs,
      expect.objectContaining({ cwd: '/home/testuser' })
    )
  })
})

describe('createPty — IAO session registration', () => {
  it('registers a session when nodeId is provided', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ id: 'pty-1', nodeId: 'node-1' }), makeCallbacks())

    expect(mockRegister).toHaveBeenCalledWith('pty-1', 'node-1')
  })

  it('does NOT register a session when nodeId is absent', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ nodeId: undefined }), makeCallbacks())

    expect(mockRegister).not.toHaveBeenCalled()
  })
})

describe('createPty — PATH / env injection', () => {
  it('prepends IAO_CLI_DIR to the child shell PATH', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    const savedPath = process.env.PATH
    process.env.PATH = '/usr/bin'

    createPty(makeArgs({ nodeId: 'node-1' }), makeCallbacks())

    const spawnEnv = mockSpawn.mock.calls[0][2].env
    expect(spawnEnv.PATH).toMatch(/^\/iao/)
    expect(spawnEnv.PATH).toContain('/usr/bin')
    process.env.PATH = savedPath
  })

  it('injects IAO_RPC_DIR, IAO_TOKEN and IAO_NODE_ID into child env', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ nodeId: 'node-1' }), makeCallbacks())

    const env = mockSpawn.mock.calls[0][2].env
    expect(env.IAO_RPC_DIR).toBe('/tmp/iao-rpc-test')
    expect(env.IAO_TOKEN).toBe('tok-abc')
    expect(env.IAO_NODE_ID).toBe('node-1')
  })

  it('does NOT inject IAO env when nodeId is absent (registerPtySession not called)', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockImplementation(() => true)

    createPty(makeArgs({ nodeId: undefined }), makeCallbacks())

    // The test runs inside the IAO app, so process.env may already carry
    // IAO_* vars. The correct assertion is behavioral: registerPtySession must
    // not have been called (no session, no injected credentials).
    expect(mockRegister).not.toHaveBeenCalled()
  })
})

describe('createPty — model env injection', () => {
  // The runner's own env could carry ANTHROPIC_MODEL; clear it around each test
  // so non-injection assertions see a truly absent var.
  let savedModelEnv: string | undefined
  beforeEach(() => {
    savedModelEnv = process.env.ANTHROPIC_MODEL
    delete process.env.ANTHROPIC_MODEL
  })
  afterEach(() => {
    if (savedModelEnv === undefined) delete process.env.ANTHROPIC_MODEL
    else process.env.ANTHROPIC_MODEL = savedModelEnv
  })

  it("injects the agent's model env var when a model is pinned", () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'claude', model: 'opus' }), makeCallbacks())

    expect(mockSpawn.mock.calls[0][2].env.ANTHROPIC_MODEL).toBe('opus')
  })

  it('does NOT inject a model env var when no model is pinned', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'claude', model: '' }), makeCallbacks())

    expect(mockSpawn.mock.calls[0][2].env.ANTHROPIC_MODEL).toBeUndefined()
  })

  it('does NOT inject a model env var for an agent that declares none', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    // codex has no modelEnv in the registry, so the model rides the launch flag
    // instead — no ANTHROPIC_MODEL is set.
    createPty(makeArgs({ command: 'codex', model: 'gpt-5' }), makeCallbacks())

    expect(mockSpawn.mock.calls[0][2].env.ANTHROPIC_MODEL).toBeUndefined()
  })

  it("injects Gemini's model env var (GEMINI_MODEL) when pinned", () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'gemini', model: 'gemini-2.5-pro' }), makeCallbacks())

    expect(mockSpawn.mock.calls[0][2].env.GEMINI_MODEL).toBe('gemini-2.5-pro')
  })
})

describe('createPty — model launch flag', () => {
  it('appends the model flag for an agent that has no model env var', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'codex', model: 'gpt-5.4' }), makeCallbacks())
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith('codex --model gpt-5.4\r')
    vi.useRealTimers()
  })

  it('shell-quotes a model value that contains spaces', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'cursor-agent', model: 'Claude 4 Sonnet' }), makeCallbacks())
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith("cursor-agent --model 'Claude 4 Sonnet'\r")
    vi.useRealTimers()
  })

  it('keeps the launch line bare for an env-var agent (model rides the env)', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'claude', model: 'opus' }), makeCallbacks())
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith('claude\r')
    vi.useRealTimers()
  })

  it('writes a bare command when no model is pinned', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'codex', model: '' }), makeCallbacks())
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith('codex\r')
    vi.useRealTimers()
  })
})

describe('createPty — command scheduling', () => {
  it('writes command + \\r to pty after 250ms', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'claude' }), makeCallbacks())

    expect(proc.write).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(proc.write).toHaveBeenCalledWith('claude\r')
    vi.useRealTimers()
  })

  it('does NOT write when command is undefined', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: undefined }), makeCallbacks())
    vi.advanceTimersByTime(500)

    expect(proc.write).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does NOT write when command is empty string', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: '' }), makeCallbacks())
    vi.advanceTimersByTime(500)

    expect(proc.write).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

// ===========================================================================
// createPty — file-based prompt delivery
// ===========================================================================

// `/tmp` is used as cwd because the fs mock does not intercept pty.service.ts's
// named `existsSync` import (CJS live-binding limitation, as elsewhere in this
// suite). A real, existing directory keeps workdir == cwd instead of falling
// back to os.homedir().
describe('createPty — file-based prompt delivery', () => {
  it('delivers the prompt via applyPrompt (repoCwd, roleId, claude → CLAUDE.md)', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(
      makeArgs({ cwd: '/tmp', nodeId: 'node-7', command: 'claude', prompt: 'You are a reviewer.' }),
      makeCallbacks(),
    )

    expect(mockApplyPrompt).toHaveBeenCalledWith('/tmp', 'node-7', 'CLAUDE.md', 'You are a reviewer.')
  })

  it('keys the role directory on nodeId, falling back to the pty id', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    // No nodeId → the per-mount pty id is used so the role still has a home.
    createPty(makeArgs({ id: 'pty-1', cwd: '/tmp', command: 'claude', prompt: 'Role' }), makeCallbacks())

    expect(mockApplyPrompt).toHaveBeenCalledWith('/tmp', 'pty-1', 'CLAUDE.md', 'Role')
  })

  it('launches the agent in the private role directory returned by applyPrompt', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockApplyPrompt.mockReturnValue('/tmp/.iao/roles/node-7')

    createPty(
      makeArgs({ cwd: '/tmp', nodeId: 'node-7', command: 'claude', prompt: 'Role' }),
      makeCallbacks(),
    )

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String), expectedShellArgs,
      expect.objectContaining({ cwd: '/tmp/.iao/roles/node-7' }),
    )
  })

  it('keeps the repo root as cwd when applyPrompt returns null (no role)', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockApplyPrompt.mockReturnValue(null)

    createPty(makeArgs({ cwd: '/tmp', command: 'claude', prompt: '   ' }), makeCallbacks())

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String), expectedShellArgs,
      expect.objectContaining({ cwd: '/tmp' }),
    )
  })

  it('resolves the context file by command (codex → AGENTS.md)', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(
      makeArgs({ cwd: '/tmp', nodeId: 'node-7', command: 'codex', prompt: 'Be terse.' }),
      makeCallbacks(),
    )

    expect(mockApplyPrompt).toHaveBeenCalledWith('/tmp', 'node-7', 'AGENTS.md', 'Be terse.')
  })

  it('launches the agent command WITHOUT any embedded prompt and never re-sends it', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: 'claude', prompt: 'You are a reviewer.' }), makeCallbacks())

    vi.advanceTimersByTime(250)
    expect(proc.write).toHaveBeenCalledWith('claude\r')
    // No native flag, no REPL fallback — the context file carries the prompt.
    vi.advanceTimersByTime(5000)
    expect(proc.write).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('passes an empty prompt to applyPrompt when the prompt is only whitespace', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(
      makeArgs({ cwd: '/tmp', nodeId: 'node-7', command: 'codex', prompt: '   ' }),
      makeCallbacks(),
    )

    expect(mockApplyPrompt).toHaveBeenCalledWith('/tmp', 'node-7', 'AGENTS.md', '')
  })

  it('does NOT call applyPrompt for a plain terminal (no command)', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ command: '', prompt: 'Be terse.' }), makeCallbacks())

    expect(mockApplyPrompt).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// createPty — workspace add-dir (role subdir → re-add repo root to workspace)
// ===========================================================================

// When the agent launches in its private role subdir, the repo root sits
// *outside* its cwd and it would prompt before touching every project file.
// IAO appends the agent's "add directory" flag pointing at the repo root so
// edits behave as if it had launched at the root.
describe('createPty — workspace add-dir', () => {
  it('appends --add-dir <repoCwd> for Claude when launched in a role subdir', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockApplyPrompt.mockReturnValue('/tmp/.iao/roles/node-7')

    createPty(
      makeArgs({ cwd: '/tmp', nodeId: 'node-7', command: 'claude', prompt: 'Role' }),
      makeCallbacks(),
    )
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith('claude --add-dir /tmp\r')
    vi.useRealTimers()
  })

  it('combines the model flag and --add-dir for a flag-model agent (codex)', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockApplyPrompt.mockReturnValue('/tmp/.iao/roles/node-7')

    createPty(
      makeArgs({ cwd: '/tmp', nodeId: 'node-7', command: 'codex', model: 'gpt-5.4', prompt: 'Role' }),
      makeCallbacks(),
    )
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith('codex --model gpt-5.4 --add-dir /tmp\r')
    vi.useRealTimers()
  })

  it("uses Gemini's --include-directories flag instead of --add-dir", () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockApplyPrompt.mockReturnValue('/tmp/.iao/roles/node-7')

    createPty(
      makeArgs({ cwd: '/tmp', nodeId: 'node-7', command: 'gemini', prompt: 'Role' }),
      makeCallbacks(),
    )
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith('gemini --include-directories /tmp\r')
    vi.useRealTimers()
  })

  it('appends no directory flag for an agent that declares none (opencode)', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockApplyPrompt.mockReturnValue('/tmp/.iao/roles/node-7')

    createPty(
      makeArgs({ cwd: '/tmp', nodeId: 'node-7', command: 'opencode', prompt: 'Role' }),
      makeCallbacks(),
    )
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith('opencode\r')
    vi.useRealTimers()
  })

  it('does NOT append --add-dir when there is no role subdir (agent already at repo root)', () => {
    vi.useFakeTimers()
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockApplyPrompt.mockReturnValue(null)

    createPty(makeArgs({ cwd: '/tmp', command: 'claude', prompt: '   ' }), makeCallbacks())
    vi.advanceTimersByTime(250)

    expect(proc.write).toHaveBeenCalledWith('claude\r')
    vi.useRealTimers()
  })
})

describe('createPty — ensureIAOSkill best-effort', () => {
  it('continues and spawns the pty even if ensureIAOSkill throws', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockEnsureSkill.mockImplementation(() => { throw new Error('template missing') })

    expect(() => createPty(makeArgs(), makeCallbacks())).not.toThrow()
    expect(mockSpawn).toHaveBeenCalled()
  })
})

describe('createPty — onData callback', () => {
  it('calls iaoService.appendOutput with nodeId and data when nodeId is present', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ nodeId: 'node-1' }), makeCallbacks())
    proc._triggerData('output chunk')

    expect(mockAppend).toHaveBeenCalledWith('node-1', 'output chunk')
  })

  it('invokes the caller onData callback with id and data', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    const { onData, onExit } = makeCallbacks()

    createPty(makeArgs({ id: 'pty-1' }), { onData, onExit })
    proc._triggerData('hello')

    expect(onData).toHaveBeenCalledWith({ id: 'pty-1', data: 'hello' })
  })

  it('does NOT call appendOutput when nodeId is absent', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ nodeId: undefined }), makeCallbacks())
    proc._triggerData('data')

    expect(mockAppend).not.toHaveBeenCalled()
  })
})

describe('createPty — onExit callback', () => {
  it('calls unregisterPtySession, the onExit callback, and removes pty from map', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    const { onData, onExit } = makeCallbacks()

    createPty(makeArgs({ id: 'pty-x' }), { onData, onExit })
    proc._triggerExit()

    expect(mockUnregister).toHaveBeenCalledWith('pty-x')
    expect(onExit).toHaveBeenCalledWith({ id: 'pty-x' })
    // pty removed from map — a subsequent write is silently ignored
    writeToPty('pty-x', 'after exit')
    expect(proc.write).not.toHaveBeenCalled()
  })
})

describe('createPty — return value', () => {
  it('returns { id, shell } with the spawned shell path', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    const savedShell = process.env.SHELL
    process.env.SHELL = '/bin/bash'
    mockExistsSync.mockReturnValue(true)

    const result = createPty(makeArgs({ id: 'pty-ret' }), makeCallbacks())

    expect(result.id).toBe('pty-ret')
    expect(result.shell).toBe('/bin/bash')
    process.env.SHELL = savedShell
  })
})

// ===========================================================================
// writeToPty
// ===========================================================================

describe('writeToPty', () => {
  it('does not throw when the id does not exist in the map', () => {
    expect(() => writeToPty('ghost', 'data')).not.toThrow()
  })

  it('writes data to the pty when the id is active', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ id: 'pty-w' }), makeCallbacks())
    writeToPty('pty-w', 'ls -la\r')

    expect(proc.write).toHaveBeenCalledWith('ls -la\r')
  })
})

// ===========================================================================
// resizePty
// ===========================================================================

describe('resizePty', () => {
  it('clamps cols to at least 1', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ id: 'pty-rc' }), makeCallbacks())
    resizePty('pty-rc', 0, 24)

    expect(proc.resize).toHaveBeenCalledWith(1, 24)
  })

  it('clamps rows to at least 1', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ id: 'pty-rr' }), makeCallbacks())
    resizePty('pty-rr', 80, -3)

    expect(proc.resize).toHaveBeenCalledWith(80, 1)
  })

  it('ignores errors silently when pty has already exited', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    proc.resize.mockImplementation(() => { throw new Error('pty gone') })

    createPty(makeArgs({ id: 'pty-re' }), makeCallbacks())

    expect(() => resizePty('pty-re', 80, 24)).not.toThrow()
  })

  it('does not throw when id does not exist', () => {
    expect(() => resizePty('ghost', 80, 24)).not.toThrow()
  })
})

// ===========================================================================
// killPty
// ===========================================================================

describe('killPty', () => {
  it('unregisters the IAO session, kills the pty, and removes it from the map', () => {
    const proc = makeMockProc()
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ id: 'pty-k' }), makeCallbacks())
    killPty('pty-k')

    expect(mockUnregister).toHaveBeenCalledWith('pty-k')
    expect(proc.kill).toHaveBeenCalled()
    // pty removed from map — subsequent write is a no-op
    writeToPty('pty-k', 'x')
    expect(proc.write).not.toHaveBeenCalled()
  })

  // Regression: proc.kill() alone only signals the shell — agents that ignore
  // SIGHUP survived as orphans burning CPU after their node was deleted.
  it('SIGHUPs the process group, then SIGKILLs it after the grace period', () => {
    vi.useFakeTimers()
    const proc = makeMockProc(5151)
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ id: 'pty-tree' }), makeCallbacks())
    killPty('pty-tree')

    expect(mockProcessKill).toHaveBeenCalledWith(-5151, 'SIGHUP')
    expect(mockProcessKill).not.toHaveBeenCalledWith(-5151, 'SIGKILL')

    vi.advanceTimersByTime(2000)
    expect(mockProcessKill).toHaveBeenCalledWith(-5151, 'SIGKILL')
    vi.useRealTimers()
  })

  it('does not throw when the process group is already gone (ESRCH)', () => {
    vi.useFakeTimers()
    const proc = makeMockProc(5252)
    mockSpawn.mockReturnValue(proc as any)
    mockExistsSync.mockReturnValue(true)
    mockProcessKill.mockImplementation(() => { throw new Error('ESRCH') })

    createPty(makeArgs({ id: 'pty-gone' }), makeCallbacks())

    expect(() => {
      killPty('pty-gone')
      vi.advanceTimersByTime(2000)
    }).not.toThrow()
    vi.useRealTimers()
  })
})

// ===========================================================================
// killAllPtys
// ===========================================================================

describe('killAllPtys', () => {
  it('kills all active ptys, unregisters all sessions, and clears the map', () => {
    const proc1 = makeMockProc()
    const proc2 = makeMockProc()
    mockSpawn
      .mockReturnValueOnce(proc1 as any)
      .mockReturnValueOnce(proc2 as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ id: 'pty-a' }), makeCallbacks())
    createPty(makeArgs({ id: 'pty-b' }), makeCallbacks())
    killAllPtys()

    expect(proc1.kill).toHaveBeenCalled()
    expect(proc2.kill).toHaveBeenCalled()
    expect(mockUnregister).toHaveBeenCalledWith('pty-a')
    expect(mockUnregister).toHaveBeenCalledWith('pty-b')
    // Map is cleared — subsequent writes are no-ops
    writeToPty('pty-a', 'x')
    writeToPty('pty-b', 'x')
    expect(proc1.write).not.toHaveBeenCalled()
    expect(proc2.write).not.toHaveBeenCalled()
  })

  it('SIGKILLs each process group immediately (no grace timer survives app quit)', () => {
    const proc1 = makeMockProc(6161)
    const proc2 = makeMockProc(6262)
    mockSpawn
      .mockReturnValueOnce(proc1 as any)
      .mockReturnValueOnce(proc2 as any)
    mockExistsSync.mockReturnValue(true)

    createPty(makeArgs({ id: 'pty-a' }), makeCallbacks())
    createPty(makeArgs({ id: 'pty-b' }), makeCallbacks())
    killAllPtys()

    expect(mockProcessKill).toHaveBeenCalledWith(-6161, 'SIGKILL')
    expect(mockProcessKill).toHaveBeenCalledWith(-6262, 'SIGKILL')
  })
})
