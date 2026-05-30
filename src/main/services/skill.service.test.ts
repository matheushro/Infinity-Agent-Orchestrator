import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync as realExistsSync, readFileSync as realReadFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENTS } from '@shared/agents'

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
const COPILOT_DIR = '/home/testuser/.copilot/skills/iao'
const COPILOT_DEST = `${COPILOT_DIR}/SKILL.md`
const GEMINI_DIR = '/home/testuser/.gemini/skills/iao'
const GEMINI_DEST = `${GEMINI_DIR}/SKILL.md`
const OPENCODE_DIR = '/home/testuser/.opencode/skills/iao'
const OPENCODE_DEST = `${OPENCODE_DIR}/SKILL.md`
const CURSOR_DIR = '/home/testuser/.cursor/skills/iao'
const CURSOR_DEST = `${CURSOR_DIR}/SKILL.md`
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
      mockExistsSync.mockReturnValue(true) // source exists; always overwrite dests

      ensureIAOSkill()

      expect(mockMkdirSync).toHaveBeenCalledWith(CODEX_DIR, { recursive: true })
      expect(mockCopyFileSync).toHaveBeenCalledWith(SRC, CODEX_DEST)
    })

    it('creates SKILL.md in ~/.claude/skills/iao/ when destination is absent', () => {
      mockExistsSync.mockReturnValue(true)

      ensureIAOSkill()

      expect(mockMkdirSync).toHaveBeenCalledWith(CLAUDE_DIR, { recursive: true })
      expect(mockCopyFileSync).toHaveBeenCalledWith(SRC, CLAUDE_DEST)
    })

    it('creates SKILL.md in ~/.copilot/skills/iao/ when destination is absent', () => {
      mockExistsSync.mockReturnValue(true)

      ensureIAOSkill()

      expect(mockMkdirSync).toHaveBeenCalledWith(COPILOT_DIR, { recursive: true })
      expect(mockCopyFileSync).toHaveBeenCalledWith(SRC, COPILOT_DEST)
    })

    it('creates SKILL.md in ~/.gemini/skills/iao/ when destination is absent', () => {
      mockExistsSync.mockReturnValue(true)

      ensureIAOSkill()

      expect(mockMkdirSync).toHaveBeenCalledWith(GEMINI_DIR, { recursive: true })
      expect(mockCopyFileSync).toHaveBeenCalledWith(SRC, GEMINI_DEST)
    })

    it('always overwrites existing destinations so agents pick up template updates', () => {
      mockExistsSync.mockReturnValue(true) // source + all dests exist

      ensureIAOSkill()

      const destinations = mockCopyFileSync.mock.calls.map(([, dest]) => dest)
      expect(destinations).toEqual(
        expect.arrayContaining([
          CODEX_DEST,
          CLAUDE_DEST,
          COPILOT_DEST,
          GEMINI_DEST,
          OPENCODE_DEST,
          CURSOR_DEST,
        ])
      )
      expect(mockCopyFileSync).toHaveBeenCalledTimes(6)
    })

    it('copies the same packaged source into every user-level destination', () => {
      mockExistsSync.mockImplementation((path) => path === SRC)

      ensureIAOSkill()

      const destinations = mockCopyFileSync.mock.calls.map(([, dest]) => dest)
      expect(destinations).toEqual(
        expect.arrayContaining([
          CODEX_DEST,
          CLAUDE_DEST,
          COPILOT_DEST,
          GEMINI_DEST,
          OPENCODE_DEST,
          CURSOR_DEST,
        ])
      )
      for (const [src] of mockCopyFileSync.mock.calls) {
        expect(src).toBe(SRC)
      }
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

  describe('AGENTS registry skillDirs', () => {
    it('declares a Copilot skillDir for IAO skill installation', () => {
      expect(AGENTS.copilot.skillDir).toBe('.copilot/skills/iao')
    })
  })
})
