import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalNodeData } from '../types'

// --- boundary mocks ---

const { mockTerminalRepository, mockCreateTerminalId } = vi.hoisted(() => ({
  mockTerminalRepository: { listActive: vi.fn(), persist: vi.fn(), remove: vi.fn() },
  mockCreateTerminalId: vi.fn(),
}))

vi.mock('../services/terminalRepository', () => ({
  terminalRepository: mockTerminalRepository,
}))

vi.mock('@renderer/lib/id', () => ({
  createTerminalId: mockCreateTerminalId,
}))

import { createTerminalId } from '@renderer/lib/id'
import { useTerminals } from './useTerminals'

// Assign to the existing jsdom window — do NOT replace it with vi.stubGlobal.
const mockPtyApi = { kill: vi.fn() }

// ---

const baseNode: TerminalNodeData = {
  id: 'term-1',
  x: 40,
  y: 40,
  width: 600,
  height: 380,
  shell: 'bash',
  title: 'Claude Code · project',
  cwd: '/home/user/project',
  command: 'claude',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTerminalRepository.listActive.mockResolvedValue([])
  vi.mocked(createTerminalId).mockReturnValue('term-1')
  Object.assign(window, { ptyApi: mockPtyApi })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTerminals — initial state', () => {
  it('starts with an empty nodes array', async () => {
    const { result } = renderHook(() => useTerminals())

    expect(result.current.nodes).toEqual([])

    // flush the mount effect so cleanup doesn't see a pending state update
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())
  })
})

describe('useTerminals — listActive rehydration', () => {
  it('populates nodes from terminalRepository.listActive on mount', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])

    const { result } = renderHook(() => useTerminals())

    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    expect(mockTerminalRepository.listActive).toHaveBeenCalledOnce()
    expect(result.current.nodes[0]).toEqual(baseNode)
  })
})

describe('useTerminals — createTerminal', () => {
  it('adds a node to state with a unique id', async () => {
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].id).toBe('term-1')
  })

  it('persists via terminalRepository.persist', async () => {
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(mockTerminalRepository.persist).toHaveBeenCalledOnce()
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'term-1', cwd: '/home/user/project', command: 'claude' })
    )
  })

  it('auto-generates title from command label + folderName when name is empty', async () => {
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(result.current.nodes[0].title).toBe('Claude Code · project')
  })

  it('uses the provided name when non-empty', async () => {
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', 'My Terminal', 'bash')
    })

    expect(result.current.nodes[0].title).toBe('My Terminal')
  })

  it('uses provided position when given', async () => {
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash', { x: 100, y: 200 })
    })

    expect(result.current.nodes[0].x).toBe(100)
    expect(result.current.nodes[0].y).toBe(200)
  })

  it('uses cascade positioning when no position is given', async () => {
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    // First node: 0 prev nodes → x = 40 + (0 * 30) % 300 = 40
    expect(result.current.nodes[0].x).toBe(40)
    expect(result.current.nodes[0].y).toBe(40)
  })

  it('derives folderName as the last path segment', async () => {
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/a/b/my-repo', 'codex', '', 'zsh')
    })

    expect(result.current.nodes[0].title).toBe('Codex · my-repo')
  })

  it('StrictMode safety: createTerminalId and persist called once per invocation', async () => {
    // React StrictMode runs the setNodes updater twice; id generation and persist
    // must live outside the updater so they execute exactly once.
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(createTerminalId).toHaveBeenCalledTimes(1)
    expect(mockTerminalRepository.persist).toHaveBeenCalledTimes(1)
  })
})

describe('useTerminals — moveNode', () => {
  it('updates node in state without calling terminalRepository.persist', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    act(() => {
      result.current.moveNode('term-1', { x: 999, y: 888 })
    })

    expect(result.current.nodes[0].x).toBe(999)
    expect(result.current.nodes[0].y).toBe(888)
    expect(mockTerminalRepository.persist).not.toHaveBeenCalled()
  })
})

describe('useTerminals — updateNode', () => {
  it('updates state and persists via terminalRepository.persist', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    act(() => {
      result.current.updateNode('term-1', { title: 'Renamed' })
    })

    expect(result.current.nodes[0].title).toBe('Renamed')
    expect(mockTerminalRepository.persist).toHaveBeenCalledOnce()
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'term-1', title: 'Renamed' })
    )
  })
})

describe('useTerminals — removeNode', () => {
  it('kills the pty, removes from DB, and removes from state', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])
    const { result } = renderHook(() => useTerminals())
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    act(() => {
      result.current.removeNode('term-1')
    })

    expect(mockPtyApi.kill).toHaveBeenCalledWith('term-1')
    expect(mockTerminalRepository.remove).toHaveBeenCalledWith('term-1')
    expect(result.current.nodes).toHaveLength(0)
  })
})
