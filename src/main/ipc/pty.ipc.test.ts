import { describe, it, expect, vi, beforeEach } from 'vitest'

const ipcHandlers = vi.hoisted(() => ({
  handle: new Map<string, (...args: any[]) => any>(),
  on: new Map<string, (...args: any[]) => any>(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => {
      ipcHandlers.handle.set(channel, fn)
    }),
    on: vi.fn((channel: string, fn: (...args: any[]) => any) => {
      ipcHandlers.on.set(channel, fn)
    }),
  },
}))

vi.mock('../services/pty.service', () => ({
  createPty: vi.fn(),
  writeToPty: vi.fn(),
  resizePty: vi.fn(),
  killPty: vi.fn(),
}))

import { registerPtyIpc } from './pty.ipc'
import * as ptyService from '../services/pty.service'
import { IpcChannels } from '@shared/types/ipc'

describe('pty.ipc', () => {
  beforeEach(() => {
    ipcHandlers.handle.clear()
    ipcHandlers.on.clear()
    vi.clearAllMocks()
    registerPtyIpc()
  })

  it('registers handlers on centralized IpcChannels strings', () => {
    expect(ipcHandlers.handle.has(IpcChannels.ptyCreate)).toBe(true)
    expect(ipcHandlers.on.has(IpcChannels.ptyInput)).toBe(true)
    expect(ipcHandlers.on.has(IpcChannels.ptyResize)).toBe(true)
    expect(ipcHandlers.on.has(IpcChannels.ptyKill)).toBe(true)
  })

  describe('pty create handler', () => {
    function makeEvent(destroyed = false) {
      return { sender: { isDestroyed: vi.fn(() => destroyed), send: vi.fn() } }
    }

    it('invokes ptyService.createPty with args and callbacks', () => {
      const event = makeEvent()
      const args = { id: 'p1', cols: 80, rows: 24 }
      ipcHandlers.handle.get(IpcChannels.ptyCreate)!(event, args)
      expect(ptyService.createPty).toHaveBeenCalledWith(args, {
        onData: expect.any(Function),
        onExit: expect.any(Function),
      })
    })

    it('onData callback sends pty:data to BrowserWindow', () => {
      const event = makeEvent()
      ipcHandlers.handle.get(IpcChannels.ptyCreate)!(event, { id: 'p1', cols: 80, rows: 24 })
      const { onData } = (ptyService.createPty as ReturnType<typeof vi.fn>).mock.calls[0][1]
      onData({ id: 'p1', data: 'hello' })
      expect(event.sender.send).toHaveBeenCalledWith(IpcChannels.ptyData, { id: 'p1', data: 'hello' })
    })

    it('onExit callback sends pty:exit to BrowserWindow', () => {
      const event = makeEvent()
      ipcHandlers.handle.get(IpcChannels.ptyCreate)!(event, { id: 'p1', cols: 80, rows: 24 })
      const { onExit } = (ptyService.createPty as ReturnType<typeof vi.fn>).mock.calls[0][1]
      onExit({ id: 'p1' })
      expect(event.sender.send).toHaveBeenCalledWith(IpcChannels.ptyExit, { id: 'p1' })
    })

    it('does not send to a destroyed webContents', () => {
      const event = makeEvent(true)
      ipcHandlers.handle.get(IpcChannels.ptyCreate)!(event, { id: 'p1', cols: 80, rows: 24 })
      const { onData } = (ptyService.createPty as ReturnType<typeof vi.fn>).mock.calls[0][1]
      onData({ id: 'p1', data: 'hello' })
      expect(event.sender.send).not.toHaveBeenCalled()
    })
  })

  it('pty:input calls writeToPty(id, data)', () => {
    ipcHandlers.on.get(IpcChannels.ptyInput)!({}, { id: 'abc', data: 'ls\r' })
    expect(ptyService.writeToPty).toHaveBeenCalledWith('abc', 'ls\r')
  })

  it('pty:resize calls resizePty(id, cols, rows)', () => {
    ipcHandlers.on.get(IpcChannels.ptyResize)!({}, { id: 'abc', cols: 120, rows: 40 })
    expect(ptyService.resizePty).toHaveBeenCalledWith('abc', 120, 40)
  })

  it('pty:kill calls killPty(id)', () => {
    ipcHandlers.on.get(IpcChannels.ptyKill)!({}, { id: 'abc' })
    expect(ptyService.killPty).toHaveBeenCalledWith('abc')
  })
})
