// Persistence: owns the SQLite connection and all terminal/workspace queries.
import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { NoteRecord } from '@shared/types/notes'
import type { EdgeRecord, TerminalRecord } from '@shared/types/terminal'
import type { WorkspaceRecord } from '@shared/types/workspace'

let db: Database.Database

export function initDb(): void {
  db = new Database(join(app.getPath('userData'), 'terminals.db'))
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )
  `)

  // Migration: add position column on dbs created before user-driven ordering.
  try {
    db.exec(`ALTER TABLE workspaces ADD COLUMN position INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // column already exists — no-op
  }

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
      created_at INTEGER NOT NULL,
      workspace_id TEXT NOT NULL DEFAULT ''
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_texts (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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

  // Migration: add workspace_id to terminals if it was created before workspaces existed.
  try {
    db.exec(`ALTER TABLE terminals ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''`)
  } catch {
    // column already exists — no-op
  }

  // Seed: if no workspaces exist, create a default one and assign orphaned terminals.
  const count = (
    db.prepare('SELECT COUNT(*) as n FROM workspaces').get() as { n: number }
  ).n
  if (count === 0) {
    const defaultId = 'default'
    db.prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)').run(
      defaultId,
      'Default',
      Date.now(),
    )
    db.prepare("UPDATE terminals SET workspace_id = ? WHERE workspace_id = ''").run(defaultId)
  }

  // Sweep terminals whose workspace was deleted (e.g. crash mid-delete or a
  // race between deleteWorkspace and an in-flight upsert from the renderer).
  // They never render but accumulate in the DB and keep edges alive whose
  // endpoints don't belong to any visible workspace.
  db.exec(
    `DELETE FROM terminals WHERE workspace_id NOT IN (SELECT id FROM workspaces)`,
  )
}

// ── Workspaces ──────────────────────────────────────────────────────────────

export function listWorkspaces(): WorkspaceRecord[] {
  return db
    .prepare('SELECT id, name, created_at FROM workspaces ORDER BY position, created_at')
    .all() as WorkspaceRecord[]
}

export function createWorkspace(record: WorkspaceRecord): void {
  // New workspaces append to the bottom (max(position) + 1).
  const maxRow = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM workspaces').get() as {
    m: number
  }
  db.prepare(
    'INSERT INTO workspaces (id, name, created_at, position) VALUES (@id, @name, @created_at, @position)',
  ).run({ ...record, position: maxRow.m + 1 })
}

export function reorderWorkspaces(orderedIds: string[]): void {
  const update = db.prepare('UPDATE workspaces SET position = ? WHERE id = ?')
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, idx) => update.run(idx, id))
  })
  tx(orderedIds)
}

export function deleteWorkspace(id: string): void {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

export function renameWorkspace(id: string, name: string): void {
  db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id)
}

export function duplicateWorkspace(sourceId: string): WorkspaceRecord {
  const source = db
    .prepare('SELECT * FROM workspaces WHERE id = ?')
    .get(sourceId) as WorkspaceRecord | undefined
  if (!source) throw new Error(`Workspace ${sourceId} not found`)

  const newId = crypto.randomUUID()
  const newRecord: WorkspaceRecord = {
    id: newId,
    name: `${source.name} Copy`,
    created_at: Date.now(),
  }
  const maxRow = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM workspaces').get() as {
    m: number
  }
  db.prepare(
    'INSERT INTO workspaces (id, name, created_at, position) VALUES (@id, @name, @created_at, @position)',
  ).run({ ...newRecord, position: maxRow.m + 1 })

  const terminals = db
    .prepare('SELECT * FROM terminals WHERE active = 1 AND workspace_id = ?')
    .all(sourceId) as Array<TerminalRecord & { active: number; created_at: number }>
  const insert = db.prepare(
    `INSERT INTO terminals (id, title, cwd, command, shell, x, y, width, height, active, created_at, workspace_id)
     VALUES (@id, @title, @cwd, @command, @shell, @x, @y, @width, @height, 1, @created_at, @workspace_id)`,
  )
  const now = Date.now()
  for (const t of terminals) {
    insert.run({ ...t, id: crypto.randomUUID(), workspace_id: newId, created_at: now })
  }

  const texts = db
    .prepare('SELECT * FROM canvas_texts WHERE workspace_id = ?')
    .all(sourceId) as Array<CanvasTextRecord & { created_at: number }>
  const insertText = db.prepare(
    `INSERT INTO canvas_texts (id, text, x, y, width, height, workspace_id, created_at)
     VALUES (@id, @text, @x, @y, @width, @height, @workspace_id, @created_at)`,
  )
  for (const text of texts) {
    insertText.run({ ...text, id: crypto.randomUUID(), workspace_id: newId, created_at: now })
  }

  const notes = db
    .prepare('SELECT * FROM notes WHERE workspace_id = ?')
    .all(sourceId) as Array<NoteRecord>
  const insertNote = db.prepare(
    `INSERT INTO notes (id, title, content, x, y, width, height, workspace_id, created_at, updated_at)
     VALUES (@id, @title, @content, @x, @y, @width, @height, @workspace_id, @created_at, @updated_at)`,
  )
  for (const note of notes) {
    insertNote.run({
      ...note,
      id: crypto.randomUUID(),
      workspace_id: newId,
      created_at: now,
      updated_at: now,
    })
  }

  return newRecord
}

// ── Terminals ────────────────────────────────────────────────────────────────

export function listActiveTerminals(workspaceId?: string): TerminalRecord[] {
  if (workspaceId) {
    return db
      .prepare(
        'SELECT * FROM terminals WHERE active = 1 AND workspace_id = ? ORDER BY created_at',
      )
      .all(workspaceId) as TerminalRecord[]
  }
  return db
    .prepare('SELECT * FROM terminals WHERE active = 1 ORDER BY created_at')
    .all() as TerminalRecord[]
}

export function upsertTerminal(record: TerminalRecord): void {
  db.prepare(
    `INSERT INTO terminals (id, title, cwd, command, shell, x, y, width, height, active, created_at, workspace_id)
     VALUES (@id, @title, @cwd, @command, @shell, @x, @y, @width, @height, 1, @created_at, @workspace_id)
     ON CONFLICT(id) DO UPDATE SET
       title = @title, cwd = @cwd, command = @command, shell = @shell,
       x = @x, y = @y, width = @width, height = @height, active = 1,
       workspace_id = @workspace_id`,
  ).run({ ...record, created_at: Date.now() })
}

export function removeTerminal(id: string): void {
  db.prepare('DELETE FROM edges WHERE source = ? OR target = ?').run(id, id)
  db.prepare('DELETE FROM terminals WHERE id = ?').run(id)
}

// ── Edges ────────────────────────────────────────────────────────────────────

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

// ── Canvas text elements ────────────────────────────────────────────────────

export function listCanvasTexts(workspaceId: string): CanvasTextRecord[] {
  return db
    .prepare(
      'SELECT id, text, x, y, width, height, workspace_id FROM canvas_texts WHERE workspace_id = ? ORDER BY created_at',
    )
    .all(workspaceId) as CanvasTextRecord[]
}

export function upsertCanvasText(record: CanvasTextRecord): void {
  db.prepare(
    `INSERT INTO canvas_texts (id, text, x, y, width, height, workspace_id, created_at)
     VALUES (@id, @text, @x, @y, @width, @height, @workspace_id, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       text = @text, x = @x, y = @y, width = @width, height = @height,
       workspace_id = @workspace_id`,
  ).run({ ...record, created_at: Date.now() })
}

export function removeCanvasText(id: string): void {
  db.prepare('DELETE FROM canvas_texts WHERE id = ?').run(id)
}

// ── Notes ────────────────────────────────────────────────────────────────────

export function listNotes(workspaceId: string): NoteRecord[] {
  return db
    .prepare(
      'SELECT id, title, content, x, y, width, height, workspace_id, created_at, updated_at FROM notes WHERE workspace_id = ? ORDER BY created_at',
    )
    .all(workspaceId) as NoteRecord[]
}

export function upsertNote(record: NoteRecord): void {
  // created_at is set once on insert and preserved on update; updated_at is
  // always refreshed so list ordering and "last edited" stay correct.
  const now = Date.now()
  db.prepare(
    `INSERT INTO notes (id, title, content, x, y, width, height, workspace_id, created_at, updated_at)
     VALUES (@id, @title, @content, @x, @y, @width, @height, @workspace_id, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       title = @title, content = @content, x = @x, y = @y, width = @width, height = @height,
       workspace_id = @workspace_id, updated_at = @updated_at`,
  ).run({ ...record, created_at: record.created_at || now, updated_at: now })
}

export function removeNote(id: string): void {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id)
}
