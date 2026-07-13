import { describe, it, expect, vi, beforeEach } from 'vitest'

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())
const fakeWindow = vi.hoisted(() => ({ id: 1 }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => {
      ipcHandlers.set(channel, fn)
    }),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => fakeWindow),
  },
}))

vi.mock('../services/backup.service', () => ({
  exportToFile: vi.fn(),
  importFromFile: vi.fn(),
}))

import { registerBackupIpc } from './backup.ipc'
import * as backupService from '../services/backup.service'
import { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/types/ipc'

describe('backup.ipc', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    vi.clearAllMocks()
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(fakeWindow as any)
    registerBackupIpc()
  })

  it('backup:export calls exportToFile with the sender window and returns its result', async () => {
    const outcome = { canceled: false, path: '/tmp/iao.json', counts: {} }
    vi.mocked(backupService.exportToFile).mockResolvedValue(outcome as any)

    const result = await ipcHandlers.get(IpcChannels.backupExport)!({ sender: {} })

    expect(backupService.exportToFile).toHaveBeenCalledWith(fakeWindow)
    expect(result).toBe(outcome)
  })

  it('backup:import calls importFromFile with the sender window and returns its result', async () => {
    const outcome = { canceled: true }
    vi.mocked(backupService.importFromFile).mockResolvedValue(outcome as any)

    const result = await ipcHandlers.get(IpcChannels.backupImport)!({ sender: {} })

    expect(backupService.importFromFile).toHaveBeenCalledWith(fakeWindow)
    expect(result).toBe(outcome)
  })

  it('passes undefined when the sender has no window', async () => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null as any)

    await ipcHandlers.get(IpcChannels.backupExport)!({ sender: {} })

    expect(backupService.exportToFile).toHaveBeenCalledWith(undefined)
  })
})
