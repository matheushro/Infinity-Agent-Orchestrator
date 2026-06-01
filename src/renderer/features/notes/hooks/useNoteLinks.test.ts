import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteLinkRecord } from '@shared/types/notes'

const { mockNoteLinkRepository } = vi.hoisted(() => ({
  mockNoteLinkRepository: {
    list: vi.fn(),
    persist: vi.fn(),
    remove: vi.fn(),
    onChange: vi.fn(() => () => {}),
  },
}))

vi.mock('../services/noteLinkRepository', () => ({
  noteLinkRepository: mockNoteLinkRepository,
}))

import { noteLinkRepository } from '../services/noteLinkRepository'
import { useNoteLinks } from './useNoteLinks'

const baseLink: NoteLinkRecord = {
  id: 'link-1',
  note_id: 'note-a',
  terminal_id: 'term-a',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockNoteLinkRepository.list.mockResolvedValue([])
  mockNoteLinkRepository.onChange.mockReturnValue(() => {})
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('link-new')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useNoteLinks', () => {
  it('rehydrates links from the repository on mount', async () => {
    mockNoteLinkRepository.list.mockResolvedValue([baseLink])

    const { result } = renderHook(() => useNoteLinks(['term-a'], ['note-a']))

    await waitFor(() => expect(result.current.noteLinks).toEqual([baseLink]))
    expect(noteLinkRepository.list).toHaveBeenCalledTimes(1)
  })

  it('subscribes to onChange and re-lists when it fires', async () => {
    let fire: () => void = () => {}
    mockNoteLinkRepository.onChange.mockImplementation((cb: () => void) => {
      fire = cb
      return () => {}
    })
    mockNoteLinkRepository.list.mockResolvedValue([])

    const { result } = renderHook(() => useNoteLinks(['term-a'], ['note-a']))
    await waitFor(() => expect(noteLinkRepository.list).toHaveBeenCalledTimes(1))

    mockNoteLinkRepository.list.mockResolvedValue([baseLink])
    act(() => {
      fire()
    })

    await waitFor(() => expect(result.current.noteLinks).toEqual([baseLink]))
  })

  it('only exposes links whose note and terminal are both in view', async () => {
    mockNoteLinkRepository.list.mockResolvedValue([baseLink])

    const { result } = renderHook(() => useNoteLinks(['term-a'], []))

    await waitFor(() => expect(noteLinkRepository.list).toHaveBeenCalledTimes(1))
    expect(result.current.noteLinks).toEqual([])
  })

  it('persists a new link via the repository', async () => {
    const { result } = renderHook(() => useNoteLinks(['term-a'], ['note-a']))
    await waitFor(() => expect(noteLinkRepository.list).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.addNoteLink('note-a', 'term-a')
    })

    expect(noteLinkRepository.persist).toHaveBeenCalledWith({
      id: 'link-new',
      note_id: 'note-a',
      terminal_id: 'term-a',
    })
    expect(result.current.noteLinks).toEqual([
      { id: 'link-new', note_id: 'note-a', terminal_id: 'term-a' },
    ])
  })

  it('dedupes an existing note/terminal pair', async () => {
    mockNoteLinkRepository.list.mockResolvedValue([baseLink])

    const { result } = renderHook(() => useNoteLinks(['term-a'], ['note-a']))
    await waitFor(() => expect(result.current.noteLinks).toEqual([baseLink]))

    act(() => {
      result.current.addNoteLink('note-a', 'term-a')
    })

    expect(result.current.noteLinks).toEqual([baseLink])
    expect(noteLinkRepository.persist).not.toHaveBeenCalled()
  })

  it('removes a link via the repository and from state', async () => {
    mockNoteLinkRepository.list.mockResolvedValue([baseLink])

    const { result } = renderHook(() => useNoteLinks(['term-a'], ['note-a']))
    await waitFor(() => expect(result.current.noteLinks).toEqual([baseLink]))

    act(() => {
      result.current.removeNoteLink('link-1')
    })

    expect(noteLinkRepository.remove).toHaveBeenCalledWith('link-1')
    expect(result.current.noteLinks).toEqual([])
  })
})
