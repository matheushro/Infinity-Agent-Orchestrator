import { describe, it, expect, vi, beforeEach } from 'vitest'

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())
const mockShowOpenDialog = vi.hoisted(() => vi.fn())
const mockFromWebContents = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => {
      ipcHandlers.set(channel, fn)
    }),
  },
  dialog: { showOpenDialog: mockShowOpenDialog },
  BrowserWindow: { fromWebContents: mockFromWebContents },
}))

vi.mock('fs', () => ({
  default: { statSync: vi.fn(() => ({ isDirectory: () => true })) },
}))

import { registerDialogIpc } from './dialog.ipc'
import { IpcChannels } from '@shared/types/ipc'

const fakeEvent = { sender: {} } as any

describe('dialog.ipc', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    vi.clearAllMocks()
    mockFromWebContents.mockReturnValue(null)
    registerDialogIpc()
  })

  it('dialog:select-folder returns the first selected path', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/home/user/project'] })
    const result = await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent)
    expect(result).toBe('/home/user/project')
  })

  it('returns null when the user cancels the dialog', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const result = await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent)
    expect(result).toBeNull()
  })

  it('returns null when filePaths is empty (no selection)', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    const result = await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent)
    expect(result).toBeNull()
  })

  it('uses the provided defaultPath when given', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent, '/home/user/repos')
    const call = mockShowOpenDialog.mock.calls[0]
    expect(call[0]).toEqual(expect.objectContaining({ defaultPath: '/home/user/repos' }))
  })

  it('falls back to the home directory when no defaultPath is provided', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent)
    const call = mockShowOpenDialog.mock.calls[0][0]
    expect(call.defaultPath).toBeTruthy()
    expect(call.defaultPath).not.toBe('')
  })

  it('falls back to the home directory when defaultPath is an empty string', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent, '')
    const call = mockShowOpenDialog.mock.calls[0][0]
    expect(call.defaultPath).toBeTruthy()
    expect(call.defaultPath).not.toBe('')
  })

  it('falls back to the home directory when defaultPath does not exist', async () => {
    const fs = await import('fs')
    vi.mocked(fs.default.statSync).mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent, '/does/not/exist')
    const call = mockShowOpenDialog.mock.calls[0][0]
    expect(call.defaultPath).not.toBe('/does/not/exist')
    expect(call.defaultPath).toBeTruthy()
  })

  it('attaches the dialog to the parent BrowserWindow when available', async () => {
    const fakeWindow = { id: 1 }
    mockFromWebContents.mockReturnValue(fakeWindow)
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent)
    expect(mockShowOpenDialog).toHaveBeenCalledWith(fakeWindow, expect.any(Object))
  })

  it('calls without a parent window when none is found', async () => {
    mockFromWebContents.mockReturnValue(null)
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await ipcHandlers.get(IpcChannels.dialogSelectFolder)!(fakeEvent)
    expect(mockShowOpenDialog).toHaveBeenCalledTimes(1)
    expect(mockShowOpenDialog.mock.calls[0]).toHaveLength(1)
  })
})
