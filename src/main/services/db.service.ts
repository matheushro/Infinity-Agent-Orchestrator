// Persistence: owns the SQLite connection and all terminal/workspace queries.
import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { NoteRecord, NoteLinkRecord } from '@shared/types/notes'
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
      position INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    )
  `)

  // Migration: add position column on dbs created before user-driven ordering.
  try {
    db.exec(`ALTER TABLE workspaces ADD COLUMN position INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // column already exists — no-op
  }

  // Migration: add the workspace power flag (deactivate to save RAM/CPU).
  try {
    db.exec(`ALTER TABLE workspaces ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`)
  } catch {
    // column already exists — no-op
  }

  // Migration: add per-note theme overrides. Existing notes keep following the canvas.
  try {
    db.exec(`ALTER TABLE notes ADD COLUMN theme TEXT NOT NULL DEFAULT 'auto'`)
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
      workspace_id TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
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
      theme TEXT NOT NULL DEFAULT 'auto',
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Many-to-many note ↔ terminal access links. A terminal can only reach a note
  // through one of these rows (mirrors how `edges` gate terminal↔terminal
  // reachability). UNIQUE(note_id, terminal_id) makes linking idempotent.
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_links (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(note_id, terminal_id)
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

  // Migration: add sidebar ordering for terminals.
  try {
    db.exec(`ALTER TABLE terminals ADD COLUMN position INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // column already exists — no-op
  }

  // Migration: add the terminal power flag (turn off to skip the pty/xterm).
  try {
    db.exec(`ALTER TABLE terminals ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`)
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

function rowToWorkspace(row: Record<string, unknown>): WorkspaceRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    created_at: row.created_at as number,
    // SQLite stores enabled as 0/1; older rows predating the column read as 1.
    enabled: row.enabled === undefined ? true : Boolean(row.enabled),
  }
}

export function listWorkspaces(): WorkspaceRecord[] {
  return (
    db
      .prepare('SELECT id, name, created_at, enabled FROM workspaces ORDER BY position, created_at')
      .all() as Record<string, unknown>[]
  ).map(rowToWorkspace)
}

export function createWorkspace(record: WorkspaceRecord): void {
  // New workspaces append to the bottom (max(position) + 1).
  const maxRow = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM workspaces').get() as {
    m: number
  }
  db.prepare(
    'INSERT INTO workspaces (id, name, created_at, position, enabled) VALUES (@id, @name, @created_at, @position, @enabled)',
  ).run({ ...record, position: maxRow.m + 1, enabled: record.enabled === false ? 0 : 1 })
}

export function setWorkspaceEnabled(id: string, enabled: boolean): void {
  db.prepare('UPDATE workspaces SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
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
    enabled: true,
  }
  const maxRow = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM workspaces').get() as {
    m: number
  }
  db.prepare(
    'INSERT INTO workspaces (id, name, created_at, position, enabled) VALUES (@id, @name, @created_at, @position, @enabled)',
  ).run({ ...newRecord, position: maxRow.m + 1, enabled: 1 })

  const terminals = db
    .prepare('SELECT * FROM terminals WHERE active = 1 AND workspace_id = ?')
    .all(sourceId) as Array<Record<string, unknown>>
  const insert = db.prepare(
    `INSERT INTO terminals (id, title, cwd, command, shell, x, y, width, height, active, created_at, workspace_id, position, enabled)
     VALUES (@id, @title, @cwd, @command, @shell, @x, @y, @width, @height, 1, @created_at, @workspace_id, @position, @enabled)`,
  )
  const now = Date.now()
  for (const t of terminals) {
    insert.run({
      ...t,
      id: crypto.randomUUID(),
      workspace_id: newId,
      created_at: now,
      enabled: t.enabled ? 1 : 0,
    })
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
    .all(sourceId) as Array<Record<string, unknown>>
  const insertNote = db.prepare(
    `INSERT INTO notes (id, title, content, theme, x, y, width, height, workspace_id, created_at, updated_at)
     VALUES (@id, @title, @content, @theme, @x, @y, @width, @height, @workspace_id, @created_at, @updated_at)`,
  )
  for (const noteRow of notes) {
    const note = rowToNote(noteRow)
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

function rowToTerminal(row: Record<string, unknown>): TerminalRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    cwd: row.cwd as string,
    command: row.command as string,
    shell: row.shell as string,
    x: row.x as number,
    y: row.y as number,
    width: row.width as number,
    height: row.height as number,
    workspace_id: row.workspace_id as string,
    // SQLite stores enabled as 0/1; older rows predating the column read as 1.
    enabled: row.enabled === undefined ? true : Boolean(row.enabled),
  }
}

function rowToNote(row: Record<string, unknown>): NoteRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    theme: (row.theme as NoteRecord['theme'] | undefined) ?? 'auto',
    x: row.x as number,
    y: row.y as number,
    width: row.width as number,
    height: row.height as number,
    workspace_id: row.workspace_id as string,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  }
}

export function listActiveTerminals(workspaceId?: string): TerminalRecord[] {
  const rows = workspaceId
    ? (db
        .prepare(
          'SELECT * FROM terminals WHERE active = 1 AND workspace_id = ? ORDER BY position, created_at',
        )
        .all(workspaceId) as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM terminals WHERE active = 1 ORDER BY workspace_id, position, created_at')
        .all() as Record<string, unknown>[])
  return rows.map(rowToTerminal)
}

export function upsertTerminal(record: TerminalRecord): void {
  const existing = db
    .prepare('SELECT position FROM terminals WHERE id = ?')
    .get(record.id) as { position: number } | undefined
  const position = existing?.position ?? nextTerminalPosition(record.workspace_id)

  db.prepare(
    `INSERT INTO terminals (id, title, cwd, command, shell, x, y, width, height, active, created_at, workspace_id, position, enabled)
     VALUES (@id, @title, @cwd, @command, @shell, @x, @y, @width, @height, 1, @created_at, @workspace_id, @position, @enabled)
     ON CONFLICT(id) DO UPDATE SET
       title = @title, cwd = @cwd, command = @command, shell = @shell,
       x = @x, y = @y, width = @width, height = @height, active = 1,
       workspace_id = @workspace_id, enabled = @enabled`,
  ).run({ ...record, created_at: Date.now(), position, enabled: record.enabled === false ? 0 : 1 })
}

export function reorderTerminals(workspaceId: string, orderedIds: string[]): void {
  const update = db.prepare('UPDATE terminals SET position = ? WHERE id = ? AND workspace_id = ?')
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, idx) => update.run(idx, id, workspaceId))
  })
  tx(orderedIds)
}

export function removeTerminal(id: string): void {
  db.prepare('DELETE FROM edges WHERE source = ? OR target = ?').run(id, id)
  db.prepare('DELETE FROM note_links WHERE terminal_id = ?').run(id)
  db.prepare('DELETE FROM terminals WHERE id = ?').run(id)
}

export function getTerminal(id: string): TerminalRecord | undefined {
  const row = db.prepare('SELECT * FROM terminals WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToTerminal(row) : undefined
}

function nextTerminalPosition(workspaceId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM terminals WHERE workspace_id = ?')
    .get(workspaceId) as { m: number }
  return row.m + 1
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
  return (
    db
      .prepare(
        'SELECT id, title, content, theme, x, y, width, height, workspace_id, created_at, updated_at FROM notes WHERE workspace_id = ? ORDER BY created_at',
      )
      .all(workspaceId) as Record<string, unknown>[]
  ).map(rowToNote)
}

export function upsertNote(record: NoteRecord): void {
  // created_at is set once on insert and preserved on update; updated_at is
  // always refreshed so list ordering and "last edited" stay correct.
  const now = Date.now()
  db.prepare(
    `INSERT INTO notes (id, title, content, theme, x, y, width, height, workspace_id, created_at, updated_at)
     VALUES (@id, @title, @content, @theme, @x, @y, @width, @height, @workspace_id, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       title = @title, content = @content, theme = @theme, x = @x, y = @y, width = @width, height = @height,
       workspace_id = @workspace_id, updated_at = @updated_at`,
  ).run({ ...record, created_at: record.created_at || now, updated_at: now })
}

export function removeNote(id: string): void {
  db.prepare('DELETE FROM note_links WHERE note_id = ?').run(id)
  db.prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function getNote(id: string): NoteRecord | undefined {
  const row = db
    .prepare(
      'SELECT id, title, content, theme, x, y, width, height, workspace_id, created_at, updated_at FROM notes WHERE id = ?',
    )
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToNote(row) : undefined
}

// ── Note ↔ terminal links ─────────────────────────────────────────────────────

export function listNoteLinks(): NoteLinkRecord[] {
  return db
    .prepare('SELECT id, note_id, terminal_id FROM note_links ORDER BY created_at')
    .all() as NoteLinkRecord[]
}

export function upsertNoteLink(record: NoteLinkRecord): void {
  db.prepare(
    `INSERT INTO note_links (id, note_id, terminal_id, created_at)
     VALUES (@id, @note_id, @terminal_id, @created_at)
     ON CONFLICT(note_id, terminal_id) DO NOTHING`,
  ).run({ ...record, created_at: Date.now() })
}

export function removeNoteLink(id: string): void {
  db.prepare('DELETE FROM note_links WHERE id = ?').run(id)
}

/** True if the note is reachable from the terminal through a link row. */
export function isNoteLinkedToTerminal(noteId: string, terminalId: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM note_links WHERE note_id = ? AND terminal_id = ?').get(noteId, terminalId),
  )
}

/** Notes a given terminal is allowed to access, ordered by creation time. */
export function listNotesForTerminal(terminalId: string): NoteRecord[] {
  const links = db
    .prepare('SELECT note_id FROM note_links WHERE terminal_id = ?')
    .all(terminalId) as { note_id: string }[]
  const notes = links
    .map((l) => getNote(l.note_id))
    .filter((n): n is NoteRecord => Boolean(n))
  return notes.sort((a, b) => a.created_at - b.created_at)
}

/** Create a link (idempotent) and return the record used for the insert. */
export function linkNoteToTerminal(noteId: string, terminalId: string): NoteLinkRecord {
  const record: NoteLinkRecord = {
    id: crypto.randomUUID(),
    note_id: noteId,
    terminal_id: terminalId,
  }
  upsertNoteLink(record)
  return record
}
