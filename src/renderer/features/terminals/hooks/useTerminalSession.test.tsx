import { cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTerminalSession } from './useTerminalSession'
import type { TerminalNodeData, TerminalStyle } from '../types'

const mocks = vi.hoisted(() => {
  const terminalInstances: any[] = []
  const fitInstances: any[] = []
  const resizeObserverInstances: any[] = []
  const createResolvers: Array<() => void> = []
  const dataHandlers: Array<(id: string, data: string) => void> = []
  const exitHandlers: Array<(id: string) => void> = []

  class MockTerminal {
    options: Record<string, unknown>
    cols = 132
    rows = 43
    open = vi.fn()
    focus = vi.fn()
    loadAddon = vi.fn()
    write = vi.fn()
    dispose = vi.fn()
    private readonly dataSubscriptions = new Set<(data: string) => void>()

    constructor(options: Record<string, unknown>) {
      this.options = options
      terminalInstances.push(this)
    }

    onData = vi.fn((handler: (data: string) => void) => {
      this.dataSubscriptions.add(handler)
      return {
        dispose: vi.fn(() => {
          this.dataSubscriptions.delete(handler)
        }),
      }
    })

    emitData(data: string): void {
      for (const handler of this.dataSubscriptions) handler(data)
    }
  }

  class MockFitAddon {
    fit = vi.fn()

    constructor() {
      fitInstances.push(this)
    }
  }

  class MockResizeObserver {
    observe = vi.fn()
    disconnect = vi.fn()

    constructor(private readonly callback: () => void) {
      resizeObserverInstances.push(this)
    }

    trigger(): void {
      this.callback()
    }
  }

  const ptyApi = {
    create: vi.fn(() => new Promise<void>((resolve) => createResolvers.push(resolve))),
    input: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((handler: (id: string, data: string) => void) => {
      dataHandlers.push(handler)
      return () => {
        const index = dataHandlers.indexOf(handler)
        if (index >= 0) dataHandlers.splice(index, 1)
      }
    }),
    onExit: vi.fn((handler: (id: string) => void) => {
      exitHandlers.push(handler)
      return () => {
        const index = exitHandlers.indexOf(handler)
        if (index >= 0) exitHandlers.splice(index, 1)
      }
    }),
    emitData(id: string, data: string): void {
      for (const handler of [...dataHandlers]) handler(id, data)
    },
    emitExit(id: string): void {
      for (const handler of [...exitHandlers]) handler(id)
    },
  }

  return {
    terminalInstances,
    fitInstances,
    resizeObserverInstances,
    createResolvers,
    dataHandlers,
    exitHandlers,
    ptyApi,
    MockTerminal,
    MockFitAddon,
    MockResizeObserver,
  }
})

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function (this: unknown, options: Record<string, unknown>) {
    return new mocks.MockTerminal(options)
  }),
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function () {
    return new mocks.MockFitAddon()
  }),
}))

const node: TerminalNodeData = {
  id: 'node-1',
  x: 20,
  y: 24,
  width: 640,
  height: 360,
  shell: 'default',
  title: 'Claude Code · repo',
  cwd: '/home/user/repo',
  command: 'claude',
}

const initialStyle: TerminalStyle = {
  theme: 'dark',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: 15,
}

function SessionHarness({
  currentNode = node,
  style = initialStyle,
}: {
  currentNode?: TerminalNodeData
  style?: TerminalStyle
}): JSX.Element {
  const ref = useTerminalSession(currentNode, style)

  return <div ref={ref} data-testid="terminal-container" />
}

function resolveCreate(index = 0): void {
  const resolve = mocks.createResolvers[index]
  if (!resolve) throw new Error(`missing create resolver at index ${index}`)
  resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.terminalInstances.length = 0
  mocks.fitInstances.length = 0
  mocks.resizeObserverInstances.length = 0
  mocks.createResolvers.length = 0
  mocks.dataHandlers.length = 0
  mocks.exitHandlers.length = 0
  Object.assign(mocks.ptyApi, {
    input: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    create: vi.fn(() => new Promise<void>((resolve) => mocks.createResolvers.push(resolve))),
  })
  vi.stubGlobal('ResizeObserver', mocks.MockResizeObserver)
  Object.assign(window, { ptyApi: mocks.ptyApi })
  vi.spyOn(crypto, 'randomUUID')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useTerminalSession', () => {
  it('creates Terminal with style options, FitAddon, and the expected pty payload', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-1')

    render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    expect(mocks.terminalInstances).toHaveLength(1)
    expect(mocks.fitInstances).toHaveLength(1)

    const terminal = mocks.terminalInstances[0]
    const fit = mocks.fitInstances[0]

    expect(terminal.options).toMatchObject({
      cursorBlink: true,
      fontSize: initialStyle.fontSize,
      fontFamily: initialStyle.fontFamily,
      theme: {
        background: '#0b1120',
        foreground: '#e2e8f0',
      },
    })
    expect(terminal.loadAddon).toHaveBeenCalledWith(fit)
    expect(terminal.open).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    expect(fit.fit).toHaveBeenCalledTimes(1)
    expect(mocks.ptyApi.create).toHaveBeenCalledWith({
      id: 'pty-1',
      nodeId: node.id,
      shell: undefined,
      cols: terminal.cols,
      rows: terminal.rows,
      cwd: node.cwd,
      command: 'claude',
    })
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
    expect(node.id).not.toBe('pty-1')
  })

  it('focuses after pty create resolves, unless the hook is already disposed', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-focus')

    const { unmount } = render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    resolveCreate()
    await waitFor(() => expect(mocks.terminalInstances[0].focus).toHaveBeenCalledTimes(1))

    unmount()
  })

  it('does not focus if the component was disposed before create resolves', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-disposed')

    const { unmount } = render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
    unmount()
    resolveCreate()

    await Promise.resolve()
    expect(mocks.terminalInstances[0].focus).not.toHaveBeenCalled()
  })

  it('repasses term input and filters main-process data by ptyId', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-input')

    render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    const terminal = mocks.terminalInstances[0]
    terminal.emitData('hello world')
    expect(mocks.ptyApi.input).toHaveBeenCalledWith('pty-input', 'hello world')

    mocks.ptyApi.emitData('other-pty', 'ignored')
    expect(terminal.write).not.toHaveBeenCalled()

    mocks.ptyApi.emitData('pty-input', 'from-pty')
    expect(terminal.write).toHaveBeenCalledWith('from-pty')
  })

  it('writes the process-exited marker in red for the matching ptyId only', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-exit')

    render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    const terminal = mocks.terminalInstances[0]
    mocks.ptyApi.emitExit('other-pty')
    expect(terminal.write).not.toHaveBeenCalled()

    mocks.ptyApi.emitExit('pty-exit')
    expect(terminal.write).toHaveBeenCalledWith('\r\n\x1b[31m[process exited]\x1b[0m\r\n')
  })

  it('fits and resizes again when the container is observed', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-resize')

    render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    const terminal = mocks.terminalInstances[0]
    const fit = mocks.fitInstances[0]
    const observer = mocks.resizeObserverInstances[0]
    const fitCallsBefore = fit.fit.mock.calls.length

    observer.trigger()

    expect(fit.fit).toHaveBeenCalledTimes(fitCallsBefore + 1)
    expect(mocks.ptyApi.resize).toHaveBeenCalledWith('pty-resize', terminal.cols, terminal.rows)
  })

  it('cleans up the observer, terminal, and pty session on unmount', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-cleanup')

    const { unmount } = render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
    const terminal = mocks.terminalInstances[0]
    const observer = mocks.resizeObserverInstances[0]

    unmount()

    expect(observer.disconnect).toHaveBeenCalledTimes(1)
    expect(terminal.dispose).toHaveBeenCalledTimes(1)
    expect(mocks.ptyApi.kill).toHaveBeenCalledWith('pty-cleanup')
  })

  it('keeps style updates in term.options without recreating the pty', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-style')

    const { rerender } = render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    const terminal = mocks.terminalInstances[0]
    const nextStyle: TerminalStyle = {
      theme: 'light',
      fontFamily: '"Fira Code", ui-monospace, monospace',
      fontSize: 18,
    }

    rerender(<SessionHarness style={nextStyle} />)

    await waitFor(() =>
      expect(terminal.options).toMatchObject({
        fontFamily: nextStyle.fontFamily,
        fontSize: nextStyle.fontSize,
        theme: {
          background: '#f7f7f5',
          foreground: '#1f2430',
        },
      }),
    )
    expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1)
    expect(mocks.terminalInstances).toHaveLength(1)
  })

  it('keeps the first mount cleanup from polluting a second mount', async () => {
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce('pty-first')
      .mockReturnValueOnce('pty-second')

    const first = render(<SessionHarness />)
    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
    first.unmount()

    const second = render(<SessionHarness />)
    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(2))

    const secondTerminal = mocks.terminalInstances[1]
    mocks.ptyApi.emitExit('pty-first')
    expect(secondTerminal.write).not.toHaveBeenCalled()

    mocks.ptyApi.emitExit('pty-second')
    expect(secondTerminal.write).toHaveBeenCalledWith('\r\n\x1b[31m[process exited]\x1b[0m\r\n')

    second.unmount()
  })

  it('StrictMode double-mount does not print [process exited] on the remounted terminal', async () => {
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce('pty-first')
      .mockReturnValueOnce('pty-second')

    render(
      <StrictMode>
        <SessionHarness />
      </StrictMode>,
    )

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(2))

    const remountedTerminal = mocks.terminalInstances[1]

    mocks.ptyApi.emitExit('pty-first')
    expect(remountedTerminal.write).not.toHaveBeenCalled()

    mocks.ptyApi.emitExit('pty-second')
    expect(remountedTerminal.write).toHaveBeenCalledWith('\r\n\x1b[31m[process exited]\x1b[0m\r\n')
  })
})
