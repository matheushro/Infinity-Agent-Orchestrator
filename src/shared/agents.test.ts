import { describe, it, expect } from 'vitest'
import { AGENTS } from './agents'
import type { AgentKey } from './agents'

describe('AGENTS registry', () => {
  it('contains codex, claude, gemini, and copilot', () => {
    const keys = Object.keys(AGENTS) as AgentKey[]
    expect(keys).toContain('codex')
    expect(keys).toContain('claude')
    expect(keys).toContain('gemini')
    expect(keys).toContain('copilot')
  })

  it('every entry has a non-empty label, cmd, and icon', () => {
    for (const [key, def] of Object.entries(AGENTS)) {
      expect(def.key, `${key}.key`).toBe(key)
      expect(def.label, `${key}.label`).toBeTruthy()
      expect(def.cmd, `${key}.cmd`).toBeTruthy()
      expect(def.icon, `${key}.icon`).toBeTruthy()
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
})
