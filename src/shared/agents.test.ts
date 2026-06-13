import { describe, it, expect } from 'vitest'
import { AGENTS, agentByCmd, shellQuote } from './agents'
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

  it('only claude exposes a native system-prompt flag (promptArg)', () => {
    expect(AGENTS.claude.promptArg).toBeTypeOf('function')
    for (const [key, def] of Object.entries(AGENTS)) {
      if (key !== 'claude') expect(def.promptArg, `${key}.promptArg`).toBeUndefined()
    }
  })

  it("claude's promptArg builds an --append-system-prompt flag with a quoted prompt", () => {
    expect(AGENTS.claude.promptArg?.('Be helpful.')).toBe(
      `--append-system-prompt 'Be helpful.'`,
    )
  })
})

describe('shellQuote', () => {
  it('wraps a plain value in single quotes', () => {
    expect(shellQuote('hello world')).toBe(`'hello world'`)
  })

  it('escapes embedded single quotes', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })

  it('preserves newlines inside the single-quoted argument', () => {
    expect(shellQuote('line1\nline2')).toBe(`'line1\nline2'`)
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
