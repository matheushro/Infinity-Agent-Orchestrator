// Export/import of the whole persisted state as a single JSON file. Composes
// db.service (never touches SQLite directly) and owns the native file dialogs.
import { dialog, type BrowserWindow, type SaveDialogOptions, type OpenDialogOptions } from 'electron'
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import {
  BACKUP_VERSION,
  type BackupCounts,
  type BackupData,
  type BackupFileResult,
} from '@shared/types/backup'
import * as dbService from './db.service'

const FILE_FILTERS = [{ name: 'IAO backup', extensions: ['json'] }]

/** Snapshot every table into a portable `BackupData` object. */
export function collectBackup(): BackupData {
  const workspaces = dbService.listWorkspaces()
  const terminals = dbService.listActiveTerminals()
  const terminalIds = new Set(terminals.map((t) => t.id))
  const canvasTexts = workspaces.flatMap((ws) => dbService.listCanvasTexts(ws.id))
  const notes = workspaces.flatMap((ws) => dbService.listNotes(ws.id))
  const noteIds = new Set(notes.map((n) => n.id))
  // Edges/links can outlive an endpoint (e.g. rows referencing an inactive
  // terminal) — keep the file self-consistent by exporting only fully
  // resolvable relations.
  const edges = dbService
    .listEdges()
    .filter((e) => terminalIds.has(e.source) && terminalIds.has(e.target))
  const noteLinks = dbService
    .listNoteLinks()
    .filter((l) => noteIds.has(l.note_id) && terminalIds.has(l.terminal_id))

  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    workspaces,
    terminals,
    canvasTexts,
    notes,
    edges,
    noteLinks,
  }
}

const BACKUP_ARRAYS = [
  'workspaces',
  'terminals',
  'canvasTexts',
  'notes',
  'edges',
  'noteLinks',
] as const

/** Parse + validate a backup file's JSON. Throws a descriptive error when invalid. */
export function parseBackup(json: string): BackupData {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('Backup file is not valid JSON')
  }
  if (!raw || typeof raw !== 'object') throw new Error('Backup file has no data')
  const data = raw as Record<string, unknown>
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(data.version)}`)
  }
  for (const key of BACKUP_ARRAYS) {
    const rows = data[key]
    if (!Array.isArray(rows)) throw new Error(`Backup file is missing "${key}"`)
    if (rows.some((r) => !r || typeof (r as { id?: unknown }).id !== 'string')) {
      throw new Error(`Backup file has a "${key}" entry without an id`)
    }
  }
  return data as unknown as BackupData
}

/**
 * Merge a backup into the database: everything is upserted by id, nothing is
 * deleted. Existing workspaces are updated in place (name/enabled); records
 * pointing at a workspace/terminal the file doesn't carry are skipped so a
 * partial or hand-edited file can never insert dangling relations.
 */
export function applyBackup(data: BackupData): BackupCounts {
  return dbService.runInTransaction(() => {
    const existingWorkspaceIds = new Set(dbService.listWorkspaces().map((ws) => ws.id))
    for (const ws of data.workspaces) {
      if (existingWorkspaceIds.has(ws.id)) {
        dbService.renameWorkspace(ws.id, ws.name)
        dbService.setWorkspaceEnabled(ws.id, ws.enabled !== false)
      } else {
        dbService.createWorkspace(ws)
      }
    }

    const workspaceIds = new Set([...existingWorkspaceIds, ...data.workspaces.map((ws) => ws.id)])
    const terminals = data.terminals.filter((t) => workspaceIds.has(t.workspace_id))
    for (const terminal of terminals) dbService.upsertTerminal(terminal)

    const terminalIds = new Set(terminals.map((t) => t.id))
    const edges = data.edges.filter((e) => terminalIds.has(e.source) && terminalIds.has(e.target))
    for (const edge of edges) dbService.upsertEdge(edge)

    const canvasTexts = data.canvasTexts.filter((t) => workspaceIds.has(t.workspace_id))
    for (const text of canvasTexts) dbService.upsertCanvasText(text)

    const notes = data.notes.filter((n) => workspaceIds.has(n.workspace_id))
    for (const note of notes) dbService.upsertNote(note)

    const noteIds = new Set(notes.map((n) => n.id))
    const noteLinks = data.noteLinks.filter(
      (l) => noteIds.has(l.note_id) && terminalIds.has(l.terminal_id),
    )
    for (const link of noteLinks) dbService.upsertNoteLink(link)

    return {
      workspaces: data.workspaces.length,
      terminals: terminals.length,
      canvasTexts: canvasTexts.length,
      notes: notes.length,
      edges: edges.length,
      noteLinks: noteLinks.length,
    }
  })
}

function countsOf(data: BackupData): BackupCounts {
  return {
    workspaces: data.workspaces.length,
    terminals: data.terminals.length,
    canvasTexts: data.canvasTexts.length,
    notes: data.notes.length,
    edges: data.edges.length,
    noteLinks: data.noteLinks.length,
  }
}

/** Save-dialog → write the full snapshot as pretty-printed JSON. */
export async function exportToFile(parent?: BrowserWindow): Promise<BackupFileResult> {
  const stamp = new Date().toISOString().slice(0, 10)
  const options: SaveDialogOptions = {
    title: 'Export IAO data',
    defaultPath: join(os.homedir(), `iao-backup-${stamp}.json`),
    filters: FILE_FILTERS,
  }
  // Attaching to the parent window is required for the dialog to display
  // reliably in packaged macOS builds (same as dialog.ipc).
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { canceled: true }

  const data = collectBackup()
  fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8')
  return { canceled: false, path: result.filePath, counts: countsOf(data) }
}

/** Open-dialog → parse the chosen file and merge it into the database. */
export async function importFromFile(parent?: BrowserWindow): Promise<BackupFileResult> {
  const options: OpenDialogOptions = {
    title: 'Import IAO data',
    defaultPath: os.homedir(),
    properties: ['openFile'],
    filters: FILE_FILTERS,
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }

  const path = result.filePaths[0]
  const data = parseBackup(fs.readFileSync(path, 'utf8'))
  const counts = applyBackup(data)
  return { canceled: false, path, counts }
}
