import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRecord } from '@shared/types/workspace'

// ── Boundary mocks ──────────────────────────────────────────────────────────

const mockLocalStorage = vi.hoisted(() => {
  const store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  }
})

vi.mock('@renderer/hooks/useLocalStorage', async () => {
  const { useState, useCallback } = await import('react')
  return {
    useLocalStorage: <T,>(key: string, def: T) => {
      const raw = mockLocalStorage.getItem(key)
      const [val, setVal] = useState<T>(raw != null ? (JSON.parse(raw) as T) : def)
      const setter = useCallback(
        (v: T | ((prev: T) => T)) => {
          setVal((prev) => {
            const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
            mockLocalStorage.setItem(key, JSON.stringify(next))
            return next
          })
        },
        [],
      )
      return [val, setter] as const
    },
  }
})

const mockWorkspaceApi = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  rename: vi.fn(),
  duplicate: vi.fn(),
}))

import { useWorkspaces } from './useWorkspaces'

const WS1: WorkspaceRecord = { id: 'ws-1', name: 'Main', created_at: 1000 }
const WS2: WorkspaceRecord = { id: 'ws-2', name: 'Side', created_at: 2000 }

beforeEach(() => {
  vi.clearAllMocks()
  mockLocalStorage.clear()
  mockWorkspaceApi.list.mockResolvedValue([WS1])
  mockWorkspaceApi.create.mockResolvedValue(undefined)
  mockWorkspaceApi.delete.mockResolvedValue(undefined)
  mockWorkspaceApi.rename.mockResolvedValue(undefined)
  mockWorkspaceApi.duplicate.mockResolvedValue(undefined)
  Object.assign(window, { workspaceApi: mockWorkspaceApi })
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-new' as ReturnType<typeof crypto.randomUUID>)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useWorkspaces', () => {
  it('5.1 on mount calls window.workspaceApi.list() and populates workspaces', async () => {
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
    expect(result.current.workspaces[0]).toEqual(WS1)
    expect(mockWorkspaceApi.list).toHaveBeenCalledTimes(1)
  })

  it('5.2 after load, activeId defaults to first workspace id when localStorage has no value', async () => {
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
    expect(result.current.activeId).toBe(WS1.id)
  })

  it('5.3 after load, activeId stays on the stored id when that id is still valid', async () => {
    mockWorkspaceApi.list.mockResolvedValue([WS1, WS2])
    mockLocalStorage.setItem('activeWorkspaceId', JSON.stringify(WS2.id))

    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2))
    expect(result.current.activeId).toBe(WS2.id)
  })

  it('5.4 after load, activeId falls back to first workspace when the stored id is stale', async () => {
    mockLocalStorage.setItem('activeWorkspaceId', JSON.stringify('ws-stale'))

    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
    expect(result.current.activeId).toBe(WS1.id)
  })

  it('5.5 setActiveId(id) changes activeId immediately', async () => {
    mockWorkspaceApi.list.mockResolvedValue([WS1, WS2])
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2))

    act(() => {
      result.current.setActiveId(WS2.id)
    })

    expect(result.current.activeId).toBe(WS2.id)
  })

  it('5.6 createWorkspace(name) calls window.workspaceApi.create with a record that has a UUID id', async () => {
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))

    await act(async () => {
      await result.current.createWorkspace('New Space')
    })

    expect(mockWorkspaceApi.create).toHaveBeenCalledTimes(1)
    const record: WorkspaceRecord = mockWorkspaceApi.create.mock.calls[0][0]
    expect(record.id).toBe('uuid-new')
    expect(record.name).toBe('New Space')
  })

  it('5.7 createWorkspace adds the new workspace to the list and sets it as active', async () => {
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))

    await act(async () => {
      await result.current.createWorkspace('Gamma')
    })

    expect(result.current.workspaces).toHaveLength(2)
    expect(result.current.activeId).toBe('uuid-new')
  })

  it('5.8 createWorkspace is a no-op when workspaces.length >= 5', async () => {
    const fiveWs: WorkspaceRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ws-${i}`, name: `WS ${i}`, created_at: i,
    }))
    mockWorkspaceApi.list.mockResolvedValue(fiveWs)

    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(5))

    await act(async () => {
      await result.current.createWorkspace('Over Limit')
    })

    expect(mockWorkspaceApi.create).not.toHaveBeenCalled()
    expect(result.current.workspaces).toHaveLength(5)
  })

  it('5.9 createWorkspace trims the name; uses "Workspace" when the name is blank', async () => {
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))

    await act(async () => {
      await result.current.createWorkspace('   ')
    })

    const record: WorkspaceRecord = mockWorkspaceApi.create.mock.calls[0][0]
    expect(record.name).toBe('Workspace')
  })

  it('5.10 activeId is persisted in localStorage under key activeWorkspaceId', async () => {
    mockWorkspaceApi.list.mockResolvedValue([WS1, WS2])
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2))

    act(() => {
      result.current.setActiveId(WS2.id)
    })

    const stored = JSON.parse(mockLocalStorage.getItem('activeWorkspaceId') ?? 'null')
    expect(stored).toBe(WS2.id)
  })

  it('5.11 renameWorkspace calls window.workspaceApi.rename and updates local state', async () => {
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))

    await act(async () => {
      await result.current.renameWorkspace(WS1.id, 'Renamed')
    })

    expect(mockWorkspaceApi.rename).toHaveBeenCalledWith(WS1.id, 'Renamed')
    expect(result.current.workspaces[0].name).toBe('Renamed')
  })

  it('5.12 renameWorkspace is a no-op when the trimmed name is empty', async () => {
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))

    await act(async () => {
      await result.current.renameWorkspace(WS1.id, '   ')
    })

    expect(mockWorkspaceApi.rename).not.toHaveBeenCalled()
  })

  it('5.13 deleteWorkspace removes the workspace from state and switches active to first remaining', async () => {
    mockWorkspaceApi.list.mockResolvedValue([WS1, WS2])
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2))

    await act(async () => {
      await result.current.deleteWorkspace(WS1.id)
    })

    expect(mockWorkspaceApi.delete).toHaveBeenCalledWith(WS1.id)
    expect(result.current.workspaces).toHaveLength(1)
    expect(result.current.workspaces[0].id).toBe(WS2.id)
    expect(result.current.activeId).toBe(WS2.id)
  })

  it('5.14 duplicateWorkspace calls window.workspaceApi.duplicate, adds record to state, and sets active', async () => {
    const duplicated: WorkspaceRecord = { id: 'ws-dup', name: 'Main Copy', created_at: 9999 }
    mockWorkspaceApi.duplicate.mockResolvedValue(duplicated)

    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))

    await act(async () => {
      await result.current.duplicateWorkspace(WS1.id)
    })

    expect(mockWorkspaceApi.duplicate).toHaveBeenCalledWith(WS1.id)
    expect(result.current.workspaces).toHaveLength(2)
    expect(result.current.workspaces[1]).toEqual(duplicated)
    expect(result.current.activeId).toBe('ws-dup')
  })

  it('5.15 duplicateWorkspace is a no-op when workspaces.length >= 5', async () => {
    const fiveWs: WorkspaceRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ws-${i}`, name: `WS ${i}`, created_at: i,
    }))
    mockWorkspaceApi.list.mockResolvedValue(fiveWs)

    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(5))

    await act(async () => {
      await result.current.duplicateWorkspace('ws-0')
    })

    expect(mockWorkspaceApi.duplicate).not.toHaveBeenCalled()
  })
})
