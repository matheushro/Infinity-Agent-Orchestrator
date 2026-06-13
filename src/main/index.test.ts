import { describe, it, expect, vi, beforeEach } from 'vitest'

const callbacks = vi.hoisted(() => ({
  whenReady: null as null | (() => Promise<void>),
  appEvents: new Map<string, (...args: any[]) => any>(),
}))

vi.mock('electron', () => ({
  app: {
    commandLine: { appendSwitch: vi.fn() },
    whenReady: vi.fn().mockReturnValue({
      then: vi.fn((fn: () => Promise<void>) => {
        callbacks.whenReady = fn
        return { catch: vi.fn() }
      }),
    }),
    on: vi.fn((event: string, fn: (...args: any[]) => any) => {
      callbacks.appEvents.set(event, fn)
    }),
    quit: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  Menu: { setApplicationMenu: vi.fn() },
}))

vi.mock('./window', () => ({ createWindow: vi.fn() }))
vi.mock('./ipc', () => ({ registerIpcHandlers: vi.fn() }))
vi.mock('./services/db.service', () => ({ initDb: vi.fn() }))
vi.mock('./services/pty.service', () => ({ killAllPtys: vi.fn() }))
vi.mock('./services/iao.service', () => ({
  startIaoServer: vi.fn().mockResolvedValue(undefined),
  stopIaoServer: vi.fn(),
}))

// Side-effectful import — registers callbacks on the mocked app
import './index'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDb } from './services/db.service'
import { killAllPtys } from './services/pty.service'
import { startIaoServer, stopIaoServer } from './services/iao.service'
import { app, Menu } from 'electron'

describe('main/index — app.whenReady callback', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await callbacks.whenReady!()
  })

  it('initializes the database', () => {
    expect(initDb).toHaveBeenCalledOnce()
  })

  it('starts the IAO server', () => {
    expect(startIaoServer).toHaveBeenCalledOnce()
  })

  it('registers IPC handlers', () => {
    expect(registerIpcHandlers).toHaveBeenCalledOnce()
  })

  it('creates the main window', () => {
    expect(createWindow).toHaveBeenCalledOnce()
  })

  it('hides the default Electron application menu', () => {
    expect(Menu.setApplicationMenu).toHaveBeenCalledWith(null)
  })

  it('initializes db before creating the window', () => {
    const dbOrder = (initDb as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    const winOrder = (createWindow as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    expect(dbOrder).toBeLessThan(winOrder)
  })
})

describe('main/index — window-all-closed handler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers the window-all-closed event handler', () => {
    expect(callbacks.appEvents.has('window-all-closed')).toBe(true)
  })

  it('calls killAllPtys when all windows are closed', () => {
    callbacks.appEvents.get('window-all-closed')!()
    expect(killAllPtys).toHaveBeenCalledOnce()
  })

  it('stops the IAO server and quits the app on non-darwin platforms', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    try {
      callbacks.appEvents.get('window-all-closed')!()
      expect(stopIaoServer).toHaveBeenCalledOnce()
      expect(app.quit).toHaveBeenCalledOnce()
    } finally {
      if (original) Object.defineProperty(process, 'platform', original)
    }
  })

  it('keeps the IAO server running and does NOT quit the app on darwin', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      callbacks.appEvents.get('window-all-closed')!()
      expect(stopIaoServer).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
    } finally {
      if (original) Object.defineProperty(process, 'platform', original)
    }
  })
})
