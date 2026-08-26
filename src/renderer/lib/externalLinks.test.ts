import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openExternalUrl } from './externalLinks'

describe('openExternalUrl', () => {
  const openExternal = vi.fn(async () => true)

  beforeEach(() => {
    openExternal.mockClear()
    Object.assign(window, { windowApi: { openExternal } })
  })

  it('forwards a trimmed url to the window bridge', () => {
    openExternalUrl('  https://google.com ')
    expect(openExternal).toHaveBeenCalledWith('https://google.com')
  })

  it('ignores an empty url', () => {
    openExternalUrl('   ')
    expect(openExternal).not.toHaveBeenCalled()
  })
})
