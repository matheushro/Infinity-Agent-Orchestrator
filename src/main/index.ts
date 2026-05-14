import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, delimiter } from 'path'
import { existsSync } from 'fs'
import os from 'os'
import * as pty from 'node-pty'
import Database from 'better-sqlite3'

// Active pty processes, indexed by terminal node id.
const ptys = new Map<string, pty.IPty>()

// --- Local database (SQLite) -------------------------------------------------

interface TerminalRecord {
  id: string
  title: string
  cwd: string
  command: string
  shell: string
  x: number
  y: number
  width: number
  height: number
}

let db: Database.Database

function initDb(): void {
  db = new Database(join(app.getPath('userData'), 'terminals.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS terminals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cwd TEXT NOT NULL,
      command TEXT NOT NULL,
      shell TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `)
}

// Look for an executable in PATH; return the absolute path or null.
function findOnPath(bin: string): string | null {
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue
    const full = join(dir, bin)
    if (existsSync(full)) return full
  }
  return null
}

function resolveShell(requested?: string): string {
  // Allow forcing bash/zsh; fall back if the requested shell does not exist.
  if (requested === 'bash' || requested === 'zsh') {
    const found = findOnPath(requested)
    if (found) return found
  }
  return process.env.SHELL || findOnPath('bash') || '/bin/sh'
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- IPC: terminal lifecycle -------------------------------------------------

// Create a pty process and route output to the renderer that owns the window.
ipcMain.handle(
  'pty:create',
  (
    event,
    {
      id,
      shell,
      cols,
      rows,
      cwd,
      command
    }: {
      id: string
      shell?: string
      cols: number
      rows: number
      cwd?: string
      command?: string
    }
  ) => {
    const shellPath = resolveShell(shell)
    const workdir = cwd && existsSync(cwd) ? cwd : os.homedir()
    const proc = pty.spawn(shellPath, [], {
      name: 'xterm-color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: workdir,
      env: process.env as { [key: string]: string }
    })

    proc.onData((data) => {
      event.sender.send('pty:data', { id, data })
    })

    proc.onExit(() => {
      event.sender.send('pty:exit', { id })
      ptys.delete(id)
    })

    ptys.set(id, proc)

    // Fire the selected command (Codex / Claude Code) as soon as the shell starts.
    if (command) {
      setTimeout(() => proc.write(`${command}\r`), 250)
    }

    return { id, shell: shellPath }
  }
)

ipcMain.on('pty:input', (_event, { id, data }: { id: string; data: string }) => {
  ptys.get(id)?.write(data)
})

ipcMain.on(
  'pty:resize',
  (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    try {
      ptys.get(id)?.resize(Math.max(cols, 1), Math.max(rows, 1))
    } catch {
      // ignore invalid resize requests after the terminal has already exited
    }
  }
)

ipcMain.on('pty:kill', (_event, { id }: { id: string }) => {
  ptys.get(id)?.kill()
  ptys.delete(id)
})

// --- IPC: folder selection dialog -------------------------------------------

ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: os.homedir()
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// --- IPC: terminal persistence ----------------------------------------------

ipcMain.handle('db:list-active', () => {
  return db.prepare('SELECT * FROM terminals WHERE active = 1 ORDER BY created_at').all()
})

ipcMain.handle('db:upsert', (_event, record: TerminalRecord) => {
  db.prepare(
    `INSERT INTO terminals (id, title, cwd, command, shell, x, y, width, height, active, created_at)
     VALUES (@id, @title, @cwd, @command, @shell, @x, @y, @width, @height, 1, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       title = @title, cwd = @cwd, command = @command, shell = @shell,
       x = @x, y = @y, width = @width, height = @height, active = 1`
  ).run({ ...record, created_at: Date.now() })
})

ipcMain.handle('db:remove', (_event, id: string) => {
  db.prepare('DELETE FROM terminals WHERE id = ?').run(id)
})

// --- App --------------------------------------------------------------------

app.whenReady().then(() => {
  initDb()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptys.forEach((p) => p.kill())
  ptys.clear()
  if (process.platform !== 'darwin') app.quit()
})
