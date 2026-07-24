import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelRecord } from '@shared/types/model'

// --- boundary mocks ---

const { mockModelRepository } = vi.hoisted(() => ({
  mockModelRepository: { list: vi.fn(), upsert: vi.fn(), remove: vi.fn() },
}))

vi.mock('../services/modelRepository', () => ({
  modelRepository: mockModelRepository,
}))

import { useModels } from './useModels'

const GENERATED_ID = '00000000-0000-4000-8000-000000000000' as const

const opus: ModelRecord = { id: 'm-1', agent: 'claude', value: 'opus', label: 'Opus' }
const sonnet: ModelRecord = { id: 'm-2', agent: 'claude', value: 'sonnet', label: 'Sonnet' }
const gpt: ModelRecord = { id: 'm-3', agent: 'codex', value: 'gpt-5.4', label: 'gpt-5.4' }

beforeEach(() => {
  vi.clearAllMocks()
  mockModelRepository.list.mockResolvedValue([opus, sonnet, gpt])
  mockModelRepository.upsert.mockResolvedValue(undefined)
  mockModelRepository.remove.mockResolvedValue(undefined)
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(GENERATED_ID)
})

/** Render the hook and wait for the initial catalog load to land. */
async function renderLoaded() {
  const view = renderHook(() => useModels())
  await waitFor(() => expect(view.result.current.models).toHaveLength(3))
  return view
}

describe('useModels', () => {
  it('loads the catalog on mount', async () => {
    const { result } = await renderLoaded()

    expect(mockModelRepository.list).toHaveBeenCalledOnce()
    expect(result.current.models).toEqual([opus, sonnet, gpt])
  })

  it('scopes models to one agent, keeping registration order', async () => {
    const { result } = await renderLoaded()

    expect(result.current.modelsFor('claude')).toEqual([opus, sonnet])
    expect(result.current.modelsFor('codex')).toEqual([gpt])
    expect(result.current.modelsFor('terminal')).toEqual([])
  })

  it('registers an unknown model and adds it to the agent list', async () => {
    const { result } = await renderLoaded()

    await act(async () => {
      await result.current.register('codex', 'gpt-5.5')
    })

    const expected = { id: GENERATED_ID, agent: 'codex', value: 'gpt-5.5', label: 'gpt-5.5' }
    expect(mockModelRepository.upsert).toHaveBeenCalledWith(expected)
    expect(result.current.modelsFor('codex')).toEqual([gpt, expected])
  })

  it('trims the typed value before registering it', async () => {
    const { result } = await renderLoaded()

    await act(async () => {
      await result.current.register('codex', '  gpt-5.5  ')
    })

    expect(mockModelRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'gpt-5.5', label: 'gpt-5.5' }),
    )
  })

  it('does not duplicate a model already registered for that agent', async () => {
    const { result } = await renderLoaded()

    let returned: ModelRecord | null = null
    await act(async () => {
      returned = await result.current.register('claude', 'opus')
    })

    expect(returned).toEqual(opus)
    expect(mockModelRepository.upsert).not.toHaveBeenCalled()
    expect(result.current.modelsFor('claude')).toEqual([opus, sonnet])
  })

  it('treats a differently-cased value as the same model', async () => {
    const { result } = await renderLoaded()

    await act(async () => {
      await result.current.register('claude', 'OPUS')
    })

    expect(mockModelRepository.upsert).not.toHaveBeenCalled()
    expect(result.current.modelsFor('claude')).toHaveLength(2)
  })

  it('registers the same value separately for a different agent', async () => {
    const { result } = await renderLoaded()

    await act(async () => {
      await result.current.register('copilot', 'gpt-5.4')
    })

    expect(mockModelRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'copilot', value: 'gpt-5.4' }),
    )
  })

  it('registers nothing for an empty value — that is "agent default"', async () => {
    const { result } = await renderLoaded()

    let returned: ModelRecord | null = opus
    await act(async () => {
      returned = await result.current.register('claude', '   ')
    })

    expect(returned).toBeNull()
    expect(mockModelRepository.upsert).not.toHaveBeenCalled()
  })

  it('removes a model from the catalog', async () => {
    const { result } = await renderLoaded()

    await act(async () => {
      await result.current.remove('m-1')
    })

    expect(mockModelRepository.remove).toHaveBeenCalledWith('m-1')
    expect(result.current.modelsFor('claude')).toEqual([sonnet])
  })
})
