// Shape of the bridges exposed by the preload layer on `window`.
// Lives in `shared` so both the preload implementation and the renderer's
// global typings reference the same contract.
import type { EdgeRecord, TerminalRecord } from './terminal'
import type { CanvasTextRecord } from './canvas'
import type { NoteRecord, NoteLinkRecord } from './notes'
import type { ModelRecord } from './model'
import type { PtyCreateArgs, PtyCreateResult } from './ipc'
import type { WorkspaceRecord } from './workspace'
import type { BackupFileResult } from './backup'

export interface PtyApi {
  create(args: PtyCreateArgs): Promise<PtyCreateResult>
  input(id: string, data: string): void
  getPathForFile(file: File): string
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  onData(cb: (id: string, data: string) => void): () => void
  onExit(cb: (id: string) => void): () => void
}

export interface DbApi {
  listActive(workspaceId?: string): Promise<TerminalRecord[]>
  upsert(record: TerminalRecord): Promise<void>
  remove(id: string): Promise<void>
  reorderTerminals(workspaceId: string, orderedIds: string[]): Promise<void>
  listEdges(): Promise<EdgeRecord[]>
  upsertEdge(record: EdgeRecord): Promise<void>
  removeEdge(id: string): Promise<void>
  listCanvasTexts(workspaceId: string): Promise<CanvasTextRecord[]>
  upsertCanvasText(record: CanvasTextRecord): Promise<void>
  removeCanvasText(id: string): Promise<void>
  listNotes(workspaceId: string): Promise<NoteRecord[]>
  upsertNote(record: NoteRecord): Promise<void>
  removeNote(id: string): Promise<void>
  listNoteLinks(): Promise<NoteLinkRecord[]>
  upsertNoteLink(record: NoteLinkRecord): Promise<void>
  removeNoteLink(id: string): Promise<void>
  /** Every registered model, ordered by agent then registration time. */
  listModels(): Promise<ModelRecord[]>
  /**
   * Register a model (or rename an existing one by id). Silently ignored when
   * the agent already has that value registered — uniqueness is per
   * (agent, value), case-insensitive.
   */
  upsertModel(record: ModelRecord): Promise<void>
  removeModel(id: string): Promise<void>
  /**
   * Subscribe to note/link mutations driven from outside the renderer (e.g. an
   * agent using the `iao note` CLI). Fires after the main process has persisted
   * the change so the renderer can re-list notes and links. Returns an
   * unsubscribe function.
   */
  onNotesChanged(cb: () => void): () => void
}

export interface WorkspaceApi {
  list(): Promise<WorkspaceRecord[]>
  create(record: WorkspaceRecord): Promise<void>
  delete(id: string): Promise<void>
  rename(id: string, name: string): Promise<void>
  duplicate(id: string): Promise<WorkspaceRecord>
  reorder(orderedIds: string[]): Promise<void>
  /** Turn a workspace on/off (deactivates its terminals + notes). Persisted. */
  setEnabled(id: string, enabled: boolean): Promise<void>
}

export interface DialogApi {
  selectFolder(defaultPath?: string): Promise<string | null>
}

export interface BackupApi {
  /** Save-dialog → write every table to a JSON backup file. */
  exportToFile(): Promise<BackupFileResult>
  /**
   * Open-dialog → merge a backup file into the database (upsert by id; nothing
   * is deleted). Rejects when the chosen file is not a valid IAO backup.
   */
  importFromFile(): Promise<BackupFileResult>
}

export interface WindowApi {
  isFullScreen(): Promise<boolean>
  setFullScreen(value: boolean): Promise<boolean>
  openInVSCode(folder: string): Promise<boolean>
  onFullScreenChange(cb: (value: boolean) => void): () => void
}
