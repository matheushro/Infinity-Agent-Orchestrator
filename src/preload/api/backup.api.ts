// Secure bridge for the backup (export/import) domain.
import { ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { BackupApi } from '@shared/types/api'

export const backupApi: BackupApi = {
  exportToFile: () => ipcRenderer.invoke(IpcChannels.backupExport),
  importFromFile: () => ipcRenderer.invoke(IpcChannels.backupImport),
}
