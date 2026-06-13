import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteRecord } from '@shared/types/notes'

const { mockNoteRepository, mockCreateNoteId } = vi.hoisted(() => ({
  mockNoteRepository: {
    list: vi.fn(),
    persist: vi.fn(),
    remove: vi.fn(),
    onChange: vi.fn(() => () => {}),
  },
  mockCreateNoteId: vi.fn(),
}))

vi.mock('../services/noteRepository', () => ({
  noteRepository: mockNoteRepository,
}))

vi.mock('@renderer/lib/id', () => ({
  createNoteId: mockCreateNoteId,
}))

import { useNotes, DEFAULT_NOTE_TITLE } from './useNotes'

const baseNote: NoteRecord = {
  id: 'note-1',
  title: 'My note',
  content: '# Hi',
  theme: 'auto',
  x: 10,
  y: 20,
  width: 280,
  height: 200,
  workspace_id: 'ws-1',
  created_at: 1000,
  updated_at: 1000,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockNoteRepository.list.mockResolvedValue([])
  mockCreateNoteId.mockReturnValue('note-new')
})

describe('useNotes', () => {
  it('hydrates notes for the current workspace', async () => {
    mockNoteRepository.list.mockResolvedValue([baseNote])

    const { result } = renderHook(() => useNotes('ws-1'))

    await waitFor(() => expect(result.current.notes).toEqual([baseNote]))
    expect(mockNoteRepository.list).toHaveBeenCalledWith('ws-1')
  })

  it('creates a note with defaults and persists it immediately', async () => {
    const { result } = renderHook(() => useNotes('ws-1'))
    await waitFor(() => expect(mockNoteRepository.list).toHaveBeenCalled())

    let id = ''
    act(() => {
      id = result.current.createNote({ x: 80, y: 70 })
    })

    expect(id).toBe('note-new')
    expect(result.current.notes[0]).toMatchObject({
      id: 'note-new',
      title: DEFAULT_NOTE_TITLE,
      content: '',
      theme: 'auto',
      x: 80,
      y: 70,
      width: 280,
      height: 200,
      workspace_id: 'ws-1',
    })
    expect(mockNoteRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-new' }),
    )
  })

  it('creates a note with a provided size (drag-to-create)', async () => {
    const { result } = renderHook(() => useNotes('ws-1'))
    await waitFor(() => expect(mockNoteRepository.list).toHaveBeenCalled())

    act(() => {
      result.current.createNote({ x: 80, y: 70 }, { width: 420, height: 260 })
    })

    expect(result.current.notes[0]).toMatchObject({
      x: 80,
      y: 70,
      width: 420,
      height: 260,
    })
  })

  it('moves a note in memory without persisting during drag', async () => {
    mockNoteRepository.list.mockResolvedValue([baseNote])
    const { result } = renderHook(() => useNotes('ws-1'))
    await waitFor(() => expect(result.current.notes).toHaveLength(1))

    act(() => {
      result.current.moveNote('note-1', { x: 40, y: 50 })
    })

    expect(result.current.notes[0]).toMatchObject({ x: 40, y: 50 })
    expect(mockNoteRepository.persist).not.toHaveBeenCalled()
  })

  it('persists content updates and bumps updated_at', async () => {
    mockNoteRepository.list.mockResolvedValue([baseNote])
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(7777)
    const { result } = renderHook(() => useNotes('ws-1'))
    await waitFor(() => expect(result.current.notes).toHaveLength(1))

    act(() => {
      result.current.updateNote('note-1', { content: 'updated body' })
    })

    expect(mockNoteRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-1', content: 'updated body', updated_at: 7777 }),
    )
    expect(result.current.notes[0]).toMatchObject({ content: 'updated body', updated_at: 7777 })
    nowSpy.mockRestore()
  })

  it('renames a note through updateNote', async () => {
    mockNoteRepository.list.mockResolvedValue([baseNote])
    const { result } = renderHook(() => useNotes('ws-1'))
    await waitFor(() => expect(result.current.notes).toHaveLength(1))

    act(() => {
      result.current.updateNote('note-1', { title: 'Renamed' })
    })

    expect(result.current.notes[0].title).toBe('Renamed')
    expect(mockNoteRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-1', title: 'Renamed' }),
    )
  })

  it('persists note theme overrides through updateNote', async () => {
    mockNoteRepository.list.mockResolvedValue([baseNote])
    const { result } = renderHook(() => useNotes('ws-1'))
    await waitFor(() => expect(result.current.notes).toHaveLength(1))

    act(() => {
      result.current.updateNote('note-1', { theme: 'dark' })
    })

    expect(result.current.notes[0].theme).toBe('dark')
    expect(mockNoteRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-1', theme: 'dark' }),
    )
  })

  it('removes a note from persistence and state', async () => {
    mockNoteRepository.list.mockResolvedValue([baseNote])
    const { result } = renderHook(() => useNotes('ws-1'))
    await waitFor(() => expect(result.current.notes).toHaveLength(1))

    act(() => {
      result.current.removeNote('note-1')
    })

    expect(mockNoteRepository.remove).toHaveBeenCalledWith('note-1')
    expect(result.current.notes).toEqual([])
  })
})
