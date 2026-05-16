// Shape of the bridges exposed by the preload layer on `window`.
// Lives in `shared` so both the preload implementation and the renderer's
// global typings reference the same contract.
import type { EdgeRecord, TerminalRecord } from './terminal'
import type { PtyCreateArgs, PtyCreateResult } from './ipc'
import type { WorkspaceRecord } from './workspace'

export interface PtyApi {
  create(args: PtyCreateArgs): Promise<PtyCreateResult>
  input(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  onData(cb: (id: string, data: string) => void): () => void
  onExit(cb: (id: string) => void): () => void
}

export interface DbApi {
  listActive(workspaceId?: string): Promise<TerminalRecord[]>
  upsert(record: TerminalRecord): Promise<void>
  remove(id: string): Promise<void>
  listEdges(): Promise<EdgeRecord[]>
  upsertEdge(record: EdgeRecord): Promise<void>
  removeEdge(id: string): Promise<void>
}

export interface WorkspaceApi {
  list(): Promise<WorkspaceRecord[]>
  create(record: WorkspaceRecord): Promise<void>
  delete(id: string): Promise<void>
}

export interface DialogApi {
  selectFolder(): Promise<string | null>
}
