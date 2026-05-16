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
    const { result } = renderHook(() => useEdges())

    expect(result.current.edges).toEqual([])

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))
  })

  it('rehydrates edges from edgeRepository.list on mount', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges())

    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))
    expect(edgeRepository.list).toHaveBeenCalledTimes(1)
  })

  it('ignores self-loops', async () => {
    const { result } = renderHook(() => useEdges())

    await waitFor(() => expect(edgeRepository.list).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.addEdge('term-a', 'term-a')
    })

    expect(result.current.edges).toEqual([])
    expect(edgeRepository.persist).not.toHaveBeenCalled()
  })

  it('dedupes edges in the same direction', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges())
    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))

    act(() => {
      result.current.addEdge('term-a', 'term-b')
    })

    expect(result.current.edges).toEqual([baseEdge])
    expect(edgeRepository.persist).not.toHaveBeenCalled()
  })

  it('dedupes edges in the inverse direction', async () => {
    mockEdgeRepository.list.mockResolvedValue([baseEdge])

    const { result } = renderHook(() => useEdges())
    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))

    act(() => {
      result.current.addEdge('term-b', 'term-a')
    })

    expect(result.current.edges).toEqual([baseEdge])
    expect(edgeRepository.persist).not.toHaveBeenCalled()
  })

  it('persists a new edge via edgeRepository.persist', async () => {
    const { result } = renderHook(() => useEdges())

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

    const { result } = renderHook(() => useEdges())

    await waitFor(() => expect(result.current.edges).toEqual([baseEdge]))

    act(() => {
      result.current.removeEdge('edge-1')
    })

    expect(edgeRepository.remove).toHaveBeenCalledTimes(1)
    expect(edgeRepository.remove).toHaveBeenCalledWith('edge-1')
    expect(result.current.edges).toEqual([])
  })
})
