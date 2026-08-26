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
  prompt: '',
  model: '',
  effort: '',
  workspace_id: 'ws-1',
  enabled: true,
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
    const { result } = renderHook(() => useTerminals('ws-1'))

    expect(result.current.nodes).toEqual([])

    // flush the mount effect so cleanup doesn't see a pending state update
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())
  })
})

describe('useTerminals — listActive rehydration', () => {
  it('populates nodes from terminalRepository.listActive on mount', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])

    const { result } = renderHook(() => useTerminals('ws-1'))

    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    expect(mockTerminalRepository.listActive).toHaveBeenCalledOnce()
    expect(result.current.nodes[0]).toEqual(baseNode)
  })
})

describe('useTerminals — createTerminal', () => {
  it('adds a node to state with a unique id', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].id).toBe('term-1')
  })

  it('persists via terminalRepository.persist', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(mockTerminalRepository.persist).toHaveBeenCalledOnce()
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'term-1', cwd: '/home/user/project', command: 'claude' })
    )
  })

  it('defaults a new terminal prompt to an empty string', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(result.current.nodes[0].prompt).toBe('')
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: '' }),
    )
  })

  it('defaults a new terminal model to an empty string (agent default)', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(result.current.nodes[0].model).toBe('')
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ model: '' }),
    )
  })

  it('defaults a new terminal effort to an empty string (agent default)', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(result.current.nodes[0].effort).toBe('')
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ effort: '' }),
    )
  })

  it('stamps the prompt, model and effort chosen in the create dialog on the new node', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash', undefined, {
        prompt: 'You are a reviewer.',
        model: 'opus',
        effort: 'max',
      })
    })

    // They must be on the node before its first render: the pty is created from
    // node.prompt/node.model/node.effort, so a later update would launch the
    // agent bare.
    expect(result.current.nodes[0].prompt).toBe('You are a reviewer.')
    expect(result.current.nodes[0].model).toBe('opus')
    expect(result.current.nodes[0].effort).toBe('max')
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'You are a reviewer.', model: 'opus', effort: 'max' }),
    )
  })

  it('auto-generates title from command label + folderName when name is empty', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(result.current.nodes[0].title).toBe('Claude Code · project')
  })

  it('uses the Copilot label and command when copilot is selected', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'copilot', '', 'bash')
    })

    expect(result.current.nodes[0].title).toBe('GitHub Copilot · project')
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'copilot' })
    )
  })

  it('uses the Gemini label and command when gemini is selected', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'gemini', '', 'bash')
    })

    expect(result.current.nodes[0].title).toBe('Gemini · project')
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'gemini' })
    )
  })

  it('uses the provided name when non-empty', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', 'My Terminal', 'bash')
    })

    expect(result.current.nodes[0].title).toBe('My Terminal')
  })

  it('uses provided position when given', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash', { x: 100, y: 200 })
    })

    expect(result.current.nodes[0].x).toBe(100)
    expect(result.current.nodes[0].y).toBe(200)
  })

  it('uses provided width/height (drag-to-create) and defaults otherwise', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash', {
        x: 100,
        y: 200,
        width: 320,
        height: 240,
      })
    })

    expect(result.current.nodes[0].width).toBe(320)
    expect(result.current.nodes[0].height).toBe(240)
  })

  it('falls back to default width/height when position has no size', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash', { x: 1, y: 2 })
    })

    expect(result.current.nodes[0].width).toBe(600)
    expect(result.current.nodes[0].height).toBe(380)
  })

  it('uses cascade positioning when no position is given', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    // First node: 0 prev nodes → x = 40 + (0 * 30) % 300 = 40
    expect(result.current.nodes[0].x).toBe(40)
    expect(result.current.nodes[0].y).toBe(40)
  })

  it('derives folderName as the last path segment', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/a/b/my-repo', 'codex', '', 'zsh')
    })

    expect(result.current.nodes[0].title).toBe('Codex · my-repo')
  })

  it('StrictMode safety: createTerminalId and persist called once per invocation', async () => {
    // React StrictMode runs the setNodes updater twice; id generation and persist
    // must live outside the updater so they execute exactly once.
    const { result } = renderHook(() => useTerminals('ws-1'))
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
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    act(() => {
      result.current.moveNode('term-1', { x: 999, y: 888 })
    })

    expect(result.current.nodes[0].x).toBe(999)
    expect(result.current.nodes[0].y).toBe(888)
    expect(mockTerminalRepository.persist).not.toHaveBeenCalled()
  })
})

describe('useTerminals — duplicateTerminal', () => {
  it('copies the terminal beside the source with a new id and title', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])
    vi.mocked(createTerminalId).mockReturnValue('term-copy')
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    let duplicateId: string | null = null
    act(() => {
      duplicateId = result.current.duplicateTerminal('term-1')
    })

    expect(duplicateId).toBe('term-copy')
    expect(result.current.nodes[1]).toEqual({
      ...baseNode,
      id: 'term-copy',
      x: baseNode.x + baseNode.width + 24,
      title: 'Claude Code · project - Copy',
    })
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(result.current.nodes[1])
  })

  it('does nothing when the source terminal does not exist', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    let duplicateId: string | null = 'unexpected'
    act(() => {
      duplicateId = result.current.duplicateTerminal('missing')
    })

    expect(duplicateId).toBeNull()
    expect(createTerminalId).not.toHaveBeenCalled()
    expect(mockTerminalRepository.persist).not.toHaveBeenCalled()
  })
})

describe('useTerminals — updateNode', () => {
  it('updates state and persists via terminalRepository.persist', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])
    const { result } = renderHook(() => useTerminals('ws-1'))
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

describe('useTerminals — enabled (turn on/off)', () => {
  it('createTerminal stamps new terminals as enabled = true', async () => {
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/home/user/project', 'claude', '', 'bash')
    })

    expect(result.current.nodes[0].enabled).toBe(true)
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })

  it('setNodeEnabled flips state and persists the new power state', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    act(() => {
      result.current.setNodeEnabled('term-1', false)
    })

    expect(result.current.nodes[0].enabled).toBe(false)
    expect(mockTerminalRepository.persist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'term-1', enabled: false }),
    )
  })

  it('setNodeEnabled is a no-op (no persist) when the state is unchanged', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    act(() => {
      result.current.setNodeEnabled('term-1', true)
    })

    expect(mockTerminalRepository.persist).not.toHaveBeenCalled()
  })
})

describe('useTerminals — removeNode', () => {
  it('kills the pty, removes from DB, and removes from state', async () => {
    mockTerminalRepository.listActive.mockResolvedValue([baseNode])
    const { result } = renderHook(() => useTerminals('ws-1'))
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    act(() => {
      result.current.removeNode('term-1')
    })

    expect(mockPtyApi.kill).toHaveBeenCalledWith('term-1')
    expect(mockTerminalRepository.remove).toHaveBeenCalledWith('term-1')
    expect(result.current.nodes).toHaveLength(0)
  })
})

describe('useTerminals — workspace scoping (8.1-8.4)', () => {
  it('8.1 on mount calls terminalRepository.listActive with the provided workspaceId', async () => {
    const { result } = renderHook(() => useTerminals('ws-abc'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())
    expect(mockTerminalRepository.listActive).toHaveBeenCalledWith('ws-abc')
    expect(result.current.nodes).toEqual([])
  })

  it('8.2 nodes returned by listActive are scoped to the given workspaceId', async () => {
    const node1 = { ...baseNode, id: 'n1', workspace_id: 'ws-scope' }
    const node2 = { ...baseNode, id: 'n2', workspace_id: 'ws-scope' }
    mockTerminalRepository.listActive.mockResolvedValue([node1, node2])

    const { result } = renderHook(() => useTerminals('ws-scope'))
    await waitFor(() => expect(result.current.nodes).toHaveLength(2))

    expect(result.current.nodes.every((n) => n.workspace_id === 'ws-scope')).toBe(true)
  })

  it('8.3 createTerminal stamps the new node with the hook\'s workspaceId', async () => {
    const { result } = renderHook(() => useTerminals('ws-stamp'))
    await waitFor(() => expect(mockTerminalRepository.listActive).toHaveBeenCalled())

    act(() => {
      result.current.createTerminal('/projects/x', 'claude', '', 'bash')
    })

    expect(result.current.nodes[0].workspace_id).toBe('ws-stamp')
  })

  it('8.4 two useTerminals instances with different workspace ids have independent node lists', async () => {
    const nodeA = { ...baseNode, id: 'na', workspace_id: 'ws-a' }
    const nodeB = { ...baseNode, id: 'nb', workspace_id: 'ws-b' }
    mockTerminalRepository.listActive
      .mockResolvedValueOnce([nodeA])
      .mockResolvedValueOnce([nodeB])

    const { result: resA } = renderHook(() => useTerminals('ws-a'))
    const { result: resB } = renderHook(() => useTerminals('ws-b'))

    await waitFor(() => expect(resA.current.nodes).toHaveLength(1))
    await waitFor(() => expect(resB.current.nodes).toHaveLength(1))

    expect(resA.current.nodes[0].id).toBe('na')
    expect(resB.current.nodes[0].id).toBe('nb')
  })
})
