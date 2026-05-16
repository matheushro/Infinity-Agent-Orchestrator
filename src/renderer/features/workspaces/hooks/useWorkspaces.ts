// Owns the workspace list and the active workspace selection.
import { useCallback, useEffect, useState } from 'react'
import { useLocalStorage } from '@renderer/hooks/useLocalStorage'
import type { WorkspaceRecord } from '@shared/types/workspace'

export interface UseWorkspacesResult {
  workspaces: WorkspaceRecord[]
  activeId: string
  setActiveId: (id: string) => void
  createWorkspace: (name: string) => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  duplicateWorkspace: (id: string) => Promise<void>
}

export function useWorkspaces(): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [activeId, setActiveId] = useLocalStorage<string>('activeWorkspaceId', '')

  useEffect(() => {
    window.workspaceApi.list().then((list) => {
      setWorkspaces(list)
      // Ensure the stored active id still refers to a valid workspace.
      setActiveId((prev) => {
        const valid = list.some((w) => w.id === prev)
        return valid ? prev : (list[0]?.id ?? '')
      })
    })
  }, [])

  const createWorkspace = useCallback(
    async (name: string) => {
      if (workspaces.length >= 5) return
      const record: WorkspaceRecord = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Workspace',
        created_at: Date.now(),
      }
      await window.workspaceApi.create(record)
      setWorkspaces((prev) => [...prev, record])
      setActiveId(record.id)
    },
    [workspaces.length],
  )

  const renameWorkspace = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await window.workspaceApi.rename(id, trimmed)
    setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name: trimmed } : w)))
  }, [])

  const deleteWorkspace = useCallback(
    async (id: string) => {
      await window.workspaceApi.delete(id)
      setWorkspaces((prev) => {
        const next = prev.filter((w) => w.id !== id)
        setActiveId((cur) => {
          if (cur !== id) return cur
          return next[0]?.id ?? ''
        })
        return next
      })
    },
    [],
  )

  const duplicateWorkspace = useCallback(
    async (id: string) => {
      if (workspaces.length >= 5) return
      const record = await window.workspaceApi.duplicate(id)
      setWorkspaces((prev) => [...prev, record])
      setActiveId(record.id)
    },
    [workspaces.length],
  )

  return { workspaces, activeId, setActiveId, createWorkspace, renameWorkspace, deleteWorkspace, duplicateWorkspace }
}
