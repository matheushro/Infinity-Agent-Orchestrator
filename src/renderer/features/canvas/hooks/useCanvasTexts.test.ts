import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasTextRecord } from '@shared/types/canvas'

const { mockTextElementRepository, mockCreateCanvasTextId } = vi.hoisted(() => ({
  mockTextElementRepository: { list: vi.fn(), persist: vi.fn(), remove: vi.fn() },
  mockCreateCanvasTextId: vi.fn(),
}))

vi.mock('../services/textElementRepository', () => ({
  textElementRepository: mockTextElementRepository,
}))

vi.mock('@renderer/lib/id', () => ({
  createCanvasTextId: mockCreateCanvasTextId,
}))

import { useCanvasTexts } from './useCanvasTexts'

const baseText: CanvasTextRecord = {
  id: 'text-1',
  text: 'Note',
  x: 10,
  y: 20,
  width: 220,
  height: 44,
  workspace_id: 'ws-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTextElementRepository.list.mockResolvedValue([])
  mockCreateCanvasTextId.mockReturnValue('text-new')
})

describe('useCanvasTexts', () => {
  it('hydrates canvas text elements for the current workspace', async () => {
    mockTextElementRepository.list.mockResolvedValue([baseText])

    const { result } = renderHook(() => useCanvasTexts('ws-1'))

    await waitFor(() => expect(result.current.texts).toEqual([baseText]))
    expect(mockTextElementRepository.list).toHaveBeenCalledWith('ws-1')
  })

  it('creates an editable draft at the requested position without persisting yet', async () => {
    const { result } = renderHook(() => useCanvasTexts('ws-1'))
    await waitFor(() => expect(mockTextElementRepository.list).toHaveBeenCalled())

    let id = ''
    act(() => {
      id = result.current.createText({ x: 80, y: 70 })
    })

    expect(id).toBe('text-new')
    expect(result.current.texts[0]).toMatchObject({
      id: 'text-new',
      text: '',
      x: 80,
      y: 70,
      workspace_id: 'ws-1',
    })
    expect(mockTextElementRepository.persist).not.toHaveBeenCalled()
  })

  it('moves text in memory without persisting during drag', async () => {
    mockTextElementRepository.list.mockResolvedValue([baseText])
    const { result } = renderHook(() => useCanvasTexts('ws-1'))
    await waitFor(() => expect(result.current.texts).toHaveLength(1))

    act(() => {
      result.current.moveText('text-1', { x: 40, y: 50 })
    })

    expect(result.current.texts[0]).toMatchObject({ x: 40, y: 50 })
    expect(mockTextElementRepository.persist).not.toHaveBeenCalled()
  })

  it('persists non-empty text updates', async () => {
    mockTextElementRepository.list.mockResolvedValue([baseText])
    const { result } = renderHook(() => useCanvasTexts('ws-1'))
    await waitFor(() => expect(result.current.texts).toHaveLength(1))

    act(() => {
      result.current.updateText('text-1', { text: 'Updated' })
    })

    expect(mockTextElementRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'text-1', text: 'Updated' }),
    )
  })

  it('does not persist blank text drafts', async () => {
    const { result } = renderHook(() => useCanvasTexts('ws-1'))
    await waitFor(() => expect(mockTextElementRepository.list).toHaveBeenCalled())

    act(() => {
      result.current.createText({ x: 0, y: 0 })
      result.current.updateText('text-new', { text: '   ' })
    })

    expect(mockTextElementRepository.persist).not.toHaveBeenCalled()
  })

  it('removes text from persistence and state', async () => {
    mockTextElementRepository.list.mockResolvedValue([baseText])
    const { result } = renderHook(() => useCanvasTexts('ws-1'))
    await waitFor(() => expect(result.current.texts).toHaveLength(1))

    act(() => {
      result.current.removeText('text-1')
    })

    expect(mockTextElementRepository.remove).toHaveBeenCalledWith('text-1')
    expect(result.current.texts).toEqual([])
  })
})
