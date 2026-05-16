import { describe, it, expect, vi, beforeEach } from 'vitest'

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())
const mockShowOpenDialog = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => {
      ipcHandlers.set(channel, fn)
    }),
  },
  dialog: { showOpenDialog: mockShowOpenDialog },
}))

import { registerDialogIpc } from './dialog.ipc'
import { IpcChannels } from '@shared/types/ipc'

describe('dialog.ipc', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    vi.clearAllMocks()
    registerDialogIpc()
  })

  it('dialog:select-folder returns the first selected path', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/home/user/project'] })
    const result = await ipcHandlers.get(IpcChannels.dialogSelectFolder)!()
    expect(result).toBe('/home/user/project')
  })

  it('returns null when the user cancels the dialog', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const result = await ipcHandlers.get(IpcChannels.dialogSelectFolder)!()
    expect(result).toBeNull()
  })

  it('returns null when filePaths is empty (no selection)', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    const result = await ipcHandlers.get(IpcChannels.dialogSelectFolder)!()
    expect(result).toBeNull()
  })
})
