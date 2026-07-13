import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIpc = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcRenderer: mockIpc,
}))

import { backupApi } from './backup.api'
import { IpcChannels } from '@shared/types/ipc'

describe('backup.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exportToFile invokes backup:export', () => {
    backupApi.exportToFile()
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.backupExport)
  })

  it('importFromFile invokes backup:import', () => {
    backupApi.importFromFile()
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.backupImport)
  })
})
