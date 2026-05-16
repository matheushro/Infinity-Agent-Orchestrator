import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EdgeRecord } from '@shared/types/terminal'
import { edgeRepository } from './edgeRepository'

const mockDbApi = {
  listActive: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  listEdges: vi.fn(),
  upsertEdge: vi.fn(),
  removeEdge: vi.fn(),
}

vi.stubGlobal('window', { dbApi: mockDbApi })

const edge: EdgeRecord = {
  id: 'edge-1',
  source: 'node-a',
  target: 'node-b',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('edgeRepository.list', () => {
  it('calls window.dbApi.listEdges and returns its result', async () => {
    mockDbApi.listEdges.mockResolvedValue([edge])

    const result = await edgeRepository.list()

    expect(mockDbApi.listEdges).toHaveBeenCalledOnce()
    expect(result).toEqual([edge])
  })

  it('returns empty array when dbApi returns no rows', async () => {
    mockDbApi.listEdges.mockResolvedValue([])

    const result = await edgeRepository.list()

    expect(result).toEqual([])
  })

  it('returns multiple edges preserving order', async () => {
    const second: EdgeRecord = { id: 'edge-2', source: 'node-b', target: 'node-c' }
    mockDbApi.listEdges.mockResolvedValue([edge, second])

    const result = await edgeRepository.list()

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('edge-1')
    expect(result[1].id).toBe('edge-2')
  })
})

describe('edgeRepository.persist', () => {
  it('calls window.dbApi.upsertEdge with the given EdgeRecord', () => {
    edgeRepository.persist(edge)

    expect(mockDbApi.upsertEdge).toHaveBeenCalledOnce()
    expect(mockDbApi.upsertEdge).toHaveBeenCalledWith<[EdgeRecord]>(edge)
  })
})

describe('edgeRepository.remove', () => {
  it('calls window.dbApi.removeEdge with the given id', () => {
    edgeRepository.remove('edge-1')

    expect(mockDbApi.removeEdge).toHaveBeenCalledOnce()
    expect(mockDbApi.removeEdge).toHaveBeenCalledWith('edge-1')
  })
})
