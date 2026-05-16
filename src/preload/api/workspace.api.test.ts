import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIpc = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcRenderer: mockIpc,
}))

import { workspaceApi } from './workspace.api'
import { IpcChannels } from '@shared/types/ipc'
import type { WorkspaceRecord } from '@shared/types/workspace'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('workspace.api', () => {
  it('4.1 list() calls ipcRenderer.invoke with workspaces:list', () => {
    workspaceApi.list()
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.workspacesList)
  })

  it('4.2 create(record) calls invoke with workspaces:create and the record', () => {
    const record: WorkspaceRecord = { id: 'ws-1', name: 'Main', created_at: 1000 }
    workspaceApi.create(record)
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.workspacesCreate, record)
  })

  it('4.3 delete(id) calls invoke with workspaces:delete and the id', () => {
    workspaceApi.delete('ws-to-del')
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.workspacesDelete, 'ws-to-del')
  })
})
