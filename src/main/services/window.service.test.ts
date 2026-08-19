import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}))

import { openFolderInVSCode } from './window.service'

type FakeChild = EventEmitter & { unref: () => void }

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.unref = vi.fn()
  return child
}

/** Child that resolves on its own, so sequential fallbacks can be exercised. */
function makeAutoChild(outcome: 'spawn' | 'error'): FakeChild {
  const child = makeChild()
  queueMicrotask(() => {
    if (outcome === 'error') child.emit('error', new Error('ENOENT'))
    else child.emit('spawn')
  })
  return child
}

const realPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

describe('window.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPlatform('linux')
  })

  afterEach(() => {
    setPlatform(realPlatform)
  })

  it('opens VS Code with the provided folder', async () => {
    const child = makeChild()
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
    const child = makeChild()
    spawnMock.mockReturnValue(child)

    const result = openFolderInVSCode('/missing')
    child.emit('error', new Error('code not found'))

    await expect(result).resolves.toBe(false)
    expect(child.unref).not.toHaveBeenCalled()
  })

  it('does not try fallbacks outside macOS', async () => {
    spawnMock.mockImplementation(() => makeAutoChild('error'))

    await expect(openFolderInVSCode('/home/user/project')).resolves.toBe(false)
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the absolute code path on macOS when PATH lacks `code`', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation((command: string) =>
      makeAutoChild(command === '/usr/local/bin/code' ? 'spawn' : 'error'),
    )

    await expect(openFolderInVSCode('/Users/me/project')).resolves.toBe(true)
    expect(spawnMock).toHaveBeenNthCalledWith(1, 'code', ['/Users/me/project'], {
      detached: true,
      stdio: 'ignore',
    })
    expect(spawnMock).toHaveBeenNthCalledWith(2, '/usr/local/bin/code', ['/Users/me/project'], {
      detached: true,
      stdio: 'ignore',
    })
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to `open -a` on macOS when no code binary exists', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation((command: string) =>
      makeAutoChild(command === 'open' ? 'spawn' : 'error'),
    )

    await expect(openFolderInVSCode('/Users/me/project')).resolves.toBe(true)
    expect(spawnMock).toHaveBeenLastCalledWith(
      'open',
      ['-a', 'Visual Studio Code', '/Users/me/project'],
      { detached: true, stdio: 'ignore' },
    )
  })

  it('returns false on macOS when every candidate fails', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation(() => makeAutoChild('error'))

    await expect(openFolderInVSCode('/Users/me/project')).resolves.toBe(false)
    expect(spawnMock).toHaveBeenCalledTimes(6)
  })
})
