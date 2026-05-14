// IPC handlers for the persistence domain.
import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { TerminalRecord } from '@shared/types/terminal'
import * as dbService from '../services/db.service'

export function registerDbIpc(): void {
  ipcMain.handle(IpcChannels.dbListActive, () => dbService.listActiveTerminals())
  ipcMain.handle(IpcChannels.dbUpsert, (_event, record: TerminalRecord) =>
    dbService.upsertTerminal(record)
  )
  ipcMain.handle(IpcChannels.dbRemove, (_event, id: string) => dbService.removeTerminal(id))
}
