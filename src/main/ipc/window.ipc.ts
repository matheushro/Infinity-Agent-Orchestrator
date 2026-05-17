// IPC handlers for top-level window controls (fullscreen toggle, etc.).
import { ipcMain, BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/types/ipc'

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

export function registerWindowIpc(): void {
  ipcMain.handle(IpcChannels.windowIsFullScreen, () => {
    return focusedWindow()?.isFullScreen() ?? false
  })

  ipcMain.handle(IpcChannels.windowSetFullScreen, (_event, value: boolean) => {
    const win = focusedWindow()
    if (!win) return false
    win.setFullScreen(Boolean(value))
    return win.isFullScreen()
  })

  // Mirror native enter/leave full-screen events back to renderers so the UI
  // can stay in sync if the user toggles full screen via the OS shortcut.
  for (const win of BrowserWindow.getAllWindows()) {
    attachFullScreenForwarders(win)
  }
}

export function attachFullScreenForwarders(win: BrowserWindow): void {
  const emit = (value: boolean): void => {
    if (win.isDestroyed()) return
    win.webContents.send(IpcChannels.windowFullScreenChanged, value)
  }
  win.on('enter-full-screen', () => emit(true))
  win.on('leave-full-screen', () => emit(false))
}
