// IPC handlers for the persistence domain.
import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { ModelRecord } from '@shared/types/model'
import type { NoteRecord, NoteLinkRecord } from '@shared/types/notes'
import type { EdgeRecord, TerminalRecord } from '@shared/types/terminal'
import * as dbService from '../services/db.service'

export function registerDbIpc(): void {
  ipcMain.handle(IpcChannels.dbListActive, (_event, workspaceId?: string) =>
    dbService.listActiveTerminals(workspaceId),
  )
  ipcMain.handle(IpcChannels.dbUpsert, (_event, record: TerminalRecord) =>
    dbService.upsertTerminal(record),
  )
  ipcMain.handle(IpcChannels.dbRemove, (_event, id: string) => dbService.removeTerminal(id))
  ipcMain.handle(IpcChannels.dbReorderTerminals, (_event, workspaceId: string, orderedIds: string[]) =>
    dbService.reorderTerminals(workspaceId, orderedIds),
  )
  ipcMain.handle(IpcChannels.edgesList, () => dbService.listEdges())
  ipcMain.handle(IpcChannels.edgesUpsert, (_event, record: EdgeRecord) =>
    dbService.upsertEdge(record),
  )
  ipcMain.handle(IpcChannels.edgesRemove, (_event, id: string) => dbService.removeEdge(id))
  ipcMain.handle(IpcChannels.canvasTextsList, (_event, workspaceId: string) =>
    dbService.listCanvasTexts(workspaceId),
  )
  ipcMain.handle(IpcChannels.canvasTextsUpsert, (_event, record: CanvasTextRecord) =>
    dbService.upsertCanvasText(record),
  )
  ipcMain.handle(IpcChannels.canvasTextsRemove, (_event, id: string) =>
    dbService.removeCanvasText(id),
  )
  ipcMain.handle(IpcChannels.notesList, (_event, workspaceId: string) =>
    dbService.listNotes(workspaceId),
  )
  ipcMain.handle(IpcChannels.notesUpsert, (_event, record: NoteRecord) =>
    dbService.upsertNote(record),
  )
  ipcMain.handle(IpcChannels.notesRemove, (_event, id: string) => dbService.removeNote(id))
  ipcMain.handle(IpcChannels.noteLinksList, () => dbService.listNoteLinks())
  ipcMain.handle(IpcChannels.noteLinksUpsert, (_event, record: NoteLinkRecord) =>
    dbService.upsertNoteLink(record),
  )
  ipcMain.handle(IpcChannels.noteLinksRemove, (_event, id: string) =>
    dbService.removeNoteLink(id),
  )
  ipcMain.handle(IpcChannels.modelsList, () => dbService.listModels())
  ipcMain.handle(IpcChannels.modelsUpsert, (_event, record: ModelRecord) =>
    dbService.upsertModel(record),
  )
  ipcMain.handle(IpcChannels.modelsRemove, (_event, id: string) => dbService.removeModel(id))
}
