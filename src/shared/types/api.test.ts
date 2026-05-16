import { describe, it, expect, vi } from 'vitest'
import type { PtyApi, DbApi, DialogApi } from './api'
import type { TerminalRecord, EdgeRecord } from './terminal'
import type { PtyCreateArgs, PtyCreateResult } from './ipc'

/**
 * Tests that the window.ptyApi / window.dbApi / window.dialogApi contracts
 * defined in api.ts match what the preload's contextBridge actually exposes.
 *
 * Strategy: construct mock objects that satisfy each interface and verify their
 * method signatures match expectations. TypeScript compilation of this file
 * already enforces structural compatibility; the runtime assertions confirm the
 * method names and arities survive.
 */

describe('PtyApi — contrato de window.ptyApi', () => {
  const mockPtyApi: PtyApi = {
    create: vi.fn().mockResolvedValue({ id: 'pty-1', shell: '/bin/bash' } satisfies PtyCreateResult),
    input: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn().mockReturnValue(() => {}),
    onExit: vi.fn().mockReturnValue(() => {})
  }

  it('expõe create(args): Promise<PtyCreateResult>', async () => {
    const args: PtyCreateArgs = { id: 'pty-1', cols: 80, rows: 24 }
    const result = await mockPtyApi.create(args)
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('shell')
  })

  it('expõe input(id, data): void', () => {
    expect(() => mockPtyApi.input('pty-1', 'ls\r')).not.toThrow()
    expect(mockPtyApi.input).toHaveBeenCalledWith('pty-1', 'ls\r')
  })

  it('expõe resize(id, cols, rows): void', () => {
    expect(() => mockPtyApi.resize('pty-1', 120, 40)).not.toThrow()
    expect(mockPtyApi.resize).toHaveBeenCalledWith('pty-1', 120, 40)
  })

  it('expõe kill(id): void', () => {
    expect(() => mockPtyApi.kill('pty-1')).not.toThrow()
    expect(mockPtyApi.kill).toHaveBeenCalledWith('pty-1')
  })

  it('onData retorna função de unsubscribe', () => {
    const cb = vi.fn()
    const unsub = mockPtyApi.onData(cb)
    expect(typeof unsub).toBe('function')
  })

  it('onExit retorna função de unsubscribe', () => {
    const cb = vi.fn()
    const unsub = mockPtyApi.onExit(cb)
    expect(typeof unsub).toBe('function')
  })

  it('PtyApi tem exatamente 6 métodos (create, input, resize, kill, onData, onExit)', () => {
    const methods = Object.keys(mockPtyApi)
    expect(methods.sort()).toEqual(['create', 'input', 'kill', 'onData', 'onExit', 'resize'])
  })
})

describe('DbApi — contrato de window.dbApi', () => {
  const mockRecord: TerminalRecord = {
    id: 'n1', title: 'T', cwd: '/tmp', command: '', shell: 'bash',
    x: 0, y: 0, width: 800, height: 600
  }
  const mockEdge: EdgeRecord = { id: 'e1', source: 'n1', target: 'n2' }

  const mockDbApi: DbApi = {
    listActive: vi.fn().mockResolvedValue([mockRecord]),
    upsert: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    listEdges: vi.fn().mockResolvedValue([mockEdge]),
    upsertEdge: vi.fn().mockResolvedValue(undefined),
    removeEdge: vi.fn().mockResolvedValue(undefined)
  }

  it('listActive(): Promise<TerminalRecord[]>', async () => {
    const result = await mockDbApi.listActive()
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]).toHaveProperty('id')
  })

  it('upsert(record): Promise<void>', async () => {
    await expect(mockDbApi.upsert(mockRecord)).resolves.toBeUndefined()
  })

  it('remove(id): Promise<void>', async () => {
    await expect(mockDbApi.remove('n1')).resolves.toBeUndefined()
  })

  it('listEdges(): Promise<EdgeRecord[]>', async () => {
    const result = await mockDbApi.listEdges()
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]).toHaveProperty('source')
    expect(result[0]).toHaveProperty('target')
  })

  it('upsertEdge(record): Promise<void>', async () => {
    await expect(mockDbApi.upsertEdge(mockEdge)).resolves.toBeUndefined()
  })

  it('removeEdge(id): Promise<void>', async () => {
    await expect(mockDbApi.removeEdge('e1')).resolves.toBeUndefined()
  })

  it('DbApi tem exatamente 6 métodos (listActive, upsert, remove, listEdges, upsertEdge, removeEdge)', () => {
    const methods = Object.keys(mockDbApi)
    expect(methods.sort()).toEqual(['listActive', 'listEdges', 'remove', 'removeEdge', 'upsert', 'upsertEdge'])
  })
})

describe('DialogApi — contrato de window.dialogApi', () => {
  const mockDialogApi: DialogApi = {
    selectFolder: vi.fn().mockResolvedValue('/home/user/project')
  }

  it('selectFolder(): Promise<string | null>', async () => {
    const result = await mockDialogApi.selectFolder()
    expect(typeof result === 'string' || result === null).toBe(true)
  })

  it('selectFolder pode retornar null (usuário cancelou)', async () => {
    const cancelApi: DialogApi = { selectFolder: vi.fn().mockResolvedValue(null) }
    const result = await cancelApi.selectFolder()
    expect(result).toBeNull()
  })

  it('DialogApi tem exatamente 1 método (selectFolder)', () => {
    const methods = Object.keys(mockDialogApi)
    expect(methods).toEqual(['selectFolder'])
  })
})

describe('Contratos api.ts casam com implementação do preload', () => {
  it('ptyApi do preload implementa todos os métodos de PtyApi', async () => {
    // Mock electron before importing preload
    vi.doMock('electron', () => ({
      ipcRenderer: {
        invoke: vi.fn().mockResolvedValue({ id: 'x', shell: '/bin/sh' }),
        send: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn()
      }
    }))
    const { ptyApi } = await import('@main/../preload/api/pty.api')
    const apiKeys: PtyApi = ptyApi
    expect(typeof apiKeys.create).toBe('function')
    expect(typeof apiKeys.input).toBe('function')
    expect(typeof apiKeys.resize).toBe('function')
    expect(typeof apiKeys.kill).toBe('function')
    expect(typeof apiKeys.onData).toBe('function')
    expect(typeof apiKeys.onExit).toBe('function')
    vi.doUnmock('electron')
  })

  it('dbApi do preload implementa todos os métodos de DbApi', async () => {
    vi.doMock('electron', () => ({
      ipcRenderer: {
        invoke: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn()
      }
    }))
    const { dbApi } = await import('@main/../preload/api/db.api')
    const apiKeys: DbApi = dbApi
    expect(typeof apiKeys.listActive).toBe('function')
    expect(typeof apiKeys.upsert).toBe('function')
    expect(typeof apiKeys.remove).toBe('function')
    expect(typeof apiKeys.listEdges).toBe('function')
    expect(typeof apiKeys.upsertEdge).toBe('function')
    expect(typeof apiKeys.removeEdge).toBe('function')
    vi.doUnmock('electron')
  })

  it('dialogApi do preload implementa todos os métodos de DialogApi', async () => {
    vi.doMock('electron', () => ({
      ipcRenderer: {
        invoke: vi.fn().mockResolvedValue(null),
        send: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn()
      }
    }))
    const { dialogApi } = await import('@main/../preload/api/dialog.api')
    const apiKeys: DialogApi = dialogApi
    expect(typeof apiKeys.selectFolder).toBe('function')
    vi.doUnmock('electron')
  })
})
