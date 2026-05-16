import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Modal } from './Modal'

function renderModal(closeOnOverlay = false) {
  const onClose = vi.fn()

  render(
    <Modal title="Settings" closeOnOverlay={closeOnOverlay} onClose={onClose}>
      <button type="button">First action</button>
      <input aria-label="Modal input" />
      <button type="button">Last action</button>
    </Modal>,
  )

  const overlay = screen.getByText('Settings').closest('[class*="fixed"]')
  if (!overlay) {
    throw new Error('Modal overlay not found')
  }

  return { onClose, overlay }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Modal', () => {
  it('closes on backdrop click when enabled', () => {
    const { onClose, overlay } = renderModal(true)

    fireEvent.mouseDown(overlay)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has role="dialog" and aria-modal="true"', () => {
    renderModal()

    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('moves initial focus to the first interactive field', async () => {
    renderModal()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus()
    })
  })

  it('closes on Escape', () => {
    const { onClose } = renderModal()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('traps focus with Tab inside the modal', async () => {
    renderModal()

    const firstAction = screen.getByRole('button', { name: 'First action' })
    const input = screen.getByRole('textbox', { name: 'Modal input' })
    const lastAction = screen.getByRole('button', { name: 'Last action' })
    const closeButton = screen.getByRole('button', { name: 'Close' })

    await waitFor(() => {
      expect(firstAction).toHaveFocus()
    })

    fireEvent.keyDown(firstAction, { key: 'Tab' })
    expect(input).toHaveFocus()

    fireEvent.keyDown(input, { key: 'Tab' })
    expect(lastAction).toHaveFocus()

    fireEvent.keyDown(lastAction, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(closeButton, { key: 'Tab' })
    expect(firstAction).toHaveFocus()
  })
})
