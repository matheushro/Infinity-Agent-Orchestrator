// IPC handlers for the backup (export/import) domain.
import { ipcMain, BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import * as backupService from '../services/backup.service'

export function registerBackupIpc(): void {
  ipcMain.handle(IpcChannels.backupExport, (event) =>
    backupService.exportToFile(BrowserWindow.fromWebContents(event.sender) ?? undefined),
  )
  ipcMain.handle(IpcChannels.backupImport, (event) =>
    backupService.importFromFile(BrowserWindow.fromWebContents(event.sender) ?? undefined),
  )
}
