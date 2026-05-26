import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIpc = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcRenderer: mockIpc,
}))

import { dialogApi } from './dialog.api'
import { IpcChannels } from '@shared/types/ipc'

describe('dialog.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selectFolder invokes dialog:select-folder', () => {
    dialogApi.selectFolder()
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.dialogSelectFolder, undefined)
  })

  it('selectFolder forwards the defaultPath argument', () => {
    dialogApi.selectFolder('/home/user/repos')
    expect(mockIpc.invoke).toHaveBeenCalledWith(
      IpcChannels.dialogSelectFolder,
      '/home/user/repos',
    )
  })
})
