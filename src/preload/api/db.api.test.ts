import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIpc = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcRenderer: mockIpc,
}))

import { dbApi } from './db.api'
import { IpcChannels } from '@shared/types/ipc'

describe('db.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listActive invokes db:list-active without workspaceId when not provided', () => {
    dbApi.listActive()
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.dbListActive, undefined)
  })

  it('listActive invokes db:list-active with workspaceId when provided', () => {
    dbApi.listActive('ws-1')
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.dbListActive, 'ws-1')
  })

  it('upsert invokes db:upsert with record', () => {
    const record = { id: 't1', title: 'T', cwd: '/tmp', command: '', shell: 'default', x: 0, y: 0, width: 400, height: 300 }
    dbApi.upsert(record as any)
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.dbUpsert, record)
  })

  it('remove invokes db:remove with id', () => {
    dbApi.remove('t1')
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.dbRemove, 't1')
  })

  it('listEdges invokes edges:list', () => {
    dbApi.listEdges()
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.edgesList)
  })

  it('upsertEdge invokes edges:upsert with record', () => {
    const edge = { id: 'e1', source: 't1', target: 't2' }
    dbApi.upsertEdge(edge as any)
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.edgesUpsert, edge)
  })

  it('removeEdge invokes edges:remove with id', () => {
    dbApi.removeEdge('e1')
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.edgesRemove, 'e1')
  })

  it('listCanvasTexts invokes canvas-texts:list with workspaceId', () => {
    dbApi.listCanvasTexts('ws-1')
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.canvasTextsList, 'ws-1')
  })

  it('upsertCanvasText invokes canvas-texts:upsert with record', () => {
    const text = { id: 'text-1', text: 'Note', x: 0, y: 0, width: 220, height: 44, workspace_id: 'ws-1' }
    dbApi.upsertCanvasText(text)
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.canvasTextsUpsert, text)
  })

  it('removeCanvasText invokes canvas-texts:remove with id', () => {
    dbApi.removeCanvasText('text-1')
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.canvasTextsRemove, 'text-1')
  })
})
