// Persistence layer for the model catalog. Talks only to the preload `dbApi`
// bridge — it never touches Electron directly.
import type { ModelRecord } from '@shared/types/model'

export const modelRepository = {
  /** Every registered model, across all agents. */
  list(): Promise<ModelRecord[]> {
    return window.dbApi.listModels()
  },

  /** Register a model, or rename one by id. Ignored when already registered. */
  upsert(record: ModelRecord): Promise<void> {
    return window.dbApi.upsertModel(record)
  },

  /** Drop a model from the catalog. Terminals already pinned to it keep their pin. */
  remove(id: string): Promise<void> {
    return window.dbApi.removeModel(id)
  },
}
