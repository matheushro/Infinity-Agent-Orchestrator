import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import glob from 'glob'

const exposed = vi.hoisted(() => new Map<string, unknown>())

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, api: unknown) => {
      exposed.set(name, api)
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

import './index'
import { contextBridge } from 'electron'

describe('preload/index', () => {
  it('exposes ptyApi via contextBridge', () => {
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('ptyApi', expect.any(Object))
  })

  it('exposes dbApi via contextBridge', () => {
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('dbApi', expect.any(Object))
  })

  it('exposes dialogApi via contextBridge', () => {
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('dialogApi', expect.any(Object))
  })

  it('does not expose ipcRenderer directly', () => {
    expect(exposed.has('ipcRenderer')).toBe(false)
  })

  it('exposed ptyApi has the expected method shapes', () => {
    const api = exposed.get('ptyApi') as Record<string, unknown>
    expect(typeof api.create).toBe('function')
    expect(typeof api.input).toBe('function')
    expect(typeof api.resize).toBe('function')
    expect(typeof api.kill).toBe('function')
    expect(typeof api.onData).toBe('function')
    expect(typeof api.onExit).toBe('function')
  })

  it('exposed dbApi has the expected method shapes', () => {
    const api = exposed.get('dbApi') as Record<string, unknown>
    expect(typeof api.listActive).toBe('function')
    expect(typeof api.upsert).toBe('function')
    expect(typeof api.remove).toBe('function')
    expect(typeof api.reorderTerminals).toBe('function')
    expect(typeof api.listEdges).toBe('function')
    expect(typeof api.upsertEdge).toBe('function')
    expect(typeof api.removeEdge).toBe('function')
  })

  it('exposed dialogApi has the expected method shapes', () => {
    const api = exposed.get('dialogApi') as Record<string, unknown>
    expect(typeof api.selectFolder).toBe('function')
  })
})

describe('preload — import boundaries', () => {
  const preloadFiles = glob.sync('src/preload/**/*.ts', { ignore: ['**/*.test.ts'] })

  it('no preload file imports from @renderer or @main', () => {
    const violations: string[] = []
    for (const file of preloadFiles) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      if (/@renderer|@main/.test(src)) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })
})
