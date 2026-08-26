import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasTool } from '@renderer/features/canvas/components/Canvas'
import type { TerminalNodeData, TerminalStyle } from '../types'

const mocks = vi.hoisted(() => {
  const rndInstances: any[] = []

  const useTerminalSession = vi.fn(() => vi.fn())

  const Rnd = vi.fn((props: any) => {
    rndInstances.push(props)

    return (
      <div
        data-testid="rnd"
        className={props.className}
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

  return { rndInstances, useTerminalSession, Rnd }
})

vi.mock('react-rnd', () => ({
  Rnd: mocks.Rnd,
}))

vi.mock('../hooks/useTerminalSession', () => ({
  useTerminalSession: mocks.useTerminalSession,
}))

import { TerminalNode } from './TerminalNode'

const baseNode: TerminalNodeData = {
  id: 'node-1',
  x: 120,
  y: 80,
  width: 320,
  height: 210,
  shell: 'default',
  title: 'Claude Code · repo',
  cwd: '/home/user/repo',
  command: 'claude',
  enabled: true,
}

const baseStyle: TerminalStyle = {
  theme: 'dark',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.2,
}

function renderNode(overrides: Partial<Parameters<typeof TerminalNode>[0]> = {}) {
  const props = {
    node: baseNode,
    selected: false,
    focused: false,
    scale: 1.5,
    linkSource: null,
    style: baseStyle,
    tool: 'select' as CanvasTool,
    onSelect: vi.fn(),
    onDragStart: vi.fn(),
    onMoveNode: vi.fn(),
    onUpdateNode: vi.fn(),
    onRemoveNode: vi.fn(),
    onContextMenu: vi.fn(),
    raised: false,
    restartSignal: 0,
    ...overrides,
  }

  const view = render(<TerminalNode {...props} />)

  return { ...view, props }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rndInstances.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TerminalNode', () => {
  it('renders title, cwd, and the close button', () => {
    renderNode()

    expect(screen.getByText(baseNode.title)).toBeTruthy()
    expect(screen.getByText(baseNode.cwd)).toBeTruthy()
    const closeButton = screen.getByRole('button', { name: 'Close terminal' })

    expect(closeButton).toBeTruthy()
    expect(closeButton).toHaveAttribute('title', 'Close terminal')
    expect(closeButton).toHaveAttribute('aria-label', 'Close terminal')
  })

  it('copies the terminal name from the header', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderNode()

    fireEvent.click(screen.getByRole('button', { name: 'Copy terminal name' }))

    expect(writeText).toHaveBeenCalledWith(baseNode.title)
  })

  it('turns the terminal off from the header power button', () => {
    const { props } = renderNode()

    fireEvent.click(screen.getByRole('button', { name: 'Turn off terminal' }))

    expect(props.onUpdateNode).toHaveBeenCalledWith(baseNode.id, { enabled: false })
  })

  it('runs the terminal session only while enabled', () => {
    renderNode()
    expect(mocks.useTerminalSession).toHaveBeenLastCalledWith(
      baseNode,
      baseStyle,
      undefined,
      1.5,
      0,
      true,
    )

    mocks.useTerminalSession.mockClear()
    renderNode({ node: { ...baseNode, enabled: false } })
    expect(mocks.useTerminalSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
      baseStyle,
      undefined,
      1.5,
      0,
      false,
    )
  })

  it('shows the off placeholder and turns the terminal back on', () => {
    const { props } = renderNode({ node: { ...baseNode, enabled: false } })

    expect(screen.getByText('Terminal is off')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))

    expect(props.onUpdateNode).toHaveBeenCalledWith(baseNode.id, { enabled: true })
  })

  it('enters title edit mode on double-click and commits on Enter', () => {
    const { props } = renderNode()

    fireEvent.doubleClick(screen.getByText(baseNode.title))

    const input = screen.getByDisplayValue(baseNode.title)
    expect(input).toBeTruthy()

    fireEvent.change(input, { target: { value: 'Renamed terminal' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onUpdateNode).toHaveBeenCalledTimes(1)
    expect(props.onUpdateNode).toHaveBeenCalledWith(baseNode.id, { title: 'Renamed terminal' })
  })

  it('discards title edits on Escape', () => {
    const { props } = renderNode()

    fireEvent.doubleClick(screen.getByText(baseNode.title))
    const input = screen.getByDisplayValue(baseNode.title)

    fireEvent.change(input, { target: { value: 'Temporary name' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(props.onUpdateNode).not.toHaveBeenCalled()
    expect(screen.getByText(baseNode.title)).toBeTruthy()
  })

  it('falls back to the original title when the edit is blank', () => {
    const { props } = renderNode()

    fireEvent.doubleClick(screen.getByText(baseNode.title))
    const input = screen.getByDisplayValue(baseNode.title)

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onUpdateNode).toHaveBeenCalledWith(baseNode.id, { title: baseNode.title })
  })

  it('wires drag start, drag move, and drag stop updates', () => {
    const { props } = renderNode({ selected: false })

    fireEvent.click(screen.getByTestId('drag-start'))
    fireEvent.click(screen.getByTestId('drag-move'))
    fireEvent.click(screen.getByTestId('drag-stop'))

    expect(props.onSelect).toHaveBeenCalledWith(baseNode.id, false)
    expect(props.onDragStart).toHaveBeenCalledWith(baseNode.id)
    expect(props.onMoveNode).toHaveBeenCalledWith(baseNode.id, {
      x: baseNode.x + 42,
      y: baseNode.y + 18,
    })
    expect(props.onUpdateNode).toHaveBeenCalledWith(baseNode.id, {
      x: baseNode.x + 42,
      y: baseNode.y + 18,
    })
  })

  it('wires resize start, resize move, and resize stop updates with the final bounds', () => {
    const { props } = renderNode()

    fireEvent.click(screen.getByTestId('resize-start'))
    fireEvent.click(screen.getByTestId('resize-move'))
    fireEvent.click(screen.getByTestId('resize-stop'))

    expect(props.onSelect).toHaveBeenCalledWith(baseNode.id, false)
    expect(props.onMoveNode).toHaveBeenCalledWith(baseNode.id, {
      width: 360,
      height: 240,
      x: baseNode.x + 9,
      y: baseNode.y + 11,
    })
    expect(props.onUpdateNode).toHaveBeenCalledWith(baseNode.id, {
      width: 360,
      height: 240,
      x: baseNode.x + 9,
      y: baseNode.y + 11,
    })
  })

  it('passes the minimum size and zoom scale to Rnd', () => {
    renderNode({ scale: 2.25 })

    expect(mocks.rndInstances).toHaveLength(1)
    expect(mocks.rndInstances[0]).toMatchObject({
      minWidth: 280,
      minHeight: 180,
      scale: 2.25,
    })
  })

  // The bar's width must not move with the zoom: xterm reserves its gutter when
  // it fits the grid, and a later change leaves a text column under the bar.
  it('gives the terminal surface a zoom-independent scrollbar', () => {
    renderNode({ scale: 1 })
    const atOneToOne = document.querySelector('.terminal-surface') as HTMLElement
    expect(atOneToOne.style.getPropertyValue('--term-sb-width')).toBe('14px')
    expect(atOneToOne.style.getPropertyValue('--term-sb-min-thumb')).toBe('40px')

    cleanup()
    renderNode({ scale: 0.5 })
    const zoomedOut = document.querySelector('.terminal-surface') as HTMLElement
    expect(zoomedOut.style.getPropertyValue('--term-sb-width')).toBe('14px')
  })

  it('removes the node in delete mode on mousedown', () => {
    const { props } = renderNode({ tool: 'delete' })

    fireEvent.mouseDown(screen.getByTestId('rnd'))

    expect(props.onRemoveNode).toHaveBeenCalledWith(baseNode.id)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('selects the node in link mode on mousedown without starting a drag', () => {
    const { props } = renderNode({ tool: 'link' })

    fireEvent.mouseDown(screen.getByTestId('rnd'))

    expect(props.onSelect).toHaveBeenCalledWith(baseNode.id, false)
    expect(props.onDragStart).not.toHaveBeenCalled()
  })

  it('adds the additive flag on Shift+click', () => {
    const { props } = renderNode()

    fireEvent.mouseDown(screen.getByTestId('rnd'), { shiftKey: true })

    expect(props.onSelect).toHaveBeenCalledWith(baseNode.id, true)
  })

  it('forwards client coordinates to the context menu handler', () => {
    const { props } = renderNode()

    fireEvent.contextMenu(screen.getByTestId('rnd'), {
      clientX: 321,
      clientY: 654,
    })

    expect(props.onSelect).toHaveBeenCalledWith(baseNode.id, false)
    expect(props.onContextMenu).toHaveBeenCalledWith(baseNode.id, 321, 654)
  })

  it('stops propagation from the close button and removes the node', () => {
    const { props } = renderNode()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Close terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))

    expect(props.onRemoveNode).toHaveBeenCalledWith(baseNode.id)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('marks the link source with the source class and outline', () => {
    renderNode({ linkSource: baseNode.id })

    const rnd = screen.getByTestId('rnd')
    expect(rnd.className).toContain('is-link-source')
    expect((rnd as HTMLDivElement).style.outline).toBe('2px solid var(--accent)')
  })

  it('marks selected nodes and raises them above unselected nodes', () => {
    renderNode({ selected: true })
    expect(screen.getByTestId('rnd').className).toContain('is-selected')
    expect((screen.getByTestId('rnd') as HTMLDivElement).style.zIndex).toBe('10')
  })

  it('places raised nodes at the top z-index', () => {
    renderNode({ raised: true })
    expect((screen.getByTestId('rnd') as HTMLDivElement).style.zIndex).toBe('50')
  })
})
