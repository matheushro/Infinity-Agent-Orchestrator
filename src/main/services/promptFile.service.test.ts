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
  }
  return { ...actual, ...overrides, default: { ...actual, ...overrides } }
})

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { applyPrompt } from './promptFile.service'

const mockExistsSync = vi.mocked(existsSync)
const mockMkdirSync = vi.mocked(mkdirSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)
const mockAppendFileSync = vi.mocked(appendFileSync)

const CWD = '/project'
const CLAUDE = '/project/CLAUDE.md'
const GIT = '/project/.git'
const GITIGNORE = '/project/.gitignore'

const BLOCK_START = '<!-- iao:prompt start -->'
const BLOCK_END = '<!-- iao:prompt end -->'

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

describe('applyPrompt — creating the block', () => {
  it('writes a fresh context file with the prompt wrapped in markers', () => {
    mockFs({ exists: [GIT] }) // git repo, but no CLAUDE.md yet

    applyPrompt(CWD, 'CLAUDE.md', 'You are a reviewer.')

    expect(mockMkdirSync).toHaveBeenCalledWith(CWD, { recursive: true })
    expect(written(CLAUDE)).toBe(`${BLOCK_START}\nYou are a reviewer.\n${BLOCK_END}\n`)
  })

  it('creates parent directories for a nested context file', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, '.github/copilot-instructions.md', 'Be terse.')

    expect(mockMkdirSync).toHaveBeenCalledWith('/project/.github', { recursive: true })
    expect(written('/project/.github/copilot-instructions.md')).toContain('Be terse.')
  })

  it('trims surrounding whitespace from the prompt before writing the block', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, 'CLAUDE.md', '  \n  Role here  \n  ')

    expect(written(CLAUDE)).toBe(`${BLOCK_START}\nRole here\n${BLOCK_END}\n`)
  })
})

describe('applyPrompt — updating an existing block', () => {
  it('replaces only the block and preserves user content around it', () => {
    const existing = `# My project\n\nUser notes.\n\n${BLOCK_START}\nOLD ROLE\n${BLOCK_END}\n\nMore notes.\n`
    mockFs({ exists: [CLAUDE, GIT], contents: { [CLAUDE]: existing } })

    applyPrompt(CWD, 'CLAUDE.md', 'NEW ROLE')

    const out = written(CLAUDE)!
    expect(out).toContain('# My project')
    expect(out).toContain('User notes.')
    expect(out).toContain('More notes.')
    expect(out).toContain('NEW ROLE')
    expect(out).not.toContain('OLD ROLE')
  })

  it('appends a block to a user file that has none, keeping their content intact', () => {
    mockFs({ exists: [CLAUDE, GIT], contents: { [CLAUDE]: '# My project\n' } })

    applyPrompt(CWD, 'CLAUDE.md', 'My role')

    const out = written(CLAUDE)!
    expect(out).toContain('# My project')
    expect(out).toContain(`${BLOCK_START}\nMy role\n${BLOCK_END}`)
  })
})

describe('applyPrompt — empty prompt removes the block', () => {
  it('strips the block but keeps the user content around it', () => {
    const existing = `# My project\n\n${BLOCK_START}\nOLD ROLE\n${BLOCK_END}\n`
    mockFs({ exists: [CLAUDE, GIT], contents: { [CLAUDE]: existing } })

    applyPrompt(CWD, 'CLAUDE.md', '')

    const out = written(CLAUDE)!
    expect(out).toContain('# My project')
    expect(out).not.toContain(BLOCK_START)
    expect(out).not.toContain('OLD ROLE')
  })

  it('does nothing when the prompt is empty and there is no block', () => {
    mockFs({ exists: [CLAUDE, GIT], contents: { [CLAUDE]: '# My project\n' } })

    applyPrompt(CWD, 'CLAUDE.md', '   ')

    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })
})

describe('applyPrompt — .gitignore handling', () => {
  it('gitignores a context file that IAO created from scratch (inside a git repo)', () => {
    mockFs({ exists: [GIT] })

    applyPrompt(CWD, 'CLAUDE.md', 'Role')

    expect(mockAppendFileSync).toHaveBeenCalledWith(GITIGNORE, 'CLAUDE.md\n')
  })

  it('does NOT touch .gitignore when the context file already belonged to the user', () => {
    mockFs({ exists: [CLAUDE, GIT], contents: { [CLAUDE]: '# Mine\n' } })

    applyPrompt(CWD, 'CLAUDE.md', 'Role')

    expect(mockAppendFileSync).not.toHaveBeenCalled()
  })

  it('does NOT create a .gitignore outside a git repo', () => {
    mockFs({ exists: [] }) // no .git, no file

    applyPrompt(CWD, 'CLAUDE.md', 'Role')

    expect(mockWriteFileSync).toHaveBeenCalled() // the context file is still written
    expect(mockAppendFileSync).not.toHaveBeenCalled()
  })

  it('does NOT duplicate an entry already present in .gitignore', () => {
    mockFs({ exists: [GIT, GITIGNORE], contents: { [GITIGNORE]: 'node_modules\nCLAUDE.md\n' } })

    applyPrompt(CWD, 'CLAUDE.md', 'Role')

    expect(mockAppendFileSync).not.toHaveBeenCalled()
  })

  it('appends a newline before the entry when .gitignore lacks a trailing newline', () => {
    mockFs({ exists: [GIT, GITIGNORE], contents: { [GITIGNORE]: 'node_modules' } })

    applyPrompt(CWD, 'CLAUDE.md', 'Role')

    expect(mockAppendFileSync).toHaveBeenCalledWith(GITIGNORE, '\nCLAUDE.md\n')
  })
})

describe('applyPrompt — best-effort', () => {
  it('does not throw when a filesystem write fails', () => {
    mockFs({ exists: [GIT] })
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES')
    })

    expect(() => applyPrompt(CWD, 'CLAUDE.md', 'Role')).not.toThrow()
  })
})
