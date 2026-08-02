// Owns the terminal node collection: state + persistence side effects.
// This is the logic extracted out of App.tsx — App just consumes this hook.
import { useCallback, useEffect, useState } from 'react'
import { createTerminalId } from '@renderer/lib/id'
import { COMMANDS } from '../commands'
import { terminalRepository } from '../services/terminalRepository'
import type { CommandKey, ShellType, TerminalNodeData } from '../types'

export interface UseTerminalsResult {
  nodes: TerminalNodeData[]
  createTerminal: (
    folder: string,
    command: CommandKey,
    name: string,
    shell: ShellType,
    position?: { x: number; y: number; width?: number; height?: number },
    /** Agent config chosen in the create modal — applied on the very first launch. */
    agent?: { prompt?: string; model?: string }
  ) => string
  duplicateTerminal: (id: string) => string | null
  /** In-memory transient update used during drag/resize — no DB write. */
  moveNode: (id: string, patch: Partial<TerminalNodeData>) => void
  /** Persisted update — writes the row to SQLite. */
  updateNode: (id: string, patch: Partial<TerminalNodeData>) => void
  /** Turn a terminal on/off. Persisted; an "off" terminal stays on the canvas
   * but runs no pty/xterm session (saves RAM/CPU). */
  setNodeEnabled: (id: string, enabled: boolean) => void
  removeNode: (id: string) => void
}

export function useTerminals(workspaceId: string): UseTerminalsResult {
  const [nodes, setNodes] = useState<TerminalNodeData[]>([])

  // Restore the terminals that were active in the previous session for this workspace.
  useEffect(() => {
    if (!workspaceId) return
    terminalRepository.listActive(workspaceId).then(setNodes)
  }, [workspaceId])

  const createTerminal = useCallback(
    (
      folder: string,
      command: CommandKey,
      name: string,
      shell: ShellType,
      position?: { x: number; y: number; width?: number; height?: number },
      agent?: { prompt?: string; model?: string }
    ) => {
      // The id and the persist side-effect must live outside the setNodes
      // updater: React StrictMode runs updaters twice, which would generate
      // two ids and persist two rows for a single terminal.
      const id = createTerminalId()
      const folderName = folder.split('/').filter(Boolean).pop() || folder
      setNodes((prev) => {
        const node: TerminalNodeData = {
          id,
          x: position ? position.x : 40 + ((prev.length * 30) % 300),
          y: position ? position.y : 40 + ((prev.length * 30) % 300),
          width: position?.width ?? 600,
          height: position?.height ?? 380,
          shell,
          title: name || `${COMMANDS[command].label} · ${folderName}`,
          cwd: folder,
          command,
          // Set at creation time so the first pty already launches with the
          // agent's role and pinned model — no restart needed.
          prompt: agent?.prompt ?? '',
          model: agent?.model ?? '',
          workspace_id: workspaceId,
          enabled: true,
        }
        terminalRepository.persist(node)
        return [...prev, node]
      })
      return id
    },
    [workspaceId],
  )

  const moveNode = useCallback((id: string, patch: Partial<TerminalNodeData>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }, [])

  const duplicateTerminal = useCallback(
    (id: string): string | null => {
      const source = nodes.find((node) => node.id === id)
      if (!source) return null

      const duplicate: TerminalNodeData = {
        ...source,
        id: createTerminalId(),
        x: source.x + source.width + 24,
        title: `${source.title} - Copy`,
        workspace_id: workspaceId,
      }
      terminalRepository.persist(duplicate)
      setNodes((prev) => [...prev, duplicate])
      return duplicate.id
    },
    [nodes, workspaceId],
  )

  const updateNode = useCallback((id: string, patch: Partial<TerminalNodeData>) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n
        const next = { ...n, ...patch }
        terminalRepository.persist(next)
        return next
      }),
    )
  }, [])

  const setNodeEnabled = useCallback((id: string, enabled: boolean) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id || n.enabled === enabled) return n
        const next = { ...n, enabled }
        terminalRepository.persist(next)
        return next
      }),
    )
  }, [])

  const removeNode = useCallback((id: string) => {
    window.ptyApi.kill(id)
    terminalRepository.remove(id)
    setNodes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return {
    nodes,
    createTerminal,
    duplicateTerminal,
    moveNode,
    updateNode,
    setNodeEnabled,
    removeNode,
  }
}
