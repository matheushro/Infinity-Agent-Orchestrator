// IPC handlers for the persistence domain.
import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { CanvasTextRecord } from '@shared/types/canvas'
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
}
