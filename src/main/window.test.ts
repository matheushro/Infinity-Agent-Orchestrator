import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = vi.hoisted(() => ({
  ctorOptions: [] as any[],
  win: { loadURL: vi.fn() as ReturnType<typeof vi.fn>, loadFile: vi.fn() as ReturnType<typeof vi.fn> },
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    loadURL = state.win.loadURL
    loadFile = state.win.loadFile
    on = vi.fn()
    isDestroyed = vi.fn(() => false)
    webContents = { send: vi.fn() }
    constructor(options: any) {
      state.ctorOptions.push(options)
    }
  },
}))

import { createWindow } from './window'

describe('createWindow', () => {
  const savedRendererUrl = process.env.ELECTRON_RENDERER_URL

  beforeEach(() => {
    vi.clearAllMocks()
    state.ctorOptions.length = 0
    delete process.env.ELECTRON_RENDERER_URL
  })

  afterEach(() => {
    if (savedRendererUrl !== undefined) {
      process.env.ELECTRON_RENDERER_URL = savedRendererUrl
    }
  })

  it('creates BrowserWindow with contextIsolation: true', () => {
    createWindow()
    expect(state.ctorOptions[0].webPreferences.contextIsolation).toBe(true)
  })

  it('creates BrowserWindow with nodeIntegration: false', () => {
    createWindow()
    expect(state.ctorOptions[0].webPreferences.nodeIntegration).toBe(false)
  })

  it('hides the default Electron menu bar', () => {
    createWindow()
    expect(state.ctorOptions[0].autoHideMenuBar).toBe(true)
  })

  it('loads the preload script from the correct relative path', () => {
    createWindow()
    const { preload } = state.ctorOptions[0].webPreferences
    expect(preload).toMatch(/preload[/\\]index\.js$/)
  })

  it('loads renderer URL when ELECTRON_RENDERER_URL is set', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
    createWindow()
    expect(state.win.loadURL).toHaveBeenCalledWith('http://localhost:5173')
    expect(state.win.loadFile).not.toHaveBeenCalled()
  })

  it('loads renderer HTML file when ELECTRON_RENDERER_URL is not set', () => {
    createWindow()
    expect(state.win.loadFile).toHaveBeenCalledOnce()
    expect(state.win.loadURL).not.toHaveBeenCalled()
  })

  it('loads renderer HTML file from the correct relative path', () => {
    createWindow()
    const [filePath] = state.win.loadFile.mock.calls[0]
    expect(filePath).toMatch(/renderer[/\\]index\.html$/)
  })

  it('returns the BrowserWindow instance', () => {
    const win = createWindow()
    expect(win).toBeDefined()
    expect(typeof win.loadURL).toBe('function')
  })
})
