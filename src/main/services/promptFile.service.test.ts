import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- boundary mock: fs (named imports, mirrors skill.service.test pattern) ----

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const overrides = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    rmSync: vi.fn(),
  }
  return { ...actual, ...overrides, default: { ...actual, ...overrides } }
})

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'fs'
import { applyPrompt, ensureRoleDir } from './promptFile.service'

const mockExistsSync = vi.mocked(existsSync)
const mockMkdirSync = vi.mocked(mkdirSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)
const mockAppendFileSync = vi.mocked(appendFileSync)
const mockRmSync = vi.mocked(rmSync)

const CWD = '/project'
const ROLE = 'node-1'
const ROLE_DIR = '/project/.iao/roles/node-1'
const CLAUDE = '/project/.iao/roles/node-1/CLAUDE.md'
const GIT = '/project/.git'
const GITIGNORE = '/project/.gitignore'

/** Configure existsSync (by path set) and readFileSync (by path→content map). */
function mockFs(opts: { exists?: string[]; contents?: Record<string, string> } = {}): void {
  const exists = new Set(opts.exists ?? [])
  mockExistsSync.mockImplementation((p) => exists.has(String(p)))
  mockReadFileSync.mockImplementation((p) => opts.contents?.[String(p)] ?? '')
}

/** The content written to a given path, or undefined if it was never written. */
function written(path: string): string | undefined {
  const call = mockWriteFileSync.mock.calls.find(([p]) => p === path)
  return call?.[1] as string | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('applyPrompt — writing the role file into a private subdirectory', () => {
  it('writes the prompt into <repo>/.iao/roles/<id>/<contextFile> and returns that dir', () => {
    mockFs({ exists: [GIT] })

    const dir = applyPrompt(CWD, ROLE, 'CLAUDE.md', 'You are a reviewer.')

    expect(dir).toBe(ROLE_DIR)
    expect(mockMkdirSync).toHaveBeenCalledWith(ROLE_DIR, { recursive: true })
    expect(written(CLAUDE)).toContain('You are a reviewer.')
  })

  it('never writes the repository\'s own context file', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, ROLE, 'CLAUDE.md', 'You are a reviewer.')

    // The repo-root CLAUDE.md / AGENTS.md must be untouched.
    expect(written('/project/CLAUDE.md')).toBeUndefined()
    expect(written('/project/AGENTS.md')).toBeUndefined()
  })

  it('gives two terminals in the same folder different role directories', () => {
    mockFs({ exists: [GIT] })

    const a = applyPrompt(CWD, 'node-a', 'CLAUDE.md', 'Role A')
    const b = applyPrompt(CWD, 'node-b', 'CLAUDE.md', 'Role B')

    expect(a).toBe('/project/.iao/roles/node-a')
    expect(b).toBe('/project/.iao/roles/node-b')
    expect(a).not.toBe(b)
  })

  it('trims surrounding whitespace from the prompt', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, ROLE, 'CLAUDE.md', '  \n  Role here  \n  ')

    expect(written(CLAUDE)).toContain('\nRole here\n')
    expect(written(CLAUDE)).not.toContain('  Role here')
  })

  it('creates parent directories for a nested context file', () => {
    mockFs({ exists: [GIT] })

    const dir = applyPrompt(CWD, ROLE, '.github/copilot-instructions.md', 'Be terse.')

    expect(dir).toBe(ROLE_DIR)
    expect(mockMkdirSync).toHaveBeenCalledWith(`${ROLE_DIR}/.github`, { recursive: true })
    expect(written(`${ROLE_DIR}/.github/copilot-instructions.md`)).toContain('Be terse.')
  })

  it('resolves the context file name it is given (codex → AGENTS.md)', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, ROLE, 'AGENTS.md', 'Be terse.')

    expect(written(`${ROLE_DIR}/AGENTS.md`)).toContain('Be terse.')
  })

  it('appends a footer forcing the agent to also read the repo-root context file', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, ROLE, 'CLAUDE.md', 'You are a reviewer.')

    const content = written(CLAUDE) ?? ''
    // The role prompt still comes first…
    expect(content.indexOf('You are a reviewer.')).toBeGreaterThanOrEqual(0)
    // …followed by an instruction to also load the project root's own context file.
    expect(content).toContain('Project context — required')
    expect(content).toContain('repository root')
    expect(content.indexOf('You are a reviewer.')).toBeLessThan(
      content.indexOf('Project context — required'),
    )
  })

  it('names the agent\'s own context file in the footer (codex → AGENTS.md)', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, ROLE, 'AGENTS.md', 'Be terse.')

    const content = written(`${ROLE_DIR}/AGENTS.md`) ?? ''
    expect(content).toContain('`AGENTS.md` at the repository root')
    expect(content).not.toContain('CLAUDE.md')
  })
})

describe('applyPrompt — empty prompt clears the role', () => {
  it('removes a stale role file and returns null', () => {
    mockFs({ exists: [GIT, CLAUDE] })

    const dir = applyPrompt(CWD, ROLE, 'CLAUDE.md', '   ')

    expect(dir).toBeNull()
    expect(mockRmSync).toHaveBeenCalledWith(CLAUDE)
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('does nothing when the prompt is empty and there is no role file', () => {
    mockFs({ exists: [GIT] })

    const dir = applyPrompt(CWD, ROLE, 'CLAUDE.md', '')

    expect(dir).toBeNull()
    expect(mockRmSync).not.toHaveBeenCalled()
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })
})

describe('applyPrompt — .gitignore handling', () => {
  it('adds .iao/ to .gitignore inside a git repo', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, ROLE, 'CLAUDE.md', 'Role')

    expect(mockAppendFileSync).toHaveBeenCalledWith(GITIGNORE, '.iao/\n')
  })

  it('does NOT touch .gitignore outside a git repo', () => {
    mockFs({ exists: [] }) // no .git

    applyPrompt(CWD, ROLE, 'CLAUDE.md', 'Role')

    expect(mockWriteFileSync).toHaveBeenCalled() // the role file is still written
    expect(mockAppendFileSync).not.toHaveBeenCalled()
  })

  it('does NOT duplicate an entry already present in .gitignore', () => {
    mockFs({ exists: [GIT, GITIGNORE], contents: { [GITIGNORE]: 'node_modules\n.iao/\n' } })

    applyPrompt(CWD, ROLE, 'CLAUDE.md', 'Role')

    expect(mockAppendFileSync).not.toHaveBeenCalled()
  })

  it('treats /.iao and .iao (no slash) as already ignored', () => {
    mockFs({ exists: [GIT, GITIGNORE], contents: { [GITIGNORE]: '/.iao\n' } })

    applyPrompt(CWD, ROLE, 'CLAUDE.md', 'Role')

    expect(mockAppendFileSync).not.toHaveBeenCalled()
  })

  it('appends a newline before the entry when .gitignore lacks a trailing newline', () => {
    mockFs({ exists: [GIT, GITIGNORE], contents: { [GITIGNORE]: 'node_modules' } })

    applyPrompt(CWD, ROLE, 'CLAUDE.md', 'Role')

    expect(mockAppendFileSync).toHaveBeenCalledWith(GITIGNORE, '\n.iao/\n')
  })
})

describe('applyPrompt — best-effort', () => {
  it('does not throw and returns null when a filesystem write fails', () => {
    mockFs({ exists: [GIT] })
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES')
    })

    let dir: string | null = 'unset' as unknown as string
    expect(() => {
      dir = applyPrompt(CWD, ROLE, 'CLAUDE.md', 'Role')
    }).not.toThrow()
    expect(dir).toBeNull()
  })
})

describe('ensureRoleDir — terminal identificável sem prompt', () => {
  it('cria o diretório de role e o gitignore, sem escrever arquivo de contexto', () => {
    mockFs({ exists: [GIT] })

    expect(ensureRoleDir(CWD, ROLE)).toBe(ROLE_DIR)
    expect(mockMkdirSync).toHaveBeenCalledWith(ROLE_DIR, { recursive: true })
    expect(mockWriteFileSync).not.toHaveBeenCalled()
    expect(mockAppendFileSync).toHaveBeenCalledWith(GITIGNORE, '.iao/\n')
  })

  it('devolve null sem lançar quando a criação falha', () => {
    mockFs()
    mockMkdirSync.mockImplementation(() => {
      throw new Error('EACCES')
    })

    expect(() => expect(ensureRoleDir(CWD, ROLE)).toBeNull()).not.toThrow()
  })
})
