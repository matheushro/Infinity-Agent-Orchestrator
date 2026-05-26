// IPC handlers for native dialogs.
import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import os from 'os'
import { IpcChannels } from '@shared/types/ipc'

export function registerDialogIpc(): void {
  ipcMain.handle(IpcChannels.dialogSelectFolder, async (event, defaultPath?: string) => {
    const home = os.homedir()
    const requested = defaultPath && defaultPath.length > 0 ? defaultPath : home
    // On packaged macOS, an invalid defaultPath makes the dialog fail to appear.
    const safeDefaultPath = pathExists(requested) ? requested : home
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options = {
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
      defaultPath: safeDefaultPath,
    }
    // Attaching to the parent window is required for the dialog to display
    // reliably in packaged macOS builds.
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

function pathExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}
