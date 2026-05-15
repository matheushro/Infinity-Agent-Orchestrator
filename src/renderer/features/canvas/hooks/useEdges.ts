// Owns the persisted set of canvas edges (user-created connections between
// terminal nodes). Mirrors the shape of useTerminals.
import { useCallback, useEffect, useState } from 'react'
import type { EdgeRecord } from '@shared/types/terminal'
import { edgeRepository } from '../services/edgeRepository'

export interface UseEdgesResult {
  edges: EdgeRecord[]
  addEdge: (source: string, target: string) => void
  removeEdge: (id: string) => void
}

export function useEdges(): UseEdgesResult {
  const [edges, setEdges] = useState<EdgeRecord[]>([])

  useEffect(() => {
    edgeRepository.list().then(setEdges)
  }, [])

  const addEdge = useCallback((source: string, target: string) => {
    if (source === target) return
    setEdges((prev) => {
      // No duplicates regardless of direction.
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
    setEdges((prev) => prev.filter((e) => e.id !== id))
  }, [])

  return { edges, addEdge, removeEdge }
}
