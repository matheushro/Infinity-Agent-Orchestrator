// Owns the workspace list and the active workspace selection.
import { useCallback, useEffect, useState } from 'react'
import { useLocalStorage } from '@renderer/hooks/useLocalStorage'
import type { WorkspaceRecord } from '@shared/types/workspace'

export interface UseWorkspacesResult {
  workspaces: WorkspaceRecord[]
  activeId: string
  setActiveId: (id: string) => void
  createWorkspace: (name: string) => Promise<void>
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

  return { workspaces, activeId, setActiveId, createWorkspace }
}
