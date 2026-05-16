import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync as realExistsSync, readFileSync as realReadFileSync } from 'node:fs'
import { join } from 'node:path'

// ---- boundary mocks (hoisted before module imports) ----

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/app') }
}))

vi.mock('os', () => ({
  default: { homedir: vi.fn(() => '/home/testuser') }
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const overrides = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn()
  }
  return { ...actual, ...overrides, default: { ...actual, ...overrides } }
})

import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { ensureIAOSkill, skillPathFor } from './skill.service'

const mockExistsSync = vi.mocked(existsSync)
const mockMkdirSync = vi.mocked(mkdirSync)
const mockCopyFileSync = vi.mocked(copyFileSync)

const SRC = '/app/resources/skills/iao/SKILL.md'
const CODEX_DIR = '/home/testuser/.codex/skills/iao'
const CODEX_DEST = `${CODEX_DIR}/SKILL.md`
const CLAUDE_DIR = '/home/testuser/.claude/skills/iao'
const CLAUDE_DEST = `${CLAUDE_DIR}/SKILL.md`
const REAL_SRC = join(process.cwd(), 'resources', 'skills', 'iao', 'SKILL.md')

describe('skill.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------- skillPathFor ----------

  describe('skillPathFor', () => {
    it('returns the primary Codex skill path', () => {
      expect(skillPathFor('/any/project')).toBe(CODEX_DEST)
    })

    it('returns same path when projectPath is omitted', () => {
      expect(skillPathFor()).toBe(CODEX_DEST)
    })
  })

  // ---------- ensureIAOSkill ----------

  describe('ensureIAOSkill', () => {
    it('throws when template source is absent', () => {
      mockExistsSync.mockReturnValue(false)
      expect(() => ensureIAOSkill()).toThrow('skill.service: template skill missing')
    })

    it('creates SKILL.md in ~/.codex/skills/iao/ when destination is absent', () => {
      mockExistsSync
        .mockReturnValueOnce(true)  // source exists
        .mockReturnValueOnce(false) // codex dest absent
        .mockReturnValueOnce(false) // claude dest absent

      ensureIAOSkill()

      expect(mockMkdirSync).toHaveBeenCalledWith(CODEX_DIR, { recursive: true })
      expect(mockCopyFileSync).toHaveBeenCalledWith(SRC, CODEX_DEST)
    })

    it('creates SKILL.md in ~/.claude/skills/iao/ when destination is absent', () => {
      mockExistsSync
        .mockReturnValueOnce(true)  // source exists
        .mockReturnValueOnce(false) // codex dest absent
        .mockReturnValueOnce(false) // claude dest absent

      ensureIAOSkill()

      expect(mockMkdirSync).toHaveBeenCalledWith(CLAUDE_DIR, { recursive: true })
      expect(mockCopyFileSync).toHaveBeenCalledWith(SRC, CLAUDE_DEST)
    })

    it('does NOT overwrite existing files (preserves customizations)', () => {
      mockExistsSync.mockReturnValue(true) // source + both dests exist

      ensureIAOSkill()

      expect(mockMkdirSync).not.toHaveBeenCalled()
      expect(mockCopyFileSync).not.toHaveBeenCalled()
    })

    it('copies the same packaged source into both user-level destinations', () => {
      mockExistsSync.mockImplementation((path) => path === SRC)

      ensureIAOSkill()

      expect(mockCopyFileSync.mock.calls).toEqual([
        [SRC, CODEX_DEST],
        [SRC, CLAUDE_DEST]
      ])
    })

    it('only creates the missing destination when one already exists', () => {
      mockExistsSync
        .mockReturnValueOnce(true)  // source exists
        .mockReturnValueOnce(true)  // codex dest already exists
        .mockReturnValueOnce(false) // claude dest absent

      ensureIAOSkill()

      expect(mockCopyFileSync).toHaveBeenCalledTimes(1)
      expect(mockCopyFileSync).toHaveBeenCalledWith(SRC, CLAUDE_DEST)
    })

    it('returns the primary (Codex) path', () => {
      mockExistsSync.mockReturnValue(true)

      expect(ensureIAOSkill()).toBe(CODEX_DEST)
    })

    it('ignores the projectPath argument (user-global installation)', () => {
      mockExistsSync.mockReturnValue(true)

      // Should not throw and should return the user-global path regardless of arg
      expect(ensureIAOSkill('/some/project')).toBe(CODEX_DEST)
      expect(ensureIAOSkill('')).toBe(CODEX_DEST)
    })
  })

  describe('resources/skills/iao/SKILL.md', () => {
    it('exists at the expected repository path', () => {
      expect(realExistsSync(REAL_SRC)).toBe(true)
      expect(realReadFileSync(REAL_SRC, 'utf8')).toContain('iao agents')
    })

    it('smoke-documents the four main CLI commands', () => {
      const text = realReadFileSync(REAL_SRC, 'utf8')
      const commandsSection = text.split('## Commands')[1]?.split('## How to talk to another agent')[0] ?? ''

      expect(commandsSection).toContain('iao agents')
      expect(commandsSection).toContain('iao send "Agent Name" "prompt"')
      expect(commandsSection).toContain('iao inspect "Agent Name"')
      expect(commandsSection).toContain('iao debug')
    })
  })
})
