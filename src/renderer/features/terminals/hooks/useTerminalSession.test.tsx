import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTerminalSession } from './useTerminalSession'
import type { TerminalNodeData, TerminalStyle } from '../types'
import { PtyActivityProvider, usePtyActivity } from '@renderer/features/workspaces/context/PtyActivityContext'

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
    _core = {
      _mouseService: {
        getCoords: vi.fn(
          (
            event: { clientX: number; clientY: number },
            _element: HTMLElement,
            _colCount: number,
            _rowCount: number,
            _isSelection?: boolean,
          ) => [event.clientX, event.clientY] as [number, number],
        ),
        getMouseReportCoords: vi.fn((event: MouseEvent, _element: HTMLElement) => ({
          col: 0,
          row: 0,
          x: event.clientX,
          y: event.clientY,
        })),
      },
    }
    open = vi.fn()
    focus = vi.fn()
    loadAddon = vi.fn()
    write = vi.fn()
    dispose = vi.fn()
    refresh = vi.fn()
    keyEventHandler: ((e: KeyboardEvent) => boolean) | null = null
    attachCustomKeyEventHandler = vi.fn((handler: (e: KeyboardEvent) => boolean) => {
      this.keyEventHandler = handler
    })
    getSelection = vi.fn(() => '')
    clearSelection = vi.fn()
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
    getPathForFile: vi.fn(),
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
  enabled: true,
}

const initialStyle: TerminalStyle = {
  theme: 'dark',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: 15,
}

function SessionHarness({
  currentNode = node,
  style = initialStyle,
  scale = 1,
  restartSignal = 0,
  enabled = true,
}: {
  currentNode?: TerminalNodeData
  style?: TerminalStyle
  scale?: number
  restartSignal?: number
  enabled?: boolean
}): JSX.Element {
  const ref = useTerminalSession(currentNode, style, 'dark', scale, restartSignal, enabled)

  return <div ref={ref} data-testid="terminal-container" />
}

function StatusDisplay({ nodeId }: { nodeId: string }): JSX.Element {
  const { getStatus } = usePtyActivity()
  return <span data-testid="pty-status">{getStatus(nodeId)}</span>
}

function SessionWithStatus({
  currentNode = node,
  style = initialStyle,
  scale = 1,
}: {
  currentNode?: TerminalNodeData
  style?: TerminalStyle
  scale?: number
}): JSX.Element {
  const ref = useTerminalSession(currentNode, style, 'dark', scale)
  return (
    <>
      <div ref={ref} data-testid="terminal-container" />
      <StatusDisplay nodeId={currentNode.id} />
    </>
  )
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
    getPathForFile: vi.fn((file: File) => `/tmp/${file.name}`),
    create: vi.fn(() => new Promise<void>((resolve) => mocks.createResolvers.push(resolve))),
  })
  vi.stubGlobal('ResizeObserver', mocks.MockResizeObserver)
  Object.assign(window, { ptyApi: mocks.ptyApi })
  vi.spyOn(crypto, 'randomUUID')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
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

  // Regression: deleting a terminal threw inside the effect cleanup (xterm
  // teardown), which unmounted the entire React tree — the whole app went
  // white on a simple node delete.
  it('unmount does not propagate xterm dispose errors (white-screen regression)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
    const terminal = mocks.terminalInstances[0]
    terminal.dispose.mockImplementation(() => {
      throw new Error('renderer teardown failed')
    })

    expect(() => unmount()).not.toThrow()
    expect(mocks.ptyApi.kill).toHaveBeenCalledTimes(1)
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

  describe('copy/paste shortcuts', () => {
    function keydown(overrides: Partial<KeyboardEvent>): KeyboardEvent {
      return {
        type: 'keydown',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        code: '',
        preventDefault: vi.fn(),
        ...overrides,
      } as unknown as KeyboardEvent
    }

    it('pastes once and prevents the browser default on Ctrl+Shift+V', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-paste')
      const readText = vi.fn().mockResolvedValue('clipboard text')
      vi.stubGlobal('navigator', { clipboard: { readText, writeText: vi.fn() } })

      render(<SessionHarness />)
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

      const terminal = mocks.terminalInstances[0]
      const event = keydown({ ctrlKey: true, shiftKey: true, code: 'KeyV' })

      const result = terminal.keyEventHandler(event)

      // Returns false (xterm skips it) AND prevents the native paste that would
      // otherwise duplicate the input via xterm's textarea paste handler.
      expect(result).toBe(false)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)

      await waitFor(() =>
        expect(mocks.ptyApi.input).toHaveBeenCalledWith('pty-paste', 'clipboard text'),
      )
      expect(mocks.ptyApi.input).toHaveBeenCalledTimes(1)
    })

    it('copies the selection and prevents the default on Ctrl+Shift+C', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-copy')
      const writeText = vi.fn()
      vi.stubGlobal('navigator', { clipboard: { writeText, readText: vi.fn() } })

      render(<SessionHarness />)
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

      const terminal = mocks.terminalInstances[0]
      terminal.getSelection.mockReturnValue('selected text')
      const event = keydown({ ctrlKey: true, shiftKey: true, code: 'KeyC' })

      const result = terminal.keyEventHandler(event)

      expect(result).toBe(false)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith('selected text')
    })

    it('copies on Ctrl+C only when text is selected, otherwise passes SIGINT through', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-ctrlc')
      const writeText = vi.fn()
      vi.stubGlobal('navigator', { clipboard: { writeText, readText: vi.fn() } })

      render(<SessionHarness />)
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

      const terminal = mocks.terminalInstances[0]

      // No selection: Ctrl+C must reach the pty as SIGINT (handler returns true).
      terminal.getSelection.mockReturnValue('')
      const sigint = keydown({ ctrlKey: true, code: 'KeyC' })
      expect(terminal.keyEventHandler(sigint)).toBe(true)
      expect(sigint.preventDefault).not.toHaveBeenCalled()

      // Selection present: copy and swallow the key.
      terminal.getSelection.mockReturnValue('grab me')
      const copy = keydown({ ctrlKey: true, code: 'KeyC' })
      expect(terminal.keyEventHandler(copy)).toBe(false)
      expect(copy.preventDefault).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith('grab me')
      expect(terminal.clearSelection).toHaveBeenCalledTimes(1)
    })
  })

  it('sends dropped image file paths to the pty like pasted terminal text', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-drop')
    mocks.ptyApi.getPathForFile.mockReturnValue('/Users/me/Desktop/Screen Shot 2026-05-25.png')

    render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    const file = new File(['image'], 'Screen Shot 2026-05-25.png', { type: 'image/png' })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [file] },
    })

    screen.getByTestId('terminal-container').dispatchEvent(drop)

    expect(drop.defaultPrevented).toBe(true)
    expect(mocks.ptyApi.getPathForFile).toHaveBeenCalledWith(file)
    expect(mocks.ptyApi.input).toHaveBeenCalledWith(
      'pty-drop',
      "'/Users/me/Desktop/Screen Shot 2026-05-25.png'",
    )
  })

  it('allows file drops when dragover only exposes file items', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-dragover')

    render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    const dragover = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dragover, 'dataTransfer', {
      value: {
        files: [],
        items: [{ kind: 'file' }],
        types: [],
      },
    })

    screen.getByTestId('terminal-container').dispatchEvent(dragover)

    expect(dragover.defaultPrevented).toBe(true)
  })

  it('keeps non-file drops available for the browser/xterm default behavior', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-non-file-drop')

    render(<SessionHarness />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [] },
    })

    screen.getByTestId('terminal-container').dispatchEvent(drop)

    expect(drop.defaultPrevented).toBe(false)
    expect(mocks.ptyApi.input).not.toHaveBeenCalled()
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

  it('rebuilds the session (kills old pty, creates a fresh one) when restartSignal changes', async () => {
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce('pty-restart-1')
      .mockReturnValueOnce('pty-restart-2')

    const { rerender } = render(<SessionHarness restartSignal={0} />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    rerender(<SessionHarness restartSignal={1} />)

    expect(mocks.ptyApi.kill).toHaveBeenCalledWith('pty-restart-1')
    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(2))
    expect(mocks.terminalInstances).toHaveLength(2)
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
    expect(terminal.refresh).toHaveBeenCalledWith(0, terminal.rows)
    expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1)
    expect(mocks.terminalInstances).toHaveLength(1)
  })

  it('unscales xterm mouse coordinates so selection matches the visual row at any canvas zoom', async () => {
    vi.mocked(crypto.randomUUID).mockReturnValue('pty-mouse')

    const { rerender, unmount } = render(<SessionHarness scale={0.5} />)

    await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

    const terminal = mocks.terminalInstances[0]
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 200,
      height: 120,
      right: 300,
      bottom: 170,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    })

    expect(
      terminal._core._mouseService.getCoords(
        { clientX: 140, clientY: 80 },
        element,
        100,
        30,
        true,
      ),
    ).toEqual([180, 110])
    expect(
      terminal._core._mouseService.getMouseReportCoords(
        { clientX: 140, clientY: 80 } as MouseEvent,
        element,
      ),
    ).toMatchObject({ x: 180, y: 110 })

    rerender(<SessionHarness scale={2} />)

    expect(
      terminal._core._mouseService.getCoords(
        { clientX: 140, clientY: 80 },
        element,
        100,
        30,
        true,
      ),
    ).toEqual([120, 65])

    unmount()

    expect(
      terminal._core._mouseService.getCoords(
        { clientX: 140, clientY: 80 },
        element,
        100,
        30,
        true,
      ),
    ).toEqual([140, 80])
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

  describe('enabled / turn off', () => {
    it('does not create an xterm or pty when the terminal is off', async () => {
      render(<SessionHarness enabled={false} />)

      // Give any (incorrect) async create a chance to fire.
      await Promise.resolve()
      await Promise.resolve()

      expect(mocks.terminalInstances).toHaveLength(0)
      expect(mocks.ptyApi.create).not.toHaveBeenCalled()
    })

    it('spins up the session when the terminal is turned on', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-on')

      const { rerender } = render(<SessionHarness enabled={false} />)
      expect(mocks.ptyApi.create).not.toHaveBeenCalled()

      rerender(<SessionHarness enabled={true} />)

      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
      expect(mocks.terminalInstances).toHaveLength(1)
    })

    it('tears down the pty when the terminal is turned off', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-off')

      const { rerender } = render(<SessionHarness enabled={true} />)
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))

      rerender(<SessionHarness enabled={false} />)

      expect(mocks.ptyApi.kill).toHaveBeenCalledWith('pty-off')
    })
  })

  describe('PTY status transitions', () => {
    it('status is offline before create resolves', async () => {
      render(
        <PtyActivityProvider>
          <SessionWithStatus />
        </PtyActivityProvider>,
      )
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
      expect(screen.getByTestId('pty-status').textContent).toBe('offline')
    })

    it('status becomes idle after create resolves', async () => {
      render(
        <PtyActivityProvider>
          <SessionWithStatus />
        </PtyActivityProvider>,
      )
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
      resolveCreate()
      await waitFor(() =>
        expect(screen.getByTestId('pty-status').textContent).toBe('idle'),
      )
    })

    it('status becomes busy when pty data arrives', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-busy')
      render(
        <PtyActivityProvider>
          <SessionWithStatus />
        </PtyActivityProvider>,
      )
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
      resolveCreate()
      await waitFor(() => expect(screen.getByTestId('pty-status').textContent).toBe('idle'))

      mocks.ptyApi.emitData('pty-busy', 'some output')
      await waitFor(() =>
        expect(screen.getByTestId('pty-status').textContent).toBe('busy'),
      )
    })

    it('status returns to idle after data silence (debounce)', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-debounce')
      render(
        <PtyActivityProvider>
          <SessionWithStatus />
        </PtyActivityProvider>,
      )
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
      resolveCreate()
      await waitFor(() => expect(screen.getByTestId('pty-status').textContent).toBe('idle'))

      // Switch to fake timers only for the debounce portion to avoid waitFor deadlock.
      vi.useFakeTimers()

      mocks.ptyApi.emitData('pty-debounce', 'output')
      await act(async () => {})
      expect(screen.getByTestId('pty-status').textContent).toBe('busy')

      await act(async () => { vi.advanceTimersByTime(1500) })
      expect(screen.getByTestId('pty-status').textContent).toBe('idle')
    })

    it('status becomes offline on pty exit', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-exit-status')
      render(
        <PtyActivityProvider>
          <SessionWithStatus />
        </PtyActivityProvider>,
      )
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
      resolveCreate()
      await waitFor(() => expect(screen.getByTestId('pty-status').textContent).toBe('idle'))

      mocks.ptyApi.emitExit('pty-exit-status')
      await waitFor(() =>
        expect(screen.getByTestId('pty-status').textContent).toBe('offline'),
      )
    })

    it('status becomes offline on unmount', async () => {
      vi.mocked(crypto.randomUUID).mockReturnValue('pty-unmount-status')
      const { unmount } = render(
        <PtyActivityProvider>
          <SessionWithStatus />
        </PtyActivityProvider>,
      )
      await waitFor(() => expect(mocks.ptyApi.create).toHaveBeenCalledTimes(1))
      resolveCreate()
      await waitFor(() => expect(screen.getByTestId('pty-status').textContent).toBe('idle'))

      unmount()
      // After unmount the DOM is gone; just verify kill was called (offline transition happened).
      expect(mocks.ptyApi.kill).toHaveBeenCalledWith('pty-unmount-status')
    })
  })
})
