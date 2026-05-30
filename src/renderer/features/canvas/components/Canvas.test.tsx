import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { EdgeRecord } from '@shared/types/terminal'
import type { TerminalNodeData, TerminalStyle } from '@renderer/features/terminals/types'
import type { CanvasTool } from './Canvas'

const CANVAS_RECT = {
  left: 100,
  top: 50,
  width: 400,
  height: 300,
  right: 500,
  bottom: 350,
  x: 100,
  y: 50,
  toJSON() {
    return this
  },
}

const ZERO_RECT = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  right: 0,
  bottom: 0,
  x: 0,
  y: 0,
  toJSON() {
    return this
  },
}

const mocks = vi.hoisted(() => {
  const resizeObservers: MockResizeObserver[] = []

  class MockResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {
      resizeObservers.push(this)
    }

    observe = vi.fn(() => {
      this.emit()
    })

    disconnect = vi.fn()

    emit(): void {
      this.callback([{ target: document.body, contentRect: {} as DOMRectReadOnly }], this)
    }
  }

  function MockTerminalNode({
    node,
    onDragStart,
    onMoveNode,
    onUpdateNode,
  }: {
    node: TerminalNodeData
    selected: boolean
    focused: boolean
    scale: number
    linkSource: string | null
    style: TerminalStyle
    tool: CanvasTool
    onSelect: (id: string, additive: boolean) => void
    onDragStart: (id: string) => void
    onMoveNode: (id: string, patch: Partial<TerminalNodeData>) => void
    onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
    onRemoveNode: (id: string) => void
    onContextMenu: (id: string, x: number, y: number) => void
    raised: boolean
  }): JSX.Element {
    return (
      <div className="terminal-node" data-testid={`terminal-node-${node.id}`}>
        <button data-testid={`drag-start-${node.id}`} onMouseDown={() => onDragStart(node.id)}>
          drag
        </button>
        <button
          data-testid={`move-${node.id}`}
          onClick={() => onMoveNode(node.id, { x: node.x + 10, y: node.y + 15 })}
        >
          move
        </button>
        <button
          data-testid={`update-${node.id}`}
          onClick={() => onUpdateNode(node.id, { x: node.x + 20, y: node.y + 25 })}
        >
          update
        </button>
      </div>
    )
  }

  function MockMinimap({
    onClose,
  }: {
    nodes: TerminalNodeData[]
    texts: CanvasTextRecord[]
    edges: EdgeRecord[]
    selectedIds: string[]
    selectedTextIds: string[]
    selectedEdgeId: string | null
    pan: { x: number; y: number }
    zoom: number
    wrapSize: { w: number; h: number }
    onPan: (dx: number, dy: number) => void
    onClose: () => void
  }): JSX.Element {
    return (
      <div data-testid="minimap">
        <button
          type="button"
          title="Hide minimap"
          aria-label="Hide minimap"
          onClick={onClose}
        >
          hide
        </button>
      </div>
    )
  }

  function MockCanvasText({
    text,
    onSelect,
    onEdit,
    onDragStart,
    onContextMenu,
  }: {
    text: CanvasTextRecord
    selected: boolean
    editing: boolean
    scale: number
    onSelect: (id: string) => void
    onEdit: (id: string) => void
    onDragStart: (id: string) => void
    onMove: (id: string, patch: Partial<CanvasTextRecord>) => void
    onUpdate: (id: string, patch: Partial<CanvasTextRecord>) => void
    onRemove: (id: string) => void
    onEditingComplete: () => void
    onContextMenu: (id: string, x: number, y: number) => void
  }): JSX.Element {
    return (
      <button
        className="canvas-text"
        data-testid={`canvas-text-${text.id}`}
        onMouseDown={() => onSelect(text.id)}
        onDoubleClick={() => onEdit(text.id)}
        onDragStart={() => onDragStart(text.id)}
        onContextMenu={(event) => onContextMenu(text.id, event.clientX, event.clientY)}
      >
        {text.text}
      </button>
    )
  }

  return { MockResizeObserver, MockTerminalNode, MockMinimap, MockCanvasText, resizeObservers }
})

vi.mock('@renderer/features/terminals/components/TerminalNode', () => ({
  TerminalNode: mocks.MockTerminalNode,
}))

vi.mock('./Minimap', () => ({
  Minimap: mocks.MockMinimap,
}))

vi.mock('./CanvasText', () => ({
  CanvasText: mocks.MockCanvasText,
}))

import { Canvas } from './Canvas'

const baseStyle: TerminalStyle = {
  theme: 'dark',
  fontFamily: 'monospace',
  fontSize: 13,
}

const nodeA: TerminalNodeData = {
  id: 'a',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  shell: 'default',
  title: 'A',
  cwd: '/tmp/a',
  command: 'claude',
  workspace_id: 'default',
}

const nodeB: TerminalNodeData = {
  id: 'b',
  x: 210,
  y: 60,
  width: 120,
  height: 60,
  shell: 'default',
  title: 'B',
  cwd: '/tmp/b',
  command: 'claude',
  workspace_id: 'default',
}

const nodeC: TerminalNodeData = {
  id: 'c',
  x: -160,
  y: 90,
  width: 120,
  height: 70,
  shell: 'default',
  title: 'C',
  cwd: '/tmp/c',
  command: 'claude',
  workspace_id: 'default',
}

const nodeD: TerminalNodeData = {
  id: 'd',
  x: 20,
  y: 30,
  width: 50,
  height: 50,
  shell: 'default',
  title: 'D',
  cwd: '/tmp/d',
  command: 'claude',
  workspace_id: 'default',
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    nodes: [],
    texts: [],
    edges: [],
    selectedIds: [],
    selectedTextIds: [],
    selectedEdgeId: null,
    editingTextId: null,
    focusedId: null,
    focusRequest: null,
    linkSource: null,
    tool: 'select' as CanvasTool,
    contextMenuNodeId: null,
    onSelect: vi.fn(),
    onSelectText: vi.fn(),
    onSelectEdge: vi.fn(),
    onSelectMany: vi.fn(),
    onSelectManyTexts: vi.fn(),
    onSelectManyMixed: vi.fn(),
    onCreateText: vi.fn(),
    onEditText: vi.fn(),
    onMoveText: vi.fn(),
    onUpdateText: vi.fn(),
    onRemoveText: vi.fn(),
    onFocusConsumed: vi.fn(),
    onMoveNode: vi.fn(),
    onUpdateNode: vi.fn(),
    onRemoveNode: vi.fn(),
    onLinkPick: vi.fn(),
    onSetTool: vi.fn(),
    onNodeContextMenu: vi.fn(),
    onTextContextMenu: vi.fn(),
    onCanvasContextMenu: vi.fn(),
    getTerminalStyle: vi.fn(() => baseStyle),
    getRestartSignal: vi.fn(() => 0),
    ...overrides,
  } as any
}

function renderCanvas(overrides: Record<string, unknown> = {}) {
  const props = makeProps(overrides)
  const view = render(<Canvas {...props} />)

  const root = view.container.querySelector('.canvas-ambient') as HTMLDivElement
  const surface = view.container.querySelector('.canvas-surface') as HTMLDivElement

  if (!root || !surface) {
    throw new Error('Canvas root or surface not found')
  }

  return { ...view, props, root, surface }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resizeObservers.length = 0
  vi.stubGlobal('ResizeObserver', mocks.MockResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => CANVAS_RECT)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Canvas', () => {
  it('waits for a non-zero canvas measurement before mounting Rnd-based nodes and texts', async () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ZERO_RECT)
    const text: CanvasTextRecord = {
      id: 'text-1',
      text: 'Note',
      x: 40,
      y: 50,
      width: 120,
      height: 40,
      workspace_id: 'default',
    }

    const { container } = renderCanvas({
      nodes: [nodeA, nodeB],
      texts: [text],
      edges: [{ id: 'edge-ab', source: 'a', target: 'b' }],
    })

    expect(screen.queryByTestId('terminal-node-a')).toBeNull()
    expect(screen.queryByTestId('canvas-text-text-1')).toBeNull()
    expect(container.querySelector('[data-edge-id="edge-ab"]')).toBeTruthy()

    rectSpy.mockImplementation(() => CANVAS_RECT)
    act(() => {
      mocks.resizeObservers[0]?.emit()
    })

    await waitFor(() => expect(screen.getByTestId('terminal-node-a')).toBeTruthy())
    expect(screen.getByTestId('terminal-node-b')).toBeTruthy()
    expect(screen.getByTestId('canvas-text-text-1')).toBeTruthy()
  })

  it('computes edge paths, mirrors left-target edges, filters orphans, and marks highlighted edges', async () => {
    const edges: EdgeRecord[] = [
      { id: 'edge-ab', source: 'a', target: 'b' },
      { id: 'edge-ac', source: 'a', target: 'c' },
      { id: 'edge-orphan', source: 'a', target: 'missing' },
    ]

    const { container } = renderCanvas({
      nodes: [nodeA, nodeB, nodeC],
      edges,
      selectedIds: ['a'],
      selectedEdgeId: 'edge-ac',
    })

    await waitFor(() => expect(container.querySelectorAll('[data-edge-id]')).toHaveLength(2))

    const edgeGroups = [...container.querySelectorAll('[data-edge-id]')] as SVGGElement[]
    const edgeAb = edgeGroups.find((el) => el.dataset.edgeId === 'edge-ab')
    const edgeAc = edgeGroups.find((el) => el.dataset.edgeId === 'edge-ac')

    expect(edgeAb).toBeTruthy()
    expect(edgeAc).toBeTruthy()

    expect(edgeAb?.querySelector('path.edge-hit')?.getAttribute('d')).toBe(
      'M 110 45 C 170 45, 150 90, 210 90',
    )
    expect(edgeAc?.querySelector('path.edge-hit')?.getAttribute('d')).toBe(
      'M 10 45 C -50 45, 20 125, -40 125',
    )

    expect(edgeAb?.querySelector('path.selected')).toBeTruthy()
    expect(edgeAc?.querySelector('path.selected')).toBeTruthy()
    expect(edgeAb?.querySelectorAll('circle.selected')).toHaveLength(2)
    expect(edgeAc?.querySelectorAll('circle.selected')).toHaveLength(2)
  })

  it('routes the edge between overlapping nodes through their closest sides, not the right-of-A to left-of-B default', async () => {
    // Regression: with the old algorithm an edge between two overlapping nodes
    // produced a tangled S-curve floating inside the overlap area. We now pick
    // the closest side-midpoint pair, so the curve attaches to two adjacent
    // sides instead of two crossing horizontal sides.
    const a: TerminalNodeData = { ...nodeA, x: 0, y: 0, width: 200, height: 200 }
    const overlapping: TerminalNodeData = {
      ...nodeB,
      id: 'overlap',
      x: 50,
      y: 50,
      width: 200,
      height: 200,
    }
    const { container } = renderCanvas({
      nodes: [a, overlapping],
      edges: [{ id: 'edge-overlap', source: 'a', target: 'overlap' }],
    })

    await waitFor(() => expect(container.querySelectorAll('[data-edge-id]')).toHaveLength(1))
    const path = container.querySelector('[data-edge-id="edge-overlap"] path.edge-hit')
    const d = path?.getAttribute('d') ?? ''
    // a sides: left=(0,100). overlap sides: left=(50,150). Closest pair is
    // (a.left, overlap.left) at distance² 5000 — first 5000 in iteration order.
    // Control points are offset 60 units OUTWARD in the side's direction.
    expect(d).toBe('M 0 100 C -60 100, -10 150, 50 150')
  })

  it('keeps the surface at a minimum 4000px margin and grows it when nodes and viewport extend', async () => {
    const { surface, rerender, props } = renderCanvas()

    await waitFor(() => expect(surface.style.width).toBe('8400px'))
    expect(surface.style.height).toBe('8300px')

    fireEvent.click(screen.getByTitle('Zoom out'))
    await waitFor(() => expect(Number.parseFloat(surface.style.width)).toBeGreaterThan(8400))

    rerender(
      <Canvas
        {...props}
        nodes={[{ ...nodeA, x: 6000, y: 100, width: 100, height: 100 }]}
      />,
    )

    await waitFor(() => {
      const width = Number.parseFloat(surface.style.width)
      expect(width).toBeGreaterThan(14100)
      expect(width).toBeLessThan(14200)
    })
  })

  it('starts marquee after 4px, converts client to world coords, selects intersected nodes, and deselects on simple click', async () => {
    const onSelectMany = vi.fn()
    const onSelectManyMixed = vi.fn()
    const onSelect = vi.fn()
    const onSelectEdge = vi.fn()

    const { root } = renderCanvas({
      nodes: [nodeD],
      onSelectMany,
      onSelectManyMixed,
      onSelect,
      onSelectEdge,
    })

    fireEvent.mouseDown(root, { button: 0, clientX: 120, clientY: 80 })
    fireEvent.mouseMove(root, { clientX: 122, clientY: 82 })
    fireEvent.mouseUp(root, { clientX: 122, clientY: 82 })

    expect(onSelectMany).not.toHaveBeenCalled()

    fireEvent.mouseDown(root, { button: 0, clientX: 120, clientY: 80 })
    fireEvent.mouseMove(root, { clientX: 185, clientY: 145 })
    fireEvent.mouseUp(root, { clientX: 185, clientY: 145 })

    await waitFor(() => expect(onSelectManyMixed).toHaveBeenCalledWith(['d'], []))

    fireEvent.mouseDown(root, { button: 0, clientX: 120, clientY: 80 })
    fireEvent.mouseUp(root, { clientX: 120, clientY: 80 })

    expect(onSelect).toHaveBeenCalledWith(null, false)
    expect(onSelectEdge).toHaveBeenCalledWith(null)
  })

  it('creates free text on empty-canvas double click using world coordinates', async () => {
    const onCreateText = vi.fn()
    const { root } = renderCanvas({ onCreateText })

    fireEvent.doubleClick(root, { button: 0, clientX: 180, clientY: 120 })

    expect(onCreateText).toHaveBeenCalledWith({ x: 80, y: 70 })
  })

  it('creates free text on a single click when the text tool is active', async () => {
    const onCreateText = vi.fn()
    const onSelect = vi.fn()
    const onSelectText = vi.fn()
    const onSelectEdge = vi.fn()
    const onSetTool = vi.fn()
    const { root } = renderCanvas({
      tool: 'text',
      onCreateText,
      onSelect,
      onSelectText,
      onSelectEdge,
      onSetTool,
    })

    fireEvent.click(root, { button: 0, clientX: 180, clientY: 120 })

    expect(onCreateText).toHaveBeenCalledWith({ x: 80, y: 70 })
    expect(onSelect).toHaveBeenCalledWith(null, false)
    expect(onSelectText).toHaveBeenCalledWith(null)
    expect(onSelectEdge).toHaveBeenCalledWith(null)
    expect(onSetTool).toHaveBeenCalledWith('select')
  })

  it('selects both terminals and texts when dragging a marquee over both', async () => {
    const onSelectManyMixed = vi.fn()
    const onSelectManyTexts = vi.fn()
    const text: CanvasTextRecord = {
      id: 'text-1',
      text: 'Note',
      x: 30,
      y: 40,
      width: 80,
      height: 30,
      workspace_id: 'default',
    }

    const { root } = renderCanvas({
      nodes: [nodeD],
      texts: [text],
      onSelectManyMixed,
      onSelectManyTexts,
    })

    fireEvent.mouseDown(root, { button: 0, clientX: 120, clientY: 80 })
    fireEvent.mouseMove(root, { clientX: 185, clientY: 145 })
    fireEvent.mouseUp(root, { clientX: 185, clientY: 145 })

    await waitFor(() => expect(onSelectManyMixed).toHaveBeenCalledWith(['d'], ['text-1']))
  })

  it('opens the text context menu on right click over a text element', async () => {
    const onTextContextMenu = vi.fn()
    renderCanvas({
      texts: [
        {
          id: 'text-1',
          text: 'Note',
          x: 40,
          y: 50,
          width: 120,
          height: 40,
          workspace_id: 'default',
        },
      ],
      onTextContextMenu,
    })

    fireEvent.contextMenu(screen.getByTestId('canvas-text-text-1'), {
      clientX: 160,
      clientY: 120,
      button: 2,
    })

    expect(onTextContextMenu).toHaveBeenCalledWith('text-1', 160, 120)
  })

  it('selects and edits existing text without creating another text element', async () => {
    const onCreateText = vi.fn()
    const onSelectText = vi.fn()
    const onEditText = vi.fn()
    const text: CanvasTextRecord = {
      id: 'text-1',
      text: 'Note',
      x: 40,
      y: 50,
      width: 120,
      height: 40,
      workspace_id: 'default',
    }

    renderCanvas({
      texts: [text],
      onCreateText,
      onSelectText,
      onEditText,
    })

    fireEvent.mouseDown(screen.getByTestId('canvas-text-text-1'), { button: 0 })
    fireEvent.doubleClick(screen.getByTestId('canvas-text-text-1'), { button: 0 })

    expect(onSelectText).toHaveBeenCalledWith('text-1')
    expect(onEditText).toHaveBeenCalledWith('text-1')
    expect(onCreateText).not.toHaveBeenCalled()
  })

  it('switches tool modes through the toolbar and respects pan, link, delete, and shift-left pan behaviors', async () => {
    const onSetTool = vi.fn()
    const { root, rerender, props, surface } = renderCanvas({ onSetTool, nodes: [nodeA] })

    fireEvent.click(screen.getByTitle('Text (T)'))
    fireEvent.click(screen.getByTitle('Pan (H)'))
    fireEvent.click(screen.getByTitle('Link terminals'))
    fireEvent.click(screen.getByTitle('Delete on click'))

    expect(onSetTool).toHaveBeenCalledWith('text')
    expect(onSetTool).toHaveBeenCalledWith('pan')
    expect(onSetTool).toHaveBeenCalledWith('link')
    expect(onSetTool).toHaveBeenCalledWith('delete')

    rerender(<Canvas {...props} tool="text" onSetTool={onSetTool} />)
    fireEvent.click(screen.getByTitle('Text (T)'))
    expect(onSetTool).toHaveBeenCalledWith('select')

    rerender(<Canvas {...props} tool="link" onSetTool={onSetTool} />)
    fireEvent.click(screen.getByTitle('Link terminals'))
    rerender(<Canvas {...props} tool="delete" onSetTool={onSetTool} />)
    fireEvent.click(screen.getByTitle('Delete on click'))

    expect(onSetTool).toHaveBeenCalledWith('select')

    rerender(<Canvas {...props} tool="pan" />)
    fireEvent.mouseDown(root, { button: 0, clientX: 200, clientY: 150 })
    fireEvent.mouseMove(root, { clientX: 240, clientY: 175 })

    await waitFor(() => expect(surface.style.transform).toContain('translate(40px, 25px)'))

    rerender(<Canvas {...props} tool="select" />)
    fireEvent.mouseDown(screen.getByTestId('terminal-node-a'), {
      button: 0,
      shiftKey: true,
      clientX: 200,
      clientY: 150,
    })
    fireEvent.mouseMove(screen.getByTestId('terminal-node-a'), {
      clientX: 230,
      clientY: 170,
    })

    await waitFor(() => expect(surface.style.transform).toContain('translate(70px, 45px)'))
  })

  it('opens the canvas context menu with world coords, suppresses it after right-drag pan, and ignores terminal nodes', async () => {
    const onCanvasContextMenu = vi.fn()
    const { root, props, rerender } = renderCanvas({
      onCanvasContextMenu,
      nodes: [nodeA],
    })

    fireEvent.mouseDown(root, { button: 2, clientX: 140, clientY: 110 })
    fireEvent.contextMenu(root, { clientX: 140, clientY: 110, button: 2 })

    expect(onCanvasContextMenu).toHaveBeenCalledWith(40, 60, 140, 110)

    onCanvasContextMenu.mockClear()

    fireEvent.mouseDown(root, { button: 2, clientX: 140, clientY: 110 })
    fireEvent.mouseMove(root, { clientX: 160, clientY: 130 })
    fireEvent.mouseUp(root, { clientX: 160, clientY: 130 })
    fireEvent.contextMenu(root, { clientX: 160, clientY: 130, button: 2 })

    expect(onCanvasContextMenu).not.toHaveBeenCalled()

    rerender(<Canvas {...props} nodes={[nodeA]} onCanvasContextMenu={onCanvasContextMenu} />)
    fireEvent.contextMenu(screen.getByTestId('terminal-node-a'), {
      clientX: 140,
      clientY: 110,
      button: 2,
    })

    expect(onCanvasContextMenu).not.toHaveBeenCalled()
  })

  it('captures group drag starts and propagates selected node movement while isolating non-selected drags', async () => {
    const onMoveNode = vi.fn()
    const onUpdateNode = vi.fn()

    const { props, rerender } = renderCanvas({
      nodes: [nodeA, nodeB, { ...nodeC, id: 'c2', x: 420, y: 100 }],
      selectedIds: ['a', 'b'],
      onMoveNode,
      onUpdateNode,
    })

    fireEvent.mouseDown(screen.getByTestId('drag-start-a'))
    fireEvent.click(screen.getByTestId('move-a'))
    fireEvent.click(screen.getByTestId('update-a'))

    expect(onMoveNode).toHaveBeenCalledWith('b', { x: 220, y: 75 })
    expect(onMoveNode).toHaveBeenCalledWith('a', { x: 20, y: 35 })
    expect(onUpdateNode).toHaveBeenCalledWith('b', { x: 230, y: 85 })
    expect(onUpdateNode).toHaveBeenCalledWith('a', { x: 30, y: 45 })

    onMoveNode.mockClear()
    onUpdateNode.mockClear()

    rerender(
      <Canvas
        {...props}
        nodes={[nodeA, nodeB, { ...nodeC, id: 'c2', x: 420, y: 100 }]}
        selectedIds={['a', 'b']}
        onMoveNode={onMoveNode}
        onUpdateNode={onUpdateNode}
      />,
    )

    fireEvent.mouseDown(screen.getByTestId('drag-start-c2'))
    fireEvent.click(screen.getByTestId('move-c2'))
    fireEvent.click(screen.getByTestId('update-c2'))

    expect(onMoveNode).toHaveBeenCalledTimes(1)
    expect(onMoveNode).toHaveBeenCalledWith('c2', { x: 430, y: 115 })
    expect(onUpdateNode).toHaveBeenCalledTimes(1)
    expect(onUpdateNode).toHaveBeenCalledWith('c2', { x: 440, y: 125 })
  })

  it('focuses the requested node and consumes the request', async () => {
    const onFocusConsumed = vi.fn()
    const { surface } = renderCanvas({
      nodes: [{ ...nodeD, x: 20, y: 30, width: 100, height: 100 }],
      focusRequest: 'd',
      onFocusConsumed,
    })

    await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledTimes(1))
    expect(surface.style.transform).toContain('translate(130px, 70px)')
  })

  it('zooms by the center anchor, resets to 100%, and clamps zoom buttons to [0.25, 2]', async () => {
    const { surface } = renderCanvas()

    const zoomReadout = screen.getByTitle('Reset zoom')
    const zoomIn = screen.getByTitle('Zoom in')
    const zoomOut = screen.getByTitle('Zoom out')

    fireEvent.click(zoomIn)
    expect(zoomReadout.textContent).toBe('112%')
    expect(surface.style.transform).toMatch(/translate\(-24(?:\.\d+)?px, -18(?:\.\d+)?px\)/)
    expect(surface.style.transform).toContain('scale(1.12)')

    fireEvent.click(zoomReadout)
    expect(zoomReadout.textContent).toBe('100%')

    for (let i = 0; i < 20; i += 1) fireEvent.click(zoomIn)
    expect(zoomReadout.textContent).toBe('200%')

    for (let i = 0; i < 40; i += 1) fireEvent.click(zoomOut)
    expect(zoomReadout.textContent).toBe('25%')
  })

  it('hides and restores the minimap through the Canvas controls', () => {
    const { queryByTestId } = renderCanvas({ nodes: [nodeA] })

    expect(screen.getByTestId('minimap')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Hide minimap'))

    expect(queryByTestId('minimap')).toBeNull()

    fireEvent.click(screen.getByTitle('Show minimap'))

    expect(screen.getByTestId('minimap')).toBeTruthy()
  })
})
