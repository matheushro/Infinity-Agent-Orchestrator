import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PtyActivityProvider, usePtyActivity } from './PtyActivityContext'

afterEach(() => {
  // nothing to restore — no spies used
})

describe('PtyActivityContext', () => {
  it('6.1 isActive(nodeId) returns false before any setStatus call (defaults to offline)', () => {
    const { result } = renderHook(() => usePtyActivity(), {
      wrapper: PtyActivityProvider,
    })
    expect(result.current.getStatus('node-x')).toBe('offline')
  })

  it('6.2 setStatus(nodeId, idle) makes getStatus return idle', () => {
    const { result } = renderHook(() => usePtyActivity(), {
      wrapper: PtyActivityProvider,
    })

    act(() => {
      result.current.setStatus('node-a', 'idle')
    })

    expect(result.current.getStatus('node-a')).toBe('idle')
  })

  it('6.3 setStatus(nodeId, offline) makes getStatus return offline again', () => {
    const { result } = renderHook(() => usePtyActivity(), {
      wrapper: PtyActivityProvider,
    })

    act(() => {
      result.current.setStatus('node-b', 'idle')
    })
    expect(result.current.getStatus('node-b')).toBe('idle')

    act(() => {
      result.current.setStatus('node-b', 'offline')
    })
    expect(result.current.getStatus('node-b')).toBe('offline')
  })

  it('6.4 setting one node active does not affect another node\'s status', () => {
    const { result } = renderHook(() => usePtyActivity(), {
      wrapper: PtyActivityProvider,
    })

    act(() => {
      result.current.setStatus('node-c', 'busy')
    })

    expect(result.current.getStatus('node-c')).toBe('busy')
    expect(result.current.getStatus('node-d')).toBe('offline')
  })

  // Regression: setStatus fires on every pty data chunk. Before the dedupe,
  // each repeated 'busy' produced a new statusMap and re-rendered every
  // consumer (all terminal nodes + sidebar) hundreds of times per second.
  it('6.6 repeating the same status does not re-render consumers', () => {
    let renders = 0
    const { result } = renderHook(
      () => {
        renders++
        return usePtyActivity()
      },
      { wrapper: PtyActivityProvider },
    )

    act(() => {
      result.current.setStatus('node-spam', 'busy')
    })
    const rendersAfterTransition = renders

    act(() => {
      result.current.setStatus('node-spam', 'busy')
    })
    act(() => {
      result.current.setStatus('node-spam', 'busy')
    })

    expect(renders).toBe(rendersAfterTransition)
    expect(result.current.getStatus('node-spam')).toBe('busy')
  })

  it("6.7 setting 'offline' on an unknown node is a no-op (offline is the default)", () => {
    let renders = 0
    const { result } = renderHook(
      () => {
        renders++
        return usePtyActivity()
      },
      { wrapper: PtyActivityProvider },
    )
    const initialRenders = renders

    act(() => {
      result.current.setStatus('never-seen', 'offline')
    })

    expect(renders).toBe(initialRenders)
    expect(result.current.getStatus('never-seen')).toBe('offline')
  })

  it('6.5 usePtyActivity outside a PtyActivityProvider returns the safe default (always offline)', () => {
    // The context default is { getStatus: () => "offline", setStatus: () => {} }
    // so calling getStatus outside a provider should return "offline" without throwing.
    function Consumer(): JSX.Element {
      const { getStatus } = usePtyActivity()
      return <span data-testid="status">{getStatus('any-node')}</span>
    }

    render(<Consumer />)
    expect(screen.getByTestId('status').textContent).toBe('offline')
  })
})
