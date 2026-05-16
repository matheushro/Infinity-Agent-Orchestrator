import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./pty.ipc', () => ({ registerPtyIpc: vi.fn() }))
vi.mock('./db.ipc', () => ({ registerDbIpc: vi.fn() }))
vi.mock('./dialog.ipc', () => ({ registerDialogIpc: vi.fn() }))

import { registerIpcHandlers } from './index'
import { registerPtyIpc } from './pty.ipc'
import { registerDbIpc } from './db.ipc'
import { registerDialogIpc } from './dialog.ipc'

describe('ipc/index', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers all IPC domains: pty, db, dialog', () => {
    registerIpcHandlers()
    expect(registerPtyIpc).toHaveBeenCalledOnce()
    expect(registerDbIpc).toHaveBeenCalledOnce()
    expect(registerDialogIpc).toHaveBeenCalledOnce()
  })
})
