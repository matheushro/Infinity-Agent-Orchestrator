import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}))

import { openFolderInVSCode } from './window.service'

describe('window.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens VS Code with the provided folder', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void }
    child.unref = vi.fn()
    spawnMock.mockReturnValue(child)

    const result = openFolderInVSCode('/home/user/project')
    child.emit('spawn')

    await expect(result).resolves.toBe(true)
    expect(spawnMock).toHaveBeenCalledWith('code', ['/home/user/project'], {
      detached: true,
      stdio: 'ignore',
    })
    expect(child.unref).toHaveBeenCalledTimes(1)
  })

  it('returns false for a blank folder', async () => {
    await expect(openFolderInVSCode('   ')).resolves.toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('returns false when VS Code cannot be spawned', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void }
    child.unref = vi.fn()
    spawnMock.mockReturnValue(child)

    const result = openFolderInVSCode('/missing')
    child.emit('error', new Error('code not found'))

    await expect(result).resolves.toBe(false)
    expect(child.unref).not.toHaveBeenCalled()
  })
})
