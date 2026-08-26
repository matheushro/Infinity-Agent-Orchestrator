// Browser window creation and loading.
import { BrowserWindow } from 'electron'
import { join } from 'path'
import { attachFullScreenForwarders } from './ipc/window.ipc'
import { attachExternalLinkHandlers } from './services/externalLink.service'

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f172a',
    // Hide the native menu bar (File/Edit/View/Window/Help) by default; users
    // can still summon it on Linux/Windows by pressing Alt.
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  attachFullScreenForwarders(win)
  attachExternalLinkHandlers(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
