import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalRecord } from '@shared/types/terminal'
import type { TerminalNodeData } from '../types'
import { terminalRepository } from './terminalRepository'

const mockDbApi = {
  listActive: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  reorderTerminals: vi.fn(),
  edgesList: vi.fn(),
  edgesUpsert: vi.fn(),
  edgesRemove: vi.fn(),
}

vi.stubGlobal('window', { dbApi: mockDbApi })

const record: TerminalRecord = {
  id: 'rec-1',
  title: 'My Terminal',
  cwd: '/home/user/project',
  command: 'claude',
  shell: 'bash',
  prompt: 'You are a code reviewer.',
  x: 10,
  y: 20,
  width: 800,
  height: 600,
  workspace_id: 'ws-1',
  enabled: true,
}

const node: TerminalNodeData = {
  id: 'rec-1',
  title: 'My Terminal',
  cwd: '/home/user/project',
  command: 'claude',
  shell: 'bash',
  prompt: 'You are a code reviewer.',
  x: 10,
  y: 20,
  width: 800,
  height: 600,
  workspace_id: 'ws-1',
  enabled: true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('terminalRepository.listActive', () => {
  it('calls window.dbApi.listActive and maps TerminalRecord → TerminalNodeData', async () => {
    mockDbApi.listActive.mockResolvedValue([record])

    const result = await terminalRepository.listActive('ws-1')

    expect(mockDbApi.listActive).toHaveBeenCalledWith('ws-1')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual<TerminalNodeData>({
      id: record.id,
      title: record.title,
      cwd: record.cwd,
      command: 'claude',
      shell: 'bash',
      prompt: record.prompt,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
      workspace_id: 'ws-1',
      enabled: true,
    })
  })

  it('maps a disabled (off) terminal record preserving enabled = false', async () => {
    mockDbApi.listActive.mockResolvedValue([{ ...record, enabled: false }])

    const [result] = await terminalRepository.listActive('ws-1')

    expect(result.enabled).toBe(false)
  })

  it('returns empty array when dbApi returns no rows', async () => {
    mockDbApi.listActive.mockResolvedValue([])

    const result = await terminalRepository.listActive('ws-1')

    expect(result).toEqual([])
  })

  it('maps multiple records preserving order', async () => {
    const second: TerminalRecord = { ...record, id: 'rec-2', title: 'Second', x: 100 }
    mockDbApi.listActive.mockResolvedValue([record, second])

    const result = await terminalRepository.listActive('ws-1')

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('rec-1')
    expect(result[1].id).toBe('rec-2')
    expect(result[1].x).toBe(100)
  })
})

describe('terminalRepository.persist', () => {
  it('maps TerminalNodeData → TerminalRecord and calls window.dbApi.upsert', () => {
    terminalRepository.persist(node)

    expect(mockDbApi.upsert).toHaveBeenCalledOnce()
    expect(mockDbApi.upsert).toHaveBeenCalledWith<[TerminalRecord]>({
      id: node.id,
      title: node.title,
      cwd: node.cwd,
      command: node.command,
      shell: node.shell,
      prompt: node.prompt,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      workspace_id: 'ws-1',
      enabled: true,
    })
  })
})

describe('terminalRepository.remove', () => {
  it('calls window.dbApi.remove with the given id', () => {
    terminalRepository.remove('rec-1')

    expect(mockDbApi.remove).toHaveBeenCalledOnce()
    expect(mockDbApi.remove).toHaveBeenCalledWith('rec-1')
  })
})

describe('terminalRepository.reorder', () => {
  it('calls window.dbApi.reorderTerminals with workspace id and ordered ids', () => {
    terminalRepository.reorder('ws-1', ['rec-2', 'rec-1'])

    expect(mockDbApi.reorderTerminals).toHaveBeenCalledOnce()
    expect(mockDbApi.reorderTerminals).toHaveBeenCalledWith('ws-1', ['rec-2', 'rec-1'])
  })
})
