import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePanZoom } from './usePanZoom'

type MockTarget = {
  closest: ReturnType<typeof vi.fn>
}

function createMouseEvent({
  clientX,
  clientY,
  button = 0,
  shiftKey = false,
  targetMatchesNode = false,
}: {
  clientX: number
  clientY: number
  button?: number
  shiftKey?: boolean
  targetMatchesNode?: boolean
}): any {
  const target: MockTarget = {
    closest: vi.fn(() => (targetMatchesNode ? document.createElement('div') : null)),
  }

  return {
    clientX,
    clientY,
    button,
    shiftKey,
    target,
  }
}

function createWheelEvent({
  clientX,
  clientY,
  deltaX = 0,
  deltaY = 0,
  shiftKey = false,
  targetNodeSelector = null,
}: {
  clientX: number
  clientY: number
  deltaX?: number
  deltaY?: number
  shiftKey?: boolean
  targetNodeSelector?: string | null
}): any {
  const target: MockTarget = {
    closest: vi.fn((selector: string) =>
      targetNodeSelector && selector.split(',').map((part) => part.trim()).includes(targetNodeSelector)
        ? document.createElement('div')
        : null,
    ),
  }

  return {
    clientX,
    clientY,
    deltaX,
    deltaY,
    shiftKey,
    target,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePanZoom', () => {
  it('starts with pan {0,0} and zoom 1', () => {
    const { result } = renderHook(() => usePanZoom())

    expect(result.current.pan).toEqual({ x: 0, y: 0 })
    expect(result.current.zoom).toBe(1)
  })

  it('startPan records drag state from the current pan', () => {
    const { result } = renderHook(() => usePanZoom())

    act(() => {
      result.current.setPan({ x: 12, y: 34 })
    })

    act(() => {
      result.current.startPan(100, 200)
    })

    expect(result.current.dragStateRef.current).toEqual({
      startX: 100,
      startY: 200,
      panX: 12,
      panY: 34,
    })
  })

  it('onMouseMove updates pan by the drag delta', () => {
    const { result } = renderHook(() => usePanZoom())

    act(() => {
      result.current.startPan(100, 200)
    })

    act(() => {
      result.current.handlers.onMouseMove(createMouseEvent({ clientX: 130, clientY: 245 }))
    })

    expect(result.current.pan).toEqual({ x: 30, y: 45 })
  })

  it('endPan clears the drag state', () => {
    const { result } = renderHook(() => usePanZoom())

    act(() => {
      result.current.startPan(10, 20)
    })

    expect(result.current.dragStateRef.current).not.toBeNull()

    act(() => {
      result.current.handlers.endPan()
    })

    expect(result.current.dragStateRef.current).toBeNull()
  })

  it('ignores background mousedown on .terminal-node unless Shift+Left is held', () => {
    const { result } = renderHook(() => usePanZoom())

    act(() => {
      result.current.handlers.onBackgroundMouseDown(
        createMouseEvent({ clientX: 10, clientY: 20, targetMatchesNode: true }),
      )
    })

    expect(result.current.dragStateRef.current).toBeNull()
  })

  it('starts panning on Shift+Left mousedown even when the target is a terminal node', () => {
    const { result } = renderHook(() => usePanZoom())

    act(() => {
      result.current.handlers.onBackgroundMouseDown(
        createMouseEvent({
          clientX: 10,
          clientY: 20,
          button: 0,
          shiftKey: true,
          targetMatchesNode: true,
        }),
      )
    })

    expect(result.current.dragStateRef.current).toEqual({
      startX: 10,
      startY: 20,
      panX: 0,
      panY: 0,
    })
  })

  it('ignores wheel events over .terminal-node', () => {
    const { result } = renderHook(() => usePanZoom())
    const container = document.createElement('div')
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: vi.fn(() => ({ left: 10, top: 20 })),
    })
    result.current.containerRef.current = container

    act(() => {
      result.current.handlers.onWheel(
        createWheelEvent({
          clientX: 110,
          clientY: 220,
          deltaY: -1,
          shiftKey: true,
          targetNodeSelector: '.terminal-node',
        }),
      )
    })

    expect(result.current.pan).toEqual({ x: 0, y: 0 })
    expect(result.current.zoom).toBe(1)
  })

  it('ignores wheel events over .note-node', () => {
    const { result } = renderHook(() => usePanZoom())
    const container = document.createElement('div')
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: vi.fn(() => ({ left: 10, top: 20 })),
    })
    result.current.containerRef.current = container

    act(() => {
      result.current.handlers.onWheel(
        createWheelEvent({
          clientX: 110,
          clientY: 220,
          deltaX: 3,
          deltaY: -4,
          targetNodeSelector: '.note-node',
        }),
      )
    })

    expect(result.current.pan).toEqual({ x: 0, y: 0 })
    expect(result.current.zoom).toBe(1)
  })

  it('pans on wheel when Shift is not held', () => {
    const { result } = renderHook(() => usePanZoom())

    act(() => {
      result.current.handlers.onWheel(
        createWheelEvent({
          clientX: 0,
          clientY: 0,
          deltaX: 3,
          deltaY: -4,
        }),
      )
    })

    expect(result.current.pan).toEqual({ x: -3, y: 4 })
    expect(result.current.zoom).toBe(1)
  })

  it('zooms by 3% per wheel notch anchored at the cursor', () => {
    const { result } = renderHook(() => usePanZoom())
    const container = document.createElement('div')
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: vi.fn(() => ({ left: 10, top: 20 })),
    })
    result.current.containerRef.current = container

    act(() => {
      result.current.handlers.onWheel(
        createWheelEvent({
          clientX: 110,
          clientY: 220,
          deltaY: -1,
          shiftKey: true,
        }),
      )
    })

    expect(result.current.zoom).toBeCloseTo(1.03, 5)
    expect(result.current.pan).toEqual({ x: -3, y: -6 })

    act(() => {
      result.current.handlers.onWheel(
        createWheelEvent({
          clientX: 110,
          clientY: 220,
          deltaY: 1,
          shiftKey: true,
        }),
      )
    })

    expect(result.current.zoom).toBeCloseTo(1, 5)
    expect(result.current.pan.x).toBeCloseTo(0, 5)
    expect(result.current.pan.y).toBeCloseTo(0, 5)
  })

  it('clamps zoom to the maximum and minimum bounds', () => {
    const { result } = renderHook(() => usePanZoom())
    const container = document.createElement('div')
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: vi.fn(() => ({ left: 10, top: 20 })),
    })
    result.current.containerRef.current = container

    act(() => {
      result.current.setZoom(2.5)
      result.current.setPan({ x: 5, y: 6 })
    })

    act(() => {
      result.current.handlers.onWheel(
        createWheelEvent({
          clientX: 110,
          clientY: 220,
          deltaY: -1,
          shiftKey: true,
        }),
      )
    })

    expect(result.current.zoom).toBe(2.5)
    expect(result.current.pan).toEqual({ x: 5, y: 6 })

    act(() => {
      result.current.setZoom(0.25)
      result.current.setPan({ x: 7, y: 8 })
    })

    act(() => {
      result.current.handlers.onWheel(
        createWheelEvent({
          clientX: 110,
          clientY: 220,
          deltaY: 1,
          shiftKey: true,
        }),
      )
    })

    expect(result.current.zoom).toBe(0.25)
    expect(result.current.pan).toEqual({ x: 7, y: 8 })
  })

  it('does nothing on zero-delta zoom wheel events', () => {
    const { result } = renderHook(() => usePanZoom())
    const container = document.createElement('div')
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: vi.fn(() => ({ left: 10, top: 20 })),
    })
    result.current.containerRef.current = container

    act(() => {
      result.current.handlers.onWheel(
        createWheelEvent({
          clientX: 110,
          clientY: 220,
          deltaY: 0,
          deltaX: 0,
          shiftKey: true,
        }),
      )
    })

    expect(result.current.zoom).toBe(1)
    expect(result.current.pan).toEqual({ x: 0, y: 0 })
  })
})
