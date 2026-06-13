import { describe, it, expect } from 'vitest'
import { AGENTS, agentByCmd, contextFileForCmd, DEFAULT_CONTEXT_FILE } from './agents'
import type { AgentKey } from './agents'

describe('AGENTS registry', () => {
  it('contains codex, claude, gemini, copilot, opencode, cursor, and terminal', () => {
    const keys = Object.keys(AGENTS) as AgentKey[]
    expect(keys).toContain('codex')
    expect(keys).toContain('claude')
    expect(keys).toContain('gemini')
    expect(keys).toContain('copilot')
    expect(keys).toContain('opencode')
    expect(keys).toContain('cursor')
    expect(keys).toContain('terminal')
  })

  it('every entry has a matching key, non-empty label and icon', () => {
    for (const [key, def] of Object.entries(AGENTS)) {
      expect(def.key, `${key}.key`).toBe(key)
      expect(def.label, `${key}.label`).toBeTruthy()
      expect(def.icon, `${key}.icon`).toBeTruthy()
    }
  })

  it('every entry except the plain terminal has a non-empty cmd', () => {
    for (const [key, def] of Object.entries(AGENTS)) {
      if (key === 'terminal') {
        expect(def.cmd, `${key}.cmd`).toBe('')
      } else {
        expect(def.cmd, `${key}.cmd`).toBeTruthy()
      }
    }
  })

  it('codex, claude, copilot, and gemini declare a skillDir for IAO skill installation', () => {
    expect(AGENTS.codex.skillDir).toBe('.codex/skills/iao')
    expect(AGENTS.claude.skillDir).toBe('.claude/skills/iao')
    expect(AGENTS.copilot.skillDir).toBe('.copilot/skills/iao')
    expect(AGENTS.gemini.skillDir).toBe('.gemini/skills/iao')
  })

  it('gemini is available as a launchable command', () => {
    expect(AGENTS.gemini.cmd).toBe('gemini')
    expect(AGENTS.gemini.label).toBe('Gemini')
  })

  it('copilot cmd invokes copilot directly', () => {
    expect(AGENTS.copilot.cmd).toBe('copilot')
  })

  it('opencode and cursor launch their CLIs and declare skill dirs', () => {
    expect(AGENTS.opencode.cmd).toBe('opencode')
    expect(AGENTS.opencode.skillDir).toBe('.opencode/skills/iao')
    expect(AGENTS.cursor.cmd).toBe('cursor-agent')
    expect(AGENTS.cursor.skillDir).toBe('.cursor/skills/iao')
  })

  it('the plain terminal opens a shell with no command and no skill dir', () => {
    expect(AGENTS.terminal.cmd).toBe('')
    expect(AGENTS.terminal.skillDir).toBeUndefined()
  })

  it('maps each agent to the context file it reads its prompt from', () => {
    expect(AGENTS.claude.contextFile).toBe('CLAUDE.md')
    expect(AGENTS.codex.contextFile).toBe('AGENTS.md')
    expect(AGENTS.opencode.contextFile).toBe('AGENTS.md')
    expect(AGENTS.cursor.contextFile).toBe('AGENTS.md')
    expect(AGENTS.gemini.contextFile).toBe('GEMINI.md')
    expect(AGENTS.copilot.contextFile).toBe('.github/copilot-instructions.md')
  })

  it('the plain terminal declares no context file', () => {
    expect(AGENTS.terminal.contextFile).toBeUndefined()
  })
})

describe('contextFileForCmd', () => {
  it('resolves the context file by launch command', () => {
    expect(contextFileForCmd('claude')).toBe('CLAUDE.md')
    expect(contextFileForCmd('gemini')).toBe('GEMINI.md')
    expect(contextFileForCmd('cursor-agent')).toBe('AGENTS.md')
    expect(contextFileForCmd('copilot')).toBe('.github/copilot-instructions.md')
  })

  it('falls back to AGENTS.md for an unknown or empty command', () => {
    expect(contextFileForCmd('nonexistent-cli')).toBe(DEFAULT_CONTEXT_FILE)
    expect(contextFileForCmd('')).toBe(DEFAULT_CONTEXT_FILE)
    expect(DEFAULT_CONTEXT_FILE).toBe('AGENTS.md')
  })
})

describe('agentByCmd', () => {
  it('resolves an agent definition by its launch command', () => {
    expect(agentByCmd('claude')).toBe(AGENTS.claude)
    expect(agentByCmd('cursor-agent')).toBe(AGENTS.cursor)
  })

  it('returns undefined for an empty command (plain terminal)', () => {
    expect(agentByCmd('')).toBeUndefined()
  })

  it('returns undefined for an unknown command', () => {
    expect(agentByCmd('nonexistent-cli')).toBeUndefined()
  })
})
