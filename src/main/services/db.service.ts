// Persistence: owns the SQLite connection and all terminal queries.
import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { EdgeRecord, TerminalRecord } from '@shared/types/terminal'

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
  db.exec(`
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source) REFERENCES terminals(id) ON DELETE CASCADE,
      FOREIGN KEY (target) REFERENCES terminals(id) ON DELETE CASCADE
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
  db.prepare('DELETE FROM edges WHERE source = ? OR target = ?').run(id, id)
  db.prepare('DELETE FROM terminals WHERE id = ?').run(id)
}

export function listEdges(): EdgeRecord[] {
  return db
    .prepare('SELECT id, source, target FROM edges ORDER BY created_at')
    .all() as EdgeRecord[]
}

export function upsertEdge(record: EdgeRecord): void {
  db.prepare(
    `INSERT INTO edges (id, source, target, created_at)
     VALUES (@id, @source, @target, @created_at)
     ON CONFLICT(id) DO UPDATE SET source = @source, target = @target`,
  ).run({ ...record, created_at: Date.now() })
}

export function removeEdge(id: string): void {
  db.prepare('DELETE FROM edges WHERE id = ?').run(id)
}
