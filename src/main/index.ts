// Main process bootstrap: wires services, IPC and window lifecycle together.
// All privileged logic lives in ./services and ./ipc — keep this file thin.
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDb } from './services/db.service'
import { killAllPtys } from './services/pty.service'
import { startIaoServer, stopIaoServer } from './services/iao.service'

app.whenReady().then(async () => {
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
