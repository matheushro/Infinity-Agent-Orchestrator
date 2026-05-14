// Persistence layer for terminals. Maps between the persisted TerminalRecord
// and the in-memory TerminalNodeData, and talks only to the preload `dbApi`
// bridge — it never touches Electron directly.
import type { TerminalRecord } from '@shared/types/terminal'
import type { CommandKey, ShellType, TerminalNodeData } from '../types'

function recordToNode(r: TerminalRecord): TerminalNodeData {
  return {
    id: r.id,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    shell: r.shell as ShellType,
    title: r.title,
    cwd: r.cwd,
    command: r.command as CommandKey
  }
}

function nodeToRecord(n: TerminalNodeData): TerminalRecord {
  return {
    id: n.id,
    title: n.title,
    cwd: n.cwd,
    command: n.command,
    shell: n.shell,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height
  }
}

export const terminalRepository = {
  /** Restore the terminals that were active in the previous session. */
  async listActive(): Promise<TerminalNodeData[]> {
    const rows = await window.dbApi.listActive()
    return rows.map(recordToNode)
  },

  /** Insert or update a terminal node. */
  persist(node: TerminalNodeData): void {
    void window.dbApi.upsert(nodeToRecord(node))
  },

  /** Permanently remove a terminal node. */
  remove(id: string): void {
    void window.dbApi.remove(id)
  }
}
