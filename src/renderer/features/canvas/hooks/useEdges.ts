// Owns the persisted set of canvas edges (user-created connections between
// terminal nodes). Filtered to the node IDs of the current workspace.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EdgeRecord } from '@shared/types/terminal'
import { edgeRepository } from '../services/edgeRepository'

export interface UseEdgesResult {
  edges: EdgeRecord[]
  addEdge: (source: string, target: string) => void
  removeEdge: (id: string) => void
}

export function useEdges(nodeIds: string[]): UseEdgesResult {
  const [allEdges, setAllEdges] = useState<EdgeRecord[]>([])

  useEffect(() => {
    edgeRepository.list().then(setAllEdges)
  }, [])

  // Only expose edges whose both endpoints belong to this workspace's nodes.
  const edges = useMemo(() => {
    const idSet = new Set(nodeIds)
    return allEdges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
  }, [allEdges, nodeIds])

  const addEdge = useCallback((source: string, target: string) => {
    if (source === target) return
    setAllEdges((prev) => {
      const exists = prev.some(
        (e) =>
          (e.source === source && e.target === target) ||
          (e.source === target && e.target === source),
      )
      if (exists) return prev
      const edge: EdgeRecord = {
        id: crypto.randomUUID(),
        source,
        target,
      }
      edgeRepository.persist(edge)
      return [...prev, edge]
    })
  }, [])

  const removeEdge = useCallback((id: string) => {
    edgeRepository.remove(id)
    setAllEdges((prev) => prev.filter((e) => e.id !== id))
  }, [])

  return { edges, addEdge, removeEdge }
}
