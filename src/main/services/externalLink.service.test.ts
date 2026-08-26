import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(async () => undefined),
}))

vi.mock('electron', () => ({
  shell: { openExternal: mocks.openExternal },
}))

import {
  isExternalUrl,
  openExternalUrl,
  attachExternalLinkHandlers,
} from './externalLink.service'

function fakeWindow() {
  const navigationHandlers: Array<(event: { preventDefault: () => void }, url: string) => void> = []
  const win = {
    webContents: {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((event: string, handler: (e: any, url: string) => void) => {
        if (event === 'will-navigate') navigationHandlers.push(handler)
      }),
    },
  }
  return { win, navigationHandlers }
}

describe('isExternalUrl', () => {
  it.each(['https://google.com', 'http://localhost:3000/x', 'mailto:a@b.com'])(
    'accepts %s',
    (url) => {
      expect(isExternalUrl(url)).toBe(true)
    },
  )

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'not a url', ''])(
    'rejects %s',
    (url) => {
      expect(isExternalUrl(url)).toBe(false)
    },
  )
})

describe('openExternalUrl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hands http(s) urls to the OS browser', async () => {
    await expect(openExternalUrl('  https://google.com  ')).resolves.toBe(true)
    expect(mocks.openExternal).toHaveBeenCalledWith('https://google.com')
  })

  it('drops non-external schemes without calling the shell', async () => {
    await expect(openExternalUrl('javascript:alert(1)')).resolves.toBe(false)
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })

  it('resolves false when the OS refuses the url', async () => {
    mocks.openExternal.mockRejectedValueOnce(new Error('no handler'))
    await expect(openExternalUrl('https://google.com')).resolves.toBe(false)
  })
})

describe('attachExternalLinkHandlers', () => {
  const savedRendererUrl = process.env.ELECTRON_RENDERER_URL

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ELECTRON_RENDERER_URL
  })

  afterEach(() => {
    if (savedRendererUrl === undefined) delete process.env.ELECTRON_RENDERER_URL
    else process.env.ELECTRON_RENDERER_URL = savedRendererUrl
  })

  it('denies in-app windows and opens the url in the browser', () => {
    const { win } = fakeWindow()
    attachExternalLinkHandlers(win as never)

    const handler = win.webContents.setWindowOpenHandler.mock.calls[0][0]
    expect(handler({ url: 'https://google.com' })).toEqual({ action: 'deny' })
    expect(mocks.openExternal).toHaveBeenCalledWith('https://google.com')
  })

  it('prevents navigating the app window away and opens the browser instead', () => {
    const { win, navigationHandlers } = fakeWindow()
    attachExternalLinkHandlers(win as never)

    const preventDefault = vi.fn()
    navigationHandlers[0]({ preventDefault }, 'https://google.com')

    expect(preventDefault).toHaveBeenCalled()
    expect(mocks.openExternal).toHaveBeenCalledWith('https://google.com')
  })

  it('lets the app navigate its own document', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
    const { win, navigationHandlers } = fakeWindow()
    attachExternalLinkHandlers(win as never)

    const preventDefault = vi.fn()
    navigationHandlers[0]({ preventDefault }, 'http://localhost:5173/index.html')
    navigationHandlers[0]({ preventDefault }, 'file:///app/out/renderer/index.html')

    expect(preventDefault).not.toHaveBeenCalled()
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })
})
