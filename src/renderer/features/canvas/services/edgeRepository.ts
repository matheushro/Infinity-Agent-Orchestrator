// Persistence layer for canvas edges. Talks only to window.dbApi.
import type { EdgeRecord } from '@shared/types/terminal'

export const edgeRepository = {
  list(): Promise<EdgeRecord[]> {
    return window.dbApi.listEdges()
  },
  persist(edge: EdgeRecord): void {
    void window.dbApi.upsertEdge(edge)
  },
  remove(id: string): void {
    void window.dbApi.removeEdge(id)
  },
}
