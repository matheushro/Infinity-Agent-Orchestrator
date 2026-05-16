import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIpc = vi.hoisted(() => ({
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcRenderer: mockIpc,
}))

import { ptyApi } from './pty.api'
import { IpcChannels } from '@shared/types/ipc'

describe('pty.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('create invokes pty:create with args', () => {
    const args = { id: 'p1', cols: 80, rows: 24 }
    ptyApi.create(args as any)
    expect(mockIpc.invoke).toHaveBeenCalledWith(IpcChannels.ptyCreate, args)
  })

  it('input sends pty:input with id and data', () => {
    ptyApi.input('p1', 'hello')
    expect(mockIpc.send).toHaveBeenCalledWith(IpcChannels.ptyInput, { id: 'p1', data: 'hello' })
  })

  it('resize sends pty:resize with id, cols, rows', () => {
    ptyApi.resize('p1', 120, 40)
    expect(mockIpc.send).toHaveBeenCalledWith(IpcChannels.ptyResize, { id: 'p1', cols: 120, rows: 40 })
  })

  it('kill sends pty:kill with id', () => {
    ptyApi.kill('p1')
    expect(mockIpc.send).toHaveBeenCalledWith(IpcChannels.ptyKill, { id: 'p1' })
  })

  it('onData registers listener on pty:data and callback receives id/data', () => {
    const cb = vi.fn()
    ptyApi.onData(cb)

    expect(mockIpc.on).toHaveBeenCalledWith(IpcChannels.ptyData, expect.any(Function))
    const listener = mockIpc.on.mock.calls[0][1]
    listener({}, { id: 'p1', data: 'chunk' })
    expect(cb).toHaveBeenCalledWith('p1', 'chunk')
  })

  it('onData returns unsubscriber that removes the exact listener', () => {
    const unsub = ptyApi.onData(vi.fn())
    const listener = mockIpc.on.mock.calls[0][1]
    unsub()
    expect(mockIpc.removeListener).toHaveBeenCalledWith(IpcChannels.ptyData, listener)
  })

  it('onExit registers listener on pty:exit and callback receives id', () => {
    const cb = vi.fn()
    ptyApi.onExit(cb)

    expect(mockIpc.on).toHaveBeenCalledWith(IpcChannels.ptyExit, expect.any(Function))
    const listener = mockIpc.on.mock.calls[0][1]
    listener({}, { id: 'p2' })
    expect(cb).toHaveBeenCalledWith('p2')
  })

  it('onExit returns unsubscriber that removes the exact listener', () => {
    const unsub = ptyApi.onExit(vi.fn())
    const listener = mockIpc.on.mock.calls[0][1]
    unsub()
    expect(mockIpc.removeListener).toHaveBeenCalledWith(IpcChannels.ptyExit, listener)
  })
})
