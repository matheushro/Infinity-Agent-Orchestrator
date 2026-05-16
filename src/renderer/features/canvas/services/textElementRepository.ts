// Persistence adapter for canvas-owned free-text elements.
import type { CanvasTextRecord } from '@shared/types/canvas'

export const textElementRepository = {
  async list(workspaceId: string): Promise<CanvasTextRecord[]> {
    return window.dbApi.listCanvasTexts(workspaceId)
  },

  persist(record: CanvasTextRecord): void {
    void window.dbApi.upsertCanvasText(record)
  },

  remove(id: string): void {
    void window.dbApi.removeCanvasText(id)
  },
}
