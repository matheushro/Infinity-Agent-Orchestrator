import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Button', () => {
  it('propagates onClick and exposes aria-label', () => {
    const onClick = vi.fn()

    render(
      <Button aria-label="Create terminal" onClick={onClick}>
        Open
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Create terminal' })

    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('respects disabled and suppresses clicks', () => {
    const onClick = vi.fn()

    render(
      <Button disabled onClick={onClick}>
        Disabled action
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Disabled action' })

    expect(button).toBeDisabled()

    fireEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })
})
