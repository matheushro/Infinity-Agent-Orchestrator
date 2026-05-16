import { describe, it, expect } from 'vitest'
import { createTerminalId } from './id'

describe('createTerminalId', () => {
  it('returns unique ids on successive calls', () => {
    const ids = Array.from({ length: 10 }, () => createTerminalId())
    const unique = new Set(ids)
    expect(unique.size).toBe(10)
  })

  it('generated ids are valid as React keys (non-empty strings)', () => {
    const id = createTerminalId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})
