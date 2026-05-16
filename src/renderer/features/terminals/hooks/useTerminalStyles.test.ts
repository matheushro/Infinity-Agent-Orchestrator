import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TERMINAL_STYLE, type TerminalStyle } from '../types'
import { useTerminalStyles } from './useTerminalStyles'

const storageKey = 'terminalStyles'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useTerminalStyles', () => {
  it('returns DEFAULT_TERMINAL_STYLE when the id is missing', () => {
    const { result } = renderHook(() => useTerminalStyles())

    expect(result.current.getStyle('missing')).toEqual(DEFAULT_TERMINAL_STYLE)
  })

  it('deep merges a partial stored style over the defaults', () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        'term-1': { fontSize: 21 },
      }),
    )

    const { result } = renderHook(() => useTerminalStyles())

    expect(result.current.getStyle('term-1')).toEqual({
      ...DEFAULT_TERMINAL_STYLE,
      fontSize: 21,
    })
  })

  it('applies a partial patch while preserving the existing properties', async () => {
    const { result } = renderHook(() => useTerminalStyles())

    act(() => {
      result.current.setStyle('term-1', { fontSize: 17 })
    })
    act(() => {
      result.current.setStyle('term-1', { theme: 'light' })
    })

    expect(result.current.getStyle('term-1')).toEqual({
      ...DEFAULT_TERMINAL_STYLE,
      fontSize: 17,
      theme: 'light',
    })

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        'term-1': {
          fontSize: 17,
          theme: 'light',
        },
      }),
    )
  })

  it('removes a style entry and persists the updated map to localStorage', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        'term-1': { theme: 'light', fontFamily: '"Fira Code", ui-monospace, monospace', fontSize: 18 },
        'term-2': { fontSize: 20 },
      }),
    )

    const { result } = renderHook(() => useTerminalStyles())

    act(() => {
      result.current.removeStyle('term-1')
    })

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        'term-2': { fontSize: 20 },
      }),
    )
    expect(result.current.getStyle('term-1')).toEqual(DEFAULT_TERMINAL_STYLE)
  })

  it('treats removeStyle with a missing id as a no-op', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ 'term-1': { fontSize: 19 } }))
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    const { result } = renderHook(() => useTerminalStyles())
    const callsAfterMount = setItemSpy.mock.calls.length

    act(() => {
      result.current.removeStyle('missing')
    })

    await Promise.resolve()
    expect(setItemSpy.mock.calls.length).toBe(callsAfterMount)
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      'term-1': { fontSize: 19 },
    })
  })

  it('persists styles across rerenders and remounts through useLocalStorage', () => {
    const { result, rerender, unmount } = renderHook(() => useTerminalStyles())

    act(() => {
      result.current.setStyle('term-1', { fontSize: 22, theme: 'light' })
    })

    rerender()
    expect(result.current.getStyle('term-1')).toEqual({
      ...DEFAULT_TERMINAL_STYLE,
      fontSize: 22,
      theme: 'light',
    })

    unmount()

    const { result: nextResult } = renderHook(() => useTerminalStyles())
    expect(nextResult.current.getStyle('term-1')).toEqual({
      ...DEFAULT_TERMINAL_STYLE,
      fontSize: 22,
      theme: 'light',
    })
  })
})
