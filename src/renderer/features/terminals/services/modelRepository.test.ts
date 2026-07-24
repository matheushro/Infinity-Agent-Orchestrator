import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelRecord } from '@shared/types/model'
import { modelRepository } from './modelRepository'

const mockDbApi = {
  listModels: vi.fn(),
  upsertModel: vi.fn(),
  removeModel: vi.fn(),
}

vi.stubGlobal('window', { dbApi: mockDbApi })

const record: ModelRecord = { id: 'm-1', agent: 'claude', value: 'opus', label: 'Opus' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('modelRepository', () => {
  it('lists every registered model through the bridge', async () => {
    mockDbApi.listModels.mockResolvedValue([record])

    await expect(modelRepository.list()).resolves.toEqual([record])
    expect(mockDbApi.listModels).toHaveBeenCalledOnce()
  })

  it('forwards a registration to the bridge unchanged', async () => {
    mockDbApi.upsertModel.mockResolvedValue(undefined)

    await modelRepository.upsert(record)

    expect(mockDbApi.upsertModel).toHaveBeenCalledWith(record)
  })

  it('removes a model by id', async () => {
    mockDbApi.removeModel.mockResolvedValue(undefined)

    await modelRepository.remove('m-1')

    expect(mockDbApi.removeModel).toHaveBeenCalledWith('m-1')
  })
})
