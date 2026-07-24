// Domain types for exporting/importing the whole persisted state as a single
// JSON file (workspaces, terminals — including agent command/prompt/model —,
// canvas texts, notes, edges, note links).
import type { CanvasTextRecord } from './canvas'
import type { ModelRecord } from './model'
import type { NoteRecord, NoteLinkRecord } from './notes'
import type { EdgeRecord, TerminalRecord } from './terminal'
import type { WorkspaceRecord } from './workspace'

/** Bump when the backup file shape changes incompatibly. */
export const BACKUP_VERSION = 1

/** Full portable snapshot of the database, written/read as JSON. */
export interface BackupData {
  version: typeof BACKUP_VERSION
  /** Unix ms timestamp of when the export was taken. */
  exportedAt: number
  workspaces: WorkspaceRecord[]
  terminals: TerminalRecord[]
  canvasTexts: CanvasTextRecord[]
  notes: NoteRecord[]
  edges: EdgeRecord[]
  noteLinks: NoteLinkRecord[]
  /**
   * The registered model catalog. Optional so files exported before the
   * catalog existed still import — they are treated as carrying no models,
   * which leaves the local catalog untouched. Kept at `BACKUP_VERSION` 1 for
   * that reason: the addition is backward *and* forward compatible.
   */
  models?: ModelRecord[]
}

/** How many records of each kind an export/import touched. */
export interface BackupCounts {
  workspaces: number
  terminals: number
  canvasTexts: number
  notes: number
  edges: number
  noteLinks: number
  models: number
}

/**
 * Outcome of an export/import driven by a native file dialog. `canceled` means
 * the user dismissed the dialog — nothing was written or read.
 */
export type BackupFileResult =
  | { canceled: true }
  | { canceled: false; path: string; counts: BackupCounts }
