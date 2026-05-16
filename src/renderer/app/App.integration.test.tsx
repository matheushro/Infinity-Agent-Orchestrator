import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor, within, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EdgeRecord, TerminalRecord } from '@shared/types/terminal'

const CANVAS_RECT = {
  left: 0,
  top: 0,
  width: 1280,
  height: 900,
  right: 1280,
  bottom: 900,
  x: 0,
  y: 0,
  toJSON() {
    return this
  },
}

const mocks = vi.hoisted(() => {
  const resizeObservers: Array<{
    callback: ResizeObserverCallback
    disconnect: ReturnType<typeof vi.fn>
    observe: ReturnType<typeof vi.fn>
    target: Element | null
    trigger: () => void
  }> = []

  class MockResizeObserver {
    target: Element | null = null

    disconnect = vi.fn()

    observe = vi.fn((target: Element) => {
      this.target = target
      this.callback(
        [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
        this as never,
      )
    })

    constructor(private readonly callback: ResizeObserverCallback) {
      resizeObservers.push(this as never)
    }

    trigger(): void {
      const target = this.target ?? document.body
      this.callback(
        [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
        this as never,
      )
    }
  }

  const terminalInstances: Array<{
    cols: number
    rows: number
    options: Record<string, unknown>
    open: ReturnType<typeof vi.fn>
    loadAddon: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    dataHandlers: Array<(data: string) => void>
  }> = []

  class MockTerminal {
    cols = 80

    rows = 24

    options: Record<string, unknown> = {}

    open = vi.fn()

    loadAddon = vi.fn()

    focus = vi.fn()

    write = vi.fn()

    dispose = vi.fn()

    dataHandlers: Array<(data: string) => void> = []

    onData = vi.fn((cb: (data: string) => void) => {
      this.dataHandlers.push(cb)
      return { dispose: vi.fn() }
    })

    constructor(options: Record<string, unknown>) {
      this.options = { ...options }
      terminalInstances.push(this)
    }
  }

  class MockFitAddon {
    fit = vi.fn()
  }

  const Rnd = vi.fn((props: any) => {
    return (
      <div
        data-testid="rnd"
        className={props.className}
        data-position-x={props.position.x}
        data-position-y={props.position.y}
        data-width={props.size.width}
        data-height={props.size.height}
        style={props.style}
        onMouseDown={props.onMouseDown}
        onContextMenu={props.onContextMenu}
      >
        <button
          type="button"
          data-testid="drag-start"
          onClick={() => props.onDragStart?.({}, { x: props.position.x, y: props.position.y })}
        >
          drag-start
        </button>
        <button
          type="button"
          data-testid="drag-move"
          onClick={() =>
            props.onDrag?.({}, { x: props.position.x + 42, y: props.position.y + 18 })
          }
        >
          drag-move
        </button>
        <button
          type="button"
          data-testid="drag-stop"
          onClick={() =>
            props.onDragStop?.({}, { x: props.position.x + 42, y: props.position.y + 18 })
          }
        >
          drag-stop
        </button>
        <button
          type="button"
          data-testid="resize-start"
          onClick={() =>
            props.onResizeStart?.(
              {},
              {},
              { offsetWidth: props.size.width, offsetHeight: props.size.height },
            )
          }
        >
          resize-start
        </button>
        <button
          type="button"
          data-testid="resize-move"
          onClick={() =>
            props.onResize?.(
              {},
              {},
              { offsetWidth: 360, offsetHeight: 240 },
              {},
              { x: props.position.x + 9, y: props.position.y + 11 },
            )
          }
        >
          resize-move
        </button>
        <button
          type="button"
          data-testid="resize-stop"
          onClick={() =>
            props.onResizeStop?.(
              {},
              {},
              { offsetWidth: 360, offsetHeight: 240 },
              {},
              { x: props.position.x + 9, y: props.position.y + 11 },
            )
          }
        >
          resize-stop
        </button>
        {props.children}
      </div>
    )
  })

  return {
    resizeObservers,
    terminalInstances,
    MockResizeObserver,
    MockTerminal,
    MockFitAddon,
    Rnd,
  }
})

vi.mock('react-rnd', () => ({
  Rnd: mocks.Rnd,
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: mocks.MockTerminal,
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: mocks.MockFitAddon,
}))

import App from './App'

let dbState: ReturnType<typeof createDbState>
let randomUuidCounter = 0

function makeTerminal(
  overrides: Partial<TerminalRecord> & Pick<TerminalRecord, 'id' | 'title' | 'cwd' | 'command'>,
): TerminalRecord {
  return {
    shell: 'default',
    x: 40,
    y: 50,
    width: 600,
    height: 380,
    ...overrides,
  }
}

function makeEdge(source: string, target: string, id = `${source}-${target}`): EdgeRecord {
  return { id, source, target }
}

function cloneTerminal(record: TerminalRecord): TerminalRecord {
  return { ...record }
}

function cloneEdge(record: EdgeRecord): EdgeRecord {
  return { ...record }
}

function upsertTerminal(list: TerminalRecord[], record: TerminalRecord): TerminalRecord[] {
  const index = list.findIndex((item) => item.id === record.id)
  if (index >= 0) {
    const next = list.slice()
    next[index] = { ...record }
    return next
  }
  return [...list, { ...record }]
}

function upsertEdge(list: EdgeRecord[], record: EdgeRecord): EdgeRecord[] {
  const index = list.findIndex((item) => item.id === record.id)
  if (index >= 0) {
    const next = list.slice()
    next[index] = { ...record }
    return next
  }
  return [...list, { ...record }]
}

function createDbState(initialTerminals: TerminalRecord[], initialEdges: EdgeRecord[]) {
  let terminals = initialTerminals.map(cloneTerminal)
  let edges = initialEdges.map(cloneEdge)

  const dbApi = {
    listActive: vi.fn(async () => terminals.map(cloneTerminal)),
    upsert: vi.fn(async (record: TerminalRecord) => {
      terminals = upsertTerminal(terminals, record)
    }),
    remove: vi.fn(async (id: string) => {
      terminals = terminals.filter((item) => item.id !== id)
      edges = edges.filter((edge) => edge.source !== id && edge.target !== id)
    }),
    listEdges: vi.fn(async () => edges.map(cloneEdge)),
    upsertEdge: vi.fn(async (record: EdgeRecord) => {
      edges = upsertEdge(edges, record)
    }),
    removeEdge: vi.fn(async (id: string) => {
      edges = edges.filter((item) => item.id !== id)
    }),
  }

  return {
    dbApi,
    getTerminals: () => terminals.map(cloneTerminal),
    getEdges: () => edges.map(cloneEdge),
  }
}

function createPtyApi() {
  return {
    create: vi.fn(async () => ({ ptyId: 'mock-pty' })),
    input: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(() => vi.fn()),
    onExit: vi.fn(() => vi.fn()),
  }
}

function setupWindowMocks(initialTerminals: TerminalRecord[], initialEdges: EdgeRecord[]) {
  dbState = createDbState(initialTerminals, initialEdges)
  const ptyApi = createPtyApi()
  const dialogApi = {
    selectFolder: vi.fn(async () => '/tmp/workspace'),
  }

  Object.assign(window, {
    dbApi: dbState.dbApi,
    ptyApi,
    dialogApi,
  })

  return { dbApi: dbState.dbApi, ptyApi, dialogApi }
}

function renderApp(): ReturnType<typeof render> {
  return render(<App />)
}

function getRndNode(index: number): HTMLElement {
  const nodes = screen.getAllByTestId('rnd')
  const match = nodes[index]
  if (!(match instanceof HTMLElement)) {
    throw new Error(`terminal node not found at index ${index}`)
  }
  return match
}

function getEdgeHit(edgeId: string): Element {
  const el = document.querySelector(`[data-edge-id="${edgeId}"] .edge-hit`)
  if (!(el instanceof Element)) {
    throw new Error(`edge hit not found: ${edgeId}`)
  }
  return el
}

function getStyleModalPanel(): HTMLElement {
  const closeButton = screen.getByLabelText('Close')
  const panel = closeButton.parentElement?.parentElement
  if (!(panel instanceof HTMLElement)) {
    throw new Error('style modal panel not found')
  }
  return panel
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.documentElement.className = ''
  randomUuidCounter = 0
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `uuid-${++randomUuidCounter}`)
  vi.stubGlobal('ResizeObserver', mocks.MockResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => CANVAS_RECT)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App integration', () => {
  it('creates a terminal end-to-end, mounts a pty, and persists the DB row', async () => {
    const { dbApi, ptyApi, dialogApi } = setupWindowMocks([], [])

    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /New terminal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Select…' }))

    await waitFor(() =>
      expect(screen.getByPlaceholderText('No folder selected')).toHaveValue('/tmp/workspace'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    await waitFor(() => expect(within(getRndNode(0)).getByText('Claude Code · workspace')).toBeTruthy())

    expect(dialogApi.selectFolder).toHaveBeenCalledOnce()
    expect(dbApi.upsert).toHaveBeenCalledTimes(1)
    expect(dbApi.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Claude Code · workspace',
        cwd: '/tmp/workspace',
        command: 'claude',
        shell: 'default',
      }),
    )

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(1))
    expect(ptyApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: expect.stringMatching(/^term-/),
        cwd: '/tmp/workspace',
        command: 'claude',
      }),
    )
  })

  it('drags a node without persisting during move, then persists on drop', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [
        makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' }),
        makeTerminal({ id: 'node-b', title: 'Beta', cwd: '/tmp/b', command: 'codex', x: 220, y: 90 }),
      ],
      [],
    )

    renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(2))
    dbApi.upsert.mockClear()

    const alpha = getRndNode(0)
    fireEvent.click(within(alpha).getByTestId('drag-start'))
    fireEvent.click(within(alpha).getByTestId('drag-move'))

    const movedAlpha = getRndNode(0)
    expect(Number(movedAlpha.getAttribute('data-position-x'))).toBeGreaterThan(40)
    expect(Number(movedAlpha.getAttribute('data-position-y'))).toBeGreaterThan(50)
    expect(dbApi.upsert).not.toHaveBeenCalled()

    fireEvent.click(within(getRndNode(0)).getByTestId('drag-stop'))

    expect(dbApi.upsert).toHaveBeenCalledTimes(1)
    expect(dbApi.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-a',
        x: Number(movedAlpha.getAttribute('data-position-x')),
        y: Number(movedAlpha.getAttribute('data-position-y')),
      }),
    )
  })

  it('resizes a node, syncs the pty size, and persists on resize stop', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [
        makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' }),
        makeTerminal({ id: 'node-b', title: 'Beta', cwd: '/tmp/b', command: 'codex', x: 220, y: 90 }),
      ],
      [],
    )

    renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(2))
    dbApi.upsert.mockClear()
    ptyApi.resize.mockClear()

    fireEvent.click(within(getRndNode(0)).getByTestId('resize-start'))
    fireEvent.click(within(getRndNode(0)).getByTestId('resize-move'))

    expect(getRndNode(0)).toHaveAttribute('data-width', '360')
    expect(getRndNode(0)).toHaveAttribute('data-height', '240')
    expect(dbApi.upsert).not.toHaveBeenCalled()

    fireEvent.click(within(getRndNode(0)).getByTestId('resize-stop'))

    expect(dbApi.upsert).toHaveBeenCalledTimes(1)
    expect(dbApi.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-a',
        width: 360,
        height: 240,
      }),
    )

    act(() => {
      for (const observer of mocks.resizeObservers) observer.trigger()
    })

    await waitFor(() => expect(ptyApi.resize).toHaveBeenCalled())
  })

  it('moves all selected nodes together during a multi-select drag', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [
        makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' }),
        makeTerminal({ id: 'node-b', title: 'Beta', cwd: '/tmp/b', command: 'codex', x: 220, y: 90 }),
        makeTerminal({ id: 'node-c', title: 'Gamma', cwd: '/tmp/c', command: 'claude', x: 480, y: 120 }),
      ],
      [],
    )

    renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(3))
    dbApi.upsert.mockClear()

    const alpha = getRndNode(0)
    const beta = getRndNode(1)

    fireEvent.mouseDown(alpha, { button: 0 })
    fireEvent.mouseDown(beta, { button: 0, shiftKey: true })

    fireEvent.click(within(alpha).getByTestId('drag-start'))
    fireEvent.click(within(alpha).getByTestId('drag-move'))
    fireEvent.click(within(alpha).getByTestId('drag-stop'))

    expect(Number(getRndNode(0).getAttribute('data-position-x'))).toBeGreaterThan(40)
    expect(Number(getRndNode(1).getAttribute('data-position-x'))).toBeGreaterThan(220)
    expect(dbApi.upsert).toHaveBeenCalledTimes(2)
  })

  it('renames a terminal inline and persists the title', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' })],
      [],
    )

    renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(1))
    dbApi.upsert.mockClear()

    const alpha = getRndNode(0)
    fireEvent.doubleClick(within(alpha).getByText('Alpha'))

    const input = within(getRndNode(0)).getByDisplayValue('Alpha')
    fireEvent.change(input, { target: { value: 'Alpha Prime' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(within(getRndNode(0)).getByText('Alpha Prime')).toBeTruthy())
    expect(dbApi.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-a',
        title: 'Alpha Prime',
      }),
    )
  })

  it('links two terminals and persists the edge', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [
        makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' }),
        makeTerminal({ id: 'node-b', title: 'Beta', cwd: '/tmp/b', command: 'codex', x: 220, y: 90 }),
      ],
      [],
    )

    renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(2))
    dbApi.upsertEdge.mockClear()

    fireEvent.contextMenu(getRndNode(0), {
      button: 2,
      clientX: 160,
      clientY: 180,
    })

    fireEvent.click(screen.getByText('Link to another terminal'))
    fireEvent.mouseDown(getRndNode(1), { button: 0 })

    await waitFor(() => expect(dbApi.upsertEdge).toHaveBeenCalledTimes(1))
    expect(dbState.getEdges()).toHaveLength(1)
    const edgeId = dbState.getEdges()[0].id
    expect(dbApi.upsertEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        id: edgeId,
        source: 'node-a',
        target: 'node-b',
      }),
    )
    expect(document.querySelector(`[data-edge-id="${edgeId}"]`)).toBeTruthy()
  })

  it('deletes a selected edge', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [
        makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' }),
        makeTerminal({ id: 'node-b', title: 'Beta', cwd: '/tmp/b', command: 'codex', x: 220, y: 90 }),
      ],
      [makeEdge('node-a', 'node-b', 'edge-ab')],
    )

    renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(2))

    fireEvent.mouseDown(getEdgeHit('edge-ab'))
    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => expect(dbApi.removeEdge).toHaveBeenCalledWith('edge-ab'))
    expect(document.querySelector('[data-edge-id="edge-ab"]')).toBeNull()
  })

  it('deleting a node cascades edges out of the canvas and database mock', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [
        makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' }),
        makeTerminal({ id: 'node-b', title: 'Beta', cwd: '/tmp/b', command: 'codex', x: 220, y: 90 }),
      ],
      [makeEdge('node-a', 'node-b', 'edge-ab')],
    )

    renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(2))

    fireEvent.mouseDown(getRndNode(1), { button: 0 })
    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => expect(dbApi.remove).toHaveBeenCalledWith('node-b'))
    await waitFor(() => expect(document.querySelector('[data-edge-id="edge-ab"]')).toBeNull())
    expect(dbState.getEdges()).toEqual([])
  })

  it('deleting a node also removes its style entry from localStorage', async () => {
    localStorage.setItem(
      'terminalStyles',
      JSON.stringify({
        'node-a': { fontSize: 18 },
        'node-b': { theme: 'light' },
      }),
    )

    const { dbApi, ptyApi } = setupWindowMocks(
      [
        makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' }),
        makeTerminal({ id: 'node-b', title: 'Beta', cwd: '/tmp/b', command: 'codex', x: 220, y: 90 }),
      ],
      [],
    )

    renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(2))

    fireEvent.mouseDown(getRndNode(1), { button: 0 })
    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => expect(dbApi.remove).toHaveBeenCalledWith('node-b'))
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('terminalStyles')!)).toEqual({
        'node-a': { fontSize: 18 },
      }),
    )
  })

  it('rehydrates terminals and edges after a reload', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [
        makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' }),
        makeTerminal({ id: 'node-b', title: 'Beta', cwd: '/tmp/b', command: 'codex', x: 220, y: 90 }),
      ],
      [makeEdge('node-a', 'node-b', 'edge-ab')],
    )

    const view = renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(dbApi.listActive).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(dbApi.listEdges).toHaveBeenCalledTimes(1))
    expect(getRndNode(0)).toBeTruthy()
    expect(getEdgeHit('edge-ab')).toBeTruthy()

    view.unmount()
    renderApp()

    await waitFor(() => expect(dbApi.listActive).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(dbApi.listEdges).toHaveBeenCalledTimes(2))
    expect(getRndNode(0)).toBeTruthy()
    expect(document.querySelector('[data-edge-id="edge-ab"]')).toBeTruthy()
  })

  it('persists theme across a reload', async () => {
    setupWindowMocks(
      [makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' })],
      [],
    )

    const view = renderApp()

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))

    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'))
    expect(localStorage.getItem('canvasTheme')).toBe(JSON.stringify('light'))

    view.unmount()
    renderApp()

    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'))
    expect(localStorage.getItem('canvasTheme')).toBe(JSON.stringify('light'))
  })

  it('persists sidebar collapse across a reload', async () => {
    const { dbApi } = setupWindowMocks(
      [makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' })],
      [],
    )

    const view = renderApp()
    await waitFor(() => expect(dbApi.listActive).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByTitle('Collapse sidebar'))
    expect(localStorage.getItem('sidebarCollapsed')).toBe(JSON.stringify(true))

    view.unmount()
    renderApp()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy())
  })

  it('persists terminal styles across a reload', async () => {
    const { dbApi, ptyApi } = setupWindowMocks(
      [makeTerminal({ id: 'node-a', title: 'Alpha', cwd: '/tmp/a', command: 'claude' })],
      [],
    )

    const view = renderApp()

    await waitFor(() => expect(ptyApi.create).toHaveBeenCalledTimes(1))
    dbApi.upsert.mockClear()

    fireEvent.contextMenu(getRndNode(0), {
      button: 2,
      clientX: 160,
      clientY: 180,
    })
    fireEvent.click(screen.getByText('Customize style…'))

    const modalPanel = getStyleModalPanel()
    fireEvent.click(within(modalPanel).getByRole('button', { name: 'Light' }))
    fireEvent.change(within(modalPanel).getByRole('slider'), { target: { value: '18' } })
    fireEvent.click(within(modalPanel).getByRole('button', { name: 'Done' }))

    expect(localStorage.getItem('terminalStyles')).toContain('"theme":"light"')
    expect(localStorage.getItem('terminalStyles')).toContain('"fontSize":18')

    view.unmount()
    renderApp()

    await waitFor(() => expect(getRndNode(0)).toBeTruthy())

    fireEvent.contextMenu(getRndNode(0), {
      button: 2,
      clientX: 200,
      clientY: 220,
    })
    fireEvent.click(screen.getByText('Customize style…'))

    const reopened = getStyleModalPanel()
    expect(within(reopened).getByRole('button', { name: 'Light' })).toHaveStyle({ background: 'var(--bg)' })
    expect(within(reopened).getByRole('slider')).toHaveValue('18')
  })
})
