import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { EdgeRecord } from '@shared/types/terminal'
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
    workspace_id: 'default',
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
    workspace_id: 'default',
  },
]

const texts: CanvasTextRecord[] = [
  {
    id: 't1',
    text: 'Note',
    x: 340,
    y: 160,
    width: 80,
    height: 28,
    workspace_id: 'default',
  },
]

const edges: EdgeRecord[] = [{ id: 'edge-at', source: 'a', target: 't1' }]

type BoundsResult = {
  scale: number
  offX: number
  offY: number
  minX: number
  minY: number
  vw0: number
  vh0: number
  vw1: number
  vh1: number
}

function layout({
  nodes,
  texts,
  pan,
  zoom,
  wrapSize,
}: {
  nodes: TerminalNodeData[]
  texts: CanvasTextRecord[]
  pan: { x: number; y: number }
  zoom: number
  wrapSize: { w: number; h: number }
}): BoundsResult {
  const vw0 = -pan.x / zoom
  const vh0 = -pan.y / zoom
  const vw1 = vw0 + wrapSize.w / zoom
  const vh1 = vh0 + wrapSize.h / zoom

  const items = [...nodes, ...texts]
  let minX: number
  let minY: number
  let maxX: number
  let maxY: number
  if (items.length === 0) {
    minX = vw0
    minY = vh0
    maxX = vw1
    maxY = vh1
  } else {
    minX = Math.min(vw0, ...items.map((item) => item.x))
    minY = Math.min(vh0, ...items.map((item) => item.y))
    maxX = Math.max(vw1, ...items.map((item) => item.x + item.width))
    maxY = Math.max(vh1, ...items.map((item) => item.y + item.height))
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

function lines(svg: SVGSVGElement): SVGLineElement[] {
  return [...svg.querySelectorAll('line')]
}

function num(value: string | null): number {
  if (value == null) throw new Error('Missing SVG attribute')
  return Number(value)
}

describe('Minimap', () => {
  it('renders canvas items, edge links, and the viewport proportionally', () => {
    const pan = { x: -40, y: 10 }
    const zoom = 1.25
    const wrapSize = { w: 900, h: 600 }
    const expected = layout({ nodes, texts, pan, zoom, wrapSize })

    const { container } = render(
      <Minimap
        nodes={nodes}
        texts={texts}
        edges={edges}
        selectedIds={['b']}
        selectedTextIds={['t1']}
        selectedEdgeId="edge-at"
        pan={pan}
        zoom={zoom}
        wrapSize={wrapSize}
        onPan={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const root = container.querySelector('.minimap > svg') as SVGSVGElement
    const [nodeA, nodeB, textT1, viewport] = rects(root)
    const [edgeLine] = lines(root)

    expect(num(nodeA.getAttribute('width'))).toBeCloseTo(nodes[0].width * expected.scale, 5)
    expect(num(nodeB.getAttribute('width'))).toBeCloseTo(nodes[1].width * expected.scale, 5)
    expect(num(textT1.getAttribute('width'))).toBeCloseTo(texts[0].width * expected.scale, 5)
    expect(num(nodeA.getAttribute('height'))).toBeCloseTo(nodes[0].height * expected.scale, 5)
    expect(num(nodeB.getAttribute('height'))).toBeCloseTo(nodes[1].height * expected.scale, 5)
    expect(num(textT1.getAttribute('height'))).toBeCloseTo(texts[0].height * expected.scale, 5)

    expect(num(nodeB.getAttribute('x')) - num(nodeA.getAttribute('x'))).toBeCloseTo(
      (nodes[1].x - nodes[0].x) * expected.scale,
      5,
    )
    expect(num(nodeB.getAttribute('y')) - num(nodeA.getAttribute('y'))).toBeCloseTo(
      (nodes[1].y - nodes[0].y) * expected.scale,
      5,
    )
    expect(num(textT1.getAttribute('x'))).toBeCloseTo(
      expected.offX + (texts[0].x - expected.minX) * expected.scale,
      5,
    )
    expect(num(textT1.getAttribute('y'))).toBeCloseTo(
      expected.offY + (texts[0].y - expected.minY) * expected.scale,
      5,
    )

    expect(nodeA.getAttribute('fill')).toBe('color-mix(in oklch, var(--fg) 60%, transparent)')
    expect(nodeA.getAttribute('opacity')).toBe('0.55')
    expect(nodeB.getAttribute('fill')).toBe('var(--accent)')
    expect(nodeB.getAttribute('opacity')).toBe('0.95')
    expect(textT1.getAttribute('fill')).toBe('var(--accent)')
    expect(textT1.getAttribute('opacity')).toBe('0.95')

    expect(num(edgeLine.getAttribute('x1'))).toBeCloseTo(
      expected.offX + (nodes[0].x + nodes[0].width / 2 - expected.minX) * expected.scale,
      5,
    )
    expect(num(edgeLine.getAttribute('y1'))).toBeCloseTo(
      expected.offY + (nodes[0].y + nodes[0].height / 2 - expected.minY) * expected.scale,
      5,
    )
    expect(num(edgeLine.getAttribute('x2'))).toBeCloseTo(
      expected.offX + (texts[0].x + texts[0].width / 2 - expected.minX) * expected.scale,
      5,
    )
    expect(num(edgeLine.getAttribute('y2'))).toBeCloseTo(
      expected.offY + (texts[0].y + texts[0].height / 2 - expected.minY) * expected.scale,
      5,
    )
    expect(edgeLine.getAttribute('stroke')).toBe('var(--accent)')
    expect(edgeLine.getAttribute('stroke-width')).toBe('1.6')

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
    const expected = layout({ nodes, texts, pan, zoom, wrapSize })
    const onPan = vi.fn()
    const onClose = vi.fn()

    const { container } = render(
      <Minimap
        nodes={nodes}
        texts={texts}
        edges={edges}
        selectedIds={[]}
        selectedTextIds={[]}
        selectedEdgeId={null}
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
