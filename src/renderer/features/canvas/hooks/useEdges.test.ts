import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EdgeRecord } from '@shared/types/terminal'

const { mockEdgeRepository } = vi.hoisted(() => ({
  mockEdgeRepository: {
    list: vi.fn(),
    persist: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('../services/edgeRepository', () => ({
  edgeRepository: mockEdgeRepository,
}))

import { edgeRepository } from '../services/edgeRepository'
import { useEdges } from './useEdges'

const baseEdge: EdgeRecord = {
  id: 'edge-1',
  source: 'term-a',
  target: 'term-b',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEdgeRepository.list.mockResolvedValue([])
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('edge-new')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useEdges', () => {
  it('starts with an empty edges array', async () => {
    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))

    expect(result.current.edges).toEqual([])

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))
  })

  it('rehydrates edges from edgeRepository.list on mount', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))

    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))
    expect(edgeRepository.list).toHaveBeenCalledTimes(1)
  })

  it('ignores self-loops', async () => {
    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.addEdge('term-a', 'term-a')
    })

    expect(result.current.edges).toEqual([])
    expect(edgeRepository.persist).not.toHaveBeenCalled()
  })

  it('dedupes edges in the same direction', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))
    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))

    act(() => {
      result.current.addEdge('term-a', 'term-b')
    })

    expect(result.current.edges).toEqual([baseEdge])
    expect(edgeRepository.persist).not.toHaveBeenCalled()
  })

  it('dedupes edges in the inverse direction', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))
    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))

    act(() => {
      result.current.addEdge('term-b', 'term-a')
    })

    expect(result.current.edges).toEqual([baseEdge])
    expect(edgeRepository.persist).not.toHaveBeenCalled()
  })

  it('persists a new edge via edgeRepository.persist', async () => {
    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.addEdge('term-a', 'term-b')
    })

    expect(edgeRepository.persist).toHaveBeenCalledTimes(1)
    expect(edgeRepository.persist).toHaveBeenCalledWith({
      id: 'edge-new',
      source: 'term-a',
      target: 'term-b',
    })
    expect(result.current.edges).toEqual([
      {
        id: 'edge-new',
        source: 'term-a',
        target: 'term-b',
      },
    ])
  })

  it('persists removals via edgeRepository.remove and removes the edge from state', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))

    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))

    act(() => {
      result.current.removeEdge('edge-1')
    })

    expect(edgeRepository.remove).toHaveBeenCalledTimes(1)
    expect(edgeRepository.remove).toHaveBeenCalledWith('edge-1')
    expect(result.current.edges).toEqual([])
  })

  // ── Workspace scoping (9.1-9.5) ───────────────────────────────────────────

  it('9.1 edges whose source and target are both in nodeIds are included', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))

    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))
  })

  it('9.2 an edge is excluded when its source node is not in nodeIds', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges(['term-b']))

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))
    expect(result.current.edges).toEqual([])
  })

  it('9.3 an edge is excluded when its target node is not in nodeIds', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges(['term-a']))

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))
    expect(result.current.edges).toEqual([])
  })

  it('9.4 adding a node id to nodeIds makes a previously excluded edge visible', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useEdges(ids),
      { initialProps: { ids: ['term-a'] } },
    )

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))
    expect(result.current.edges).toEqual([])

    rerender({ ids: ['term-a', 'term-b'] })
    expect(result.current.edges).toEqual([baseEdge])
  })

  it('9.5 addEdge and removeEdge still work correctly when scoped', async () => {
    const { result } = renderHook(() => useEdges(['term-a', 'term-b']))

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.addEdge('term-a', 'term-b')
    })

    expect(result.current.edges).toHaveLength(1)
    const addedId = result.current.edges[0].id

    act(() => {
      result.current.removeEdge(addedId)
    })

    expect(result.current.edges).toHaveLength(0)
    expect(edgeRepository.remove).toHaveBeenCalledWith(addedId)
  })
})
