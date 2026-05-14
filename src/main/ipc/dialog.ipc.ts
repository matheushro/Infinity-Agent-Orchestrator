// IPC handlers for native dialogs.
import { ipcMain, dialog } from 'electron'
import os from 'os'
import { IpcChannels } from '@shared/types/ipc'

export function registerDialogIpc(): void {
  ipcMain.handle(IpcChannels.dialogSelectFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: os.homedir()
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
