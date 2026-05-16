import '@testing-library/jest-dom/vitest'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasTextRecord } from '@shared/types/canvas'

const mocks = vi.hoisted(() => {
  const rndInstances: Array<Record<string, unknown>> = []

  const Rnd = vi.fn((props: Record<string, unknown> & { children: ReactNode }) => {
    rndInstances.push(props)

    return (
      <div
        data-testid="canvas-text-root"
        className={String(props.className ?? '')}
        style={props.style as CSSProperties}
      >
        {props.children}
      </div>
    )
  })

  return { rndInstances, Rnd }
})

vi.mock('react-rnd', () => ({
  Rnd: mocks.Rnd,
}))

import { CanvasText } from './CanvasText'

const baseText: CanvasTextRecord = {
  id: 'text-1',
  text: 'Note',
  x: 40,
  y: 50,
  width: 240,
  height: 90,
  workspace_id: 'ws-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rndInstances.length = 0
})

describe('CanvasText', () => {
  it('renders a transparent text block with font size based on the current box size', () => {
    render(
      <CanvasText
        text={baseText}
        selected={false}
        editing={false}
        scale={1}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDragStart={vi.fn()}
        onMove={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onEditingComplete={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    )

    expect(screen.getByTestId('canvas-text-root')).toHaveStyle({
      background: 'transparent',
      boxShadow: 'none',
      cursor: 'grab',
    })
    expect(screen.getByText('Note')).toHaveStyle({ fontSize: '30px' })
  })

  it('grows the text size when the box is resized diagonally', async () => {
    const onUpdate = vi.fn()

    function Harness(): JSX.Element {
      const [text, setText] = useState(baseText)

      return (
        <CanvasText
          text={text}
          selected
          editing={false}
          scale={1}
          onSelect={vi.fn()}
          onEdit={vi.fn()}
          onDragStart={vi.fn()}
          onMove={(_id, patch) => setText((prev) => ({ ...prev, ...patch }))}
          onUpdate={onUpdate}
          onRemove={vi.fn()}
          onEditingComplete={vi.fn()}
          onContextMenu={vi.fn()}
        />
      )
    }

    render(<Harness />)

    const rnd = mocks.rndInstances[0] as {
      onResize?: (
        event: unknown,
        direction: unknown,
        ref: { offsetWidth: number; offsetHeight: number },
        delta: unknown,
        position: { x: number; y: number },
      ) => void
      onResizeStop?: (
        event: unknown,
        direction: unknown,
        ref: { offsetWidth: number; offsetHeight: number },
        delta: unknown,
        position: { x: number; y: number },
      ) => void
    }

    act(() => {
      rnd.onResize?.({}, 'bottomRight', { offsetWidth: 360, offsetHeight: 240 }, {}, { x: 40, y: 50 })
      rnd.onResizeStop?.(
        {},
        'bottomRight',
        { offsetWidth: 360, offsetHeight: 240 },
        {},
        { x: 40, y: 50 },
      )
    })

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('text-1', {
        width: 360,
        height: 240,
        x: 40,
        y: 50,
      }),
    )
    expect(screen.getByText('Note')).toHaveStyle({ fontSize: '80px' })
  })

  it('commits text using a tight box around the measured content', async () => {
    const offsetWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('aria-hidden') === 'true' ? 72 : 0
      })
    const offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('aria-hidden') === 'true' ? 28 : 0
      })
    const onUpdate = vi.fn()

    render(
      <CanvasText
        text={baseText}
        selected={false}
        editing
        scale={1}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDragStart={vi.fn()}
        onMove={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onEditingComplete={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    )

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('text-1', {
        text: 'Note',
        width: 72,
        height: 28,
      }),
    )

    offsetWidthSpy.mockRestore()
    offsetHeightSpy.mockRestore()
  })
})
