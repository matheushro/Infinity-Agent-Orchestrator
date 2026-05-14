// Persistence: owns the SQLite connection and all terminal queries.
import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { TerminalRecord } from '@shared/types/terminal'

let db: Database.Database

export function initDb(): void {
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

export function listActiveTerminals(): TerminalRecord[] {
  return db
    .prepare('SELECT * FROM terminals WHERE active = 1 ORDER BY created_at')
    .all() as TerminalRecord[]
}

export function upsertTerminal(record: TerminalRecord): void {
  db.prepare(
    `INSERT INTO terminals (id, title, cwd, command, shell, x, y, width, height, active, created_at)
     VALUES (@id, @title, @cwd, @command, @shell, @x, @y, @width, @height, 1, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       title = @title, cwd = @cwd, command = @command, shell = @shell,
       x = @x, y = @y, width = @width, height = @height, active = 1`
  ).run({ ...record, created_at: Date.now() })
}

export function removeTerminal(id: string): void {
  db.prepare('DELETE FROM terminals WHERE id = ?').run(id)
}
