// IPC handlers for the workspace domain.
import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { WorkspaceRecord } from '@shared/types/workspace'
import * as dbService from '../services/db.service'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IpcChannels.workspacesList, () => dbService.listWorkspaces())
  ipcMain.handle(IpcChannels.workspacesCreate, (_event, record: WorkspaceRecord) =>
    dbService.createWorkspace(record),
  )
  ipcMain.handle(IpcChannels.workspacesDelete, (_event, id: string) =>
    dbService.deleteWorkspace(id),
  )
  ipcMain.handle(IpcChannels.workspacesRename, (_event, id: string, name: string) =>
    dbService.renameWorkspace(id, name),
  )
  ipcMain.handle(IpcChannels.workspacesDuplicate, (_event, id: string) =>
    dbService.duplicateWorkspace(id),
  )
  ipcMain.handle(IpcChannels.workspacesReorder, (_event, orderedIds: string[]) =>
    dbService.reorderWorkspaces(orderedIds),
  )
  ipcMain.handle(IpcChannels.workspacesSetEnabled, (_event, id: string, enabled: boolean) =>
    dbService.setWorkspaceEnabled(id, enabled),
  )
}
