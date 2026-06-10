import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): JSX.Element {
  throw new Error('boom from child')
}

beforeEach(() => {
  // React logs the caught error (plus our componentDidCatch) — keep the test
  // output clean and assert through the UI instead.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <span data-testid="child">all good</span>
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('child').textContent).toBe('all good')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // Regression: without a boundary, a child throwing during render/commit
  // unmounted the entire tree — the app window went completely white.
  it('shows the fallback with the error message instead of a white screen', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Something went wrong')
    expect(alert.textContent).toContain('boom from child')
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeTruthy()
  })

  it('logs the caught error for diagnosis', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(console.error).toHaveBeenCalledWith(
      '[error-boundary]',
      expect.objectContaining({ message: 'boom from child' }),
      expect.any(String),
    )
  })
})
