// Main process bootstrap: wires services, IPC and window lifecycle together.
// All privileged logic lives in ./services and ./ipc — keep this file thin.
import { app, BrowserWindow, Menu } from 'electron'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDb } from './services/db.service'
import { killAllPtys } from './services/pty.service'
import { startIaoServer, stopIaoServer } from './services/iao.service'

// Linux distros with restricted unprivileged user namespaces (Ubuntu 24.04+)
// reject Chromium's setuid sandbox unless chrome-sandbox is root:4755. Packaged
// AppImages can't guarantee that, so disable the sandbox up front.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

app.whenReady().then(async () => {
  // Hide the default Electron application menu (File / Edit / View / Window /
  // Help). The canvas owns its own chrome; the native menu bar would just be
  // dead pixels at the top of the window.
  Menu.setApplicationMenu(null)

  initDb()
  await startIaoServer()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllPtys()
  stopIaoServer()
  if (process.platform !== 'darwin') app.quit()
})
