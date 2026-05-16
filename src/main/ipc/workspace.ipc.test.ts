import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIpcMain = vi.hoisted(() => ({
  handle: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

const mockDbService = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
}))

vi.mock('../services/db.service', () => mockDbService)

import { registerWorkspaceIpc } from './workspace.ipc'
import { IpcChannels } from '@shared/types/ipc'
import type { WorkspaceRecord } from '@shared/types/workspace'

beforeEach(() => {
  vi.clearAllMocks()
  registerWorkspaceIpc()
})

function getHandler(channel: string): (event: unknown, ...args: unknown[]) => unknown {
  const call = mockIpcMain.handle.mock.calls.find(([ch]) => ch === channel)
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (event: unknown, ...args: unknown[]) => unknown
}

describe('registerWorkspaceIpc', () => {
  it('3.1 registers workspaces:list handler that calls listWorkspaces', () => {
    const handler = getHandler(IpcChannels.workspacesList)
    const workspaces: WorkspaceRecord[] = [{ id: 'ws-1', name: 'Main', created_at: 1000 }]
    mockDbService.listWorkspaces.mockReturnValue(workspaces)

    const result = handler(null)

    expect(mockDbService.listWorkspaces).toHaveBeenCalledTimes(1)
    expect(result).toEqual(workspaces)
  })

  it('3.2 workspaces:create handler forwards the record to createWorkspace', () => {
    const handler = getHandler(IpcChannels.workspacesCreate)
    const record: WorkspaceRecord = { id: 'ws-new', name: 'New WS', created_at: 9999 }

    handler(null, record)

    expect(mockDbService.createWorkspace).toHaveBeenCalledTimes(1)
    expect(mockDbService.createWorkspace).toHaveBeenCalledWith(record)
  })

  it('3.3 workspaces:delete handler forwards the id to deleteWorkspace', () => {
    const handler = getHandler(IpcChannels.workspacesDelete)

    handler(null, 'ws-to-delete')

    expect(mockDbService.deleteWorkspace).toHaveBeenCalledTimes(1)
    expect(mockDbService.deleteWorkspace).toHaveBeenCalledWith('ws-to-delete')
  })
})
