// Secure bridge for native dialogs.
import { ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { DialogApi } from '@shared/types/api'

export const dialogApi: DialogApi = {
  selectFolder: (defaultPath?: string) =>
    ipcRenderer.invoke(IpcChannels.dialogSelectFolder, defaultPath)
}
