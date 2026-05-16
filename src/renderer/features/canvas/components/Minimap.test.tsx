import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TerminalNodeData } from '@renderer/features/terminals/types'

import { Minimap } from './Minimap'

const nodes: TerminalNodeData[] = [
  {
    id: 'a',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    shell: 'default',
    title: 'A',
    cwd: '/tmp/a',
    command: 'claude',
  },
  {
    id: 'b',
    x: 210,
    y: 60,
    width: 120,
    height: 60,
    shell: 'default',
    title: 'B',
    cwd: '/tmp/b',
    command: 'claude',
  },
]

function layout({
  nodes,
  pan,
  zoom,
  wrapSize,
}: {
  nodes: TerminalNodeData[]
  pan: { x: number; y: number }
  zoom: number
  wrapSize: { w: number; h: number }
}): {
  scale: number
  offX: number
  offY: number
  minX: number
  minY: number
  vw0: number
  vh0: number
  vw1: number
  vh1: number
} {
  const vw0 = -pan.x / zoom
  const vh0 = -pan.y / zoom
  const vw1 = vw0 + wrapSize.w / zoom
  const vh1 = vh0 + wrapSize.h / zoom

  let minX: number
  let minY: number
  let maxX: number
  let maxY: number
  if (nodes.length === 0) {
    minX = vw0
    minY = vh0
    maxX = vw1
    maxY = vh1
  } else {
    minX = Math.min(vw0, ...nodes.map((n) => n.x))
    minY = Math.min(vh0, ...nodes.map((n) => n.y))
    maxX = Math.max(vw1, ...nodes.map((n) => n.x + n.width))
    maxY = Math.max(vh1, ...nodes.map((n) => n.y + n.height))
  }
  const pad = Math.max(80, Math.max(maxX - minX, maxY - minY) * 0.1)
  minX -= pad
  minY -= pad
  maxX += pad
  maxY += pad

  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const scale = Math.min(168 / bw, 110 / bh)
  const offX = (168 - bw * scale) / 2
  const offY = (110 - bh * scale) / 2

  return { scale, offX, offY, minX, minY, vw0, vh0, vw1, vh1 }
}

function rects(svg: SVGSVGElement): SVGRectElement[] {
  return [...svg.querySelectorAll('rect')]
}

function num(value: string | null): number {
  if (value == null) throw new Error('Missing SVG attribute')
  return Number(value)
}

describe('Minimap', () => {
  it('renders node rectangles proportionally and highlights selected nodes', () => {
    const pan = { x: -40, y: 10 }
    const zoom = 1.25
    const wrapSize = { w: 900, h: 600 }
    const expected = layout({ nodes, pan, zoom, wrapSize })

    const { container } = render(
      <Minimap
        nodes={nodes}
        selectedIds={['b']}
        pan={pan}
        zoom={zoom}
        wrapSize={wrapSize}
        onPan={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const root = container.querySelector('.minimap > svg') as SVGSVGElement
    const [nodeA, nodeB, viewport] = rects(root)

    expect(num(nodeA.getAttribute('width'))).toBeCloseTo(nodes[0].width * expected.scale, 5)
    expect(num(nodeB.getAttribute('width'))).toBeCloseTo(nodes[1].width * expected.scale, 5)
    expect(num(nodeA.getAttribute('height'))).toBeCloseTo(nodes[0].height * expected.scale, 5)
    expect(num(nodeB.getAttribute('height'))).toBeCloseTo(nodes[1].height * expected.scale, 5)

    expect(num(nodeB.getAttribute('x')) - num(nodeA.getAttribute('x'))).toBeCloseTo(
      (nodes[1].x - nodes[0].x) * expected.scale,
      5,
    )
    expect(num(nodeB.getAttribute('y')) - num(nodeA.getAttribute('y'))).toBeCloseTo(
      (nodes[1].y - nodes[0].y) * expected.scale,
      5,
    )

    expect(nodeA.getAttribute('fill')).toBe('color-mix(in oklch, var(--fg) 60%, transparent)')
    expect(nodeA.getAttribute('opacity')).toBe('0.55')
    expect(nodeB.getAttribute('fill')).toBe('var(--accent)')
    expect(nodeB.getAttribute('opacity')).toBe('0.95')

    expect(num(viewport.getAttribute('x'))).toBeCloseTo(
      expected.offX + (expected.vw0 - expected.minX) * expected.scale,
      5,
    )
    expect(num(viewport.getAttribute('y'))).toBeCloseTo(
      expected.offY + (expected.vh0 - expected.minY) * expected.scale,
      5,
    )
    expect(num(viewport.getAttribute('width'))).toBeCloseTo(
      Math.max(4, (expected.vw1 - expected.vw0) * expected.scale),
      5,
    )
    expect(num(viewport.getAttribute('height'))).toBeCloseTo(
      Math.max(4, (expected.vh1 - expected.vh0) * expected.scale),
      5,
    )
    expect(viewport.getAttribute('stroke')).toBe('var(--accent)')
    expect(viewport.getAttribute('fill')).toBe(
      'color-mix(in oklch, var(--accent) 12%, transparent)',
    )
  })

  it('updates pan on drag and closes through the hide button', () => {
    const pan = { x: -40, y: 10 }
    const zoom = 1.25
    const wrapSize = { w: 900, h: 600 }
    const expected = layout({ nodes, pan, zoom, wrapSize })
    const onPan = vi.fn()
    const onClose = vi.fn()

    const { container } = render(
      <Minimap
        nodes={nodes}
        selectedIds={[]}
        pan={pan}
        zoom={zoom}
        wrapSize={wrapSize}
        onPan={onPan}
        onClose={onClose}
      />,
    )

    const root = container.querySelector('.minimap > svg') as SVGSVGElement

    fireEvent.mouseDown(root, { button: 0, clientX: 20, clientY: 30 })
    fireEvent.mouseMove(window, { clientX: 44, clientY: 54 })
    fireEvent.mouseUp(window, { clientX: 44, clientY: 54 })

    expect(onPan).toHaveBeenCalledWith(
      ((44 - 20) / expected.scale) * zoom,
      ((54 - 30) / expected.scale) * zoom,
    )

    fireEvent.click(screen.getByLabelText('Hide minimap'))
    const hideButton = screen.getByLabelText('Hide minimap')

    expect(hideButton).toHaveAttribute('title', 'Hide minimap')
    expect(hideButton).toHaveAttribute('aria-label', 'Hide minimap')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
