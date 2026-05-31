import { describe, it, expect, vi, beforeEach } from 'vitest'

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => {
      ipcHandlers.set(channel, fn)
    }),
  },
}))

vi.mock('../services/db.service', () => ({
  listActiveTerminals: vi.fn(() => []),
  upsertTerminal: vi.fn(),
  removeTerminal: vi.fn(),
  listEdges: vi.fn(() => []),
  upsertEdge: vi.fn(),
  removeEdge: vi.fn(),
  listCanvasTexts: vi.fn(() => []),
  upsertCanvasText: vi.fn(),
  removeCanvasText: vi.fn(),
  listNotes: vi.fn(() => []),
  upsertNote: vi.fn(),
  removeNote: vi.fn(),
}))

import { registerDbIpc } from './db.ipc'
import * as dbService from '../services/db.service'
import { IpcChannels } from '@shared/types/ipc'

describe('db.ipc', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    vi.clearAllMocks()
    registerDbIpc()
  })

  it('db:list-active calls listActiveTerminals and returns its result', async () => {
    const rows = [{ id: 't1', title: 'A', cwd: '/tmp', command: '', shell: 'default', x: 0, y: 0, width: 400, height: 300 }]
    vi.mocked(dbService.listActiveTerminals).mockReturnValue(rows as any)
    const result = await ipcHandlers.get(IpcChannels.dbListActive)!()
    expect(dbService.listActiveTerminals).toHaveBeenCalled()
    expect(result).toBe(rows)
  })

  it('db:upsert calls upsertTerminal with the record payload', async () => {
    const record = { id: 't1', title: 'Test', cwd: '/tmp', command: '', shell: 'default', x: 0, y: 0, width: 400, height: 300 }
    await ipcHandlers.get(IpcChannels.dbUpsert)!({}, record)
    expect(dbService.upsertTerminal).toHaveBeenCalledWith(record)
  })

  it('db:remove calls removeTerminal(id)', async () => {
    await ipcHandlers.get(IpcChannels.dbRemove)!({}, 't1')
    expect(dbService.removeTerminal).toHaveBeenCalledWith('t1')
  })

  it('edges:list calls listEdges and returns its result', async () => {
    const edges = [{ id: 'e1', source: 't1', target: 't2' }]
    vi.mocked(dbService.listEdges).mockReturnValue(edges as any)
    const result = await ipcHandlers.get(IpcChannels.edgesList)!()
    expect(dbService.listEdges).toHaveBeenCalled()
    expect(result).toBe(edges)
  })

  it('edges:upsert calls upsertEdge with the edge record', async () => {
    const edge = { id: 'e1', source: 't1', target: 't2' }
    await ipcHandlers.get(IpcChannels.edgesUpsert)!({}, edge)
    expect(dbService.upsertEdge).toHaveBeenCalledWith(edge)
  })

  it('edges:remove calls removeEdge(id)', async () => {
    await ipcHandlers.get(IpcChannels.edgesRemove)!({}, 'e1')
    expect(dbService.removeEdge).toHaveBeenCalledWith('e1')
  })

  it('canvas-texts:list calls listCanvasTexts and returns its result', async () => {
    const texts = [{ id: 'text-1', text: 'Note', x: 0, y: 0, width: 220, height: 44, workspace_id: 'ws-1' }]
    vi.mocked(dbService.listCanvasTexts).mockReturnValue(texts as any)
    const result = await ipcHandlers.get(IpcChannels.canvasTextsList)!({}, 'ws-1')
    expect(dbService.listCanvasTexts).toHaveBeenCalledWith('ws-1')
    expect(result).toBe(texts)
  })

  it('canvas-texts:upsert calls upsertCanvasText with the record payload', async () => {
    const text = { id: 'text-1', text: 'Note', x: 0, y: 0, width: 220, height: 44, workspace_id: 'ws-1' }
    await ipcHandlers.get(IpcChannels.canvasTextsUpsert)!({}, text)
    expect(dbService.upsertCanvasText).toHaveBeenCalledWith(text)
  })

  it('canvas-texts:remove calls removeCanvasText(id)', async () => {
    await ipcHandlers.get(IpcChannels.canvasTextsRemove)!({}, 'text-1')
    expect(dbService.removeCanvasText).toHaveBeenCalledWith('text-1')
  })

  it('notes:list calls listNotes and returns its result', async () => {
    const notes = [{ id: 'note-1', title: 'N', content: '', x: 0, y: 0, width: 280, height: 200, workspace_id: 'ws-1', created_at: 1, updated_at: 1 }]
    vi.mocked(dbService.listNotes).mockReturnValue(notes as any)
    const result = await ipcHandlers.get(IpcChannels.notesList)!({}, 'ws-1')
    expect(dbService.listNotes).toHaveBeenCalledWith('ws-1')
    expect(result).toBe(notes)
  })

  it('notes:upsert calls upsertNote with the record payload', async () => {
    const note = { id: 'note-1', title: 'N', content: 'body', x: 0, y: 0, width: 280, height: 200, workspace_id: 'ws-1', created_at: 1, updated_at: 1 }
    await ipcHandlers.get(IpcChannels.notesUpsert)!({}, note)
    expect(dbService.upsertNote).toHaveBeenCalledWith(note)
  })

  it('notes:remove calls removeNote(id)', async () => {
    await ipcHandlers.get(IpcChannels.notesRemove)!({}, 'note-1')
    expect(dbService.removeNote).toHaveBeenCalledWith('note-1')
  })
})
