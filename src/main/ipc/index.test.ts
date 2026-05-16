import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IpcChannels } from '@shared/types/ipc'

const state = vi.hoisted(() => ({
  beforeQuitHandler: null as null | (() => void)
}))

vi.mock('electron', () => ({
  app: {
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'before-quit') state.beforeQuitHandler = handler
    })
  },
  ipcMain: {
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
    handle: vi.fn(),
    on: vi.fn()
  }
}))

vi.mock('./pty.ipc', () => ({ registerPtyIpc: vi.fn() }))
vi.mock('./db.ipc', () => ({ registerDbIpc: vi.fn() }))
vi.mock('./dialog.ipc', () => ({ registerDialogIpc: vi.fn() }))

import { registerIpcHandlers } from './index'
import { unregisterIpcHandlers } from './index'
import { registerPtyIpc } from './pty.ipc'
import { registerDbIpc } from './db.ipc'
import { registerDialogIpc } from './dialog.ipc'
import { app, ipcMain } from 'electron'

describe('ipc/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.beforeQuitHandler = null
  })

  it('registers all IPC domains and hooks cleanup on before-quit', () => {
    registerIpcHandlers()
    expect(registerPtyIpc).toHaveBeenCalledOnce()
    expect(registerDbIpc).toHaveBeenCalledOnce()
    expect(registerDialogIpc).toHaveBeenCalledOnce()
    expect(app.once).toHaveBeenCalledWith('before-quit', unregisterIpcHandlers)
  })

  it('unregisters all IPC handlers and listeners', () => {
    unregisterIpcHandlers()

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.ptyCreate)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.dbListActive)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.dbUpsert)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.dbRemove)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.edgesList)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.edgesUpsert)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.edgesRemove)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.dialogSelectFolder)

    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IpcChannels.ptyInput)
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IpcChannels.ptyResize)
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IpcChannels.ptyKill)
  })

  it('runs cleanup when before-quit fires', () => {
    registerIpcHandlers()
    state.beforeQuitHandler?.()

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannels.ptyCreate)
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IpcChannels.ptyKill)
  })
})
