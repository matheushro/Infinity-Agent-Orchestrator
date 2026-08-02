import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TerminalContextMenu } from './TerminalContextMenu'

function renderMenu(overrides: { enabled?: boolean } = {}) {
  const onClose = vi.fn()
  const onRestart = vi.fn()
  const onDuplicate = vi.fn()
  const onLink = vi.fn()
  const onToggleEnabled = vi.fn()
  const onSettings = vi.fn()
  const onDelete = vi.fn()
  const onOpenInVSCode = vi.fn()

  render(
    <TerminalContextMenu
      x={248}
      y={392}
      enabled={overrides.enabled ?? true}
      onClose={onClose}
      onRestart={onRestart}
      onDuplicate={onDuplicate}
      onLink={onLink}
      onToggleEnabled={onToggleEnabled}
      onSettings={onSettings}
      onDelete={onDelete}
      onOpenInVSCode={onOpenInVSCode}
    />,
  )

  const linkButton = screen.getByRole('button', { name: 'Link to terminal/note' })
  const menu = linkButton.parentElement as HTMLElement
  const overlay = menu.previousElementSibling as HTMLElement

  return {
    onClose,
    onRestart,
    onDuplicate,
    onLink,
    onToggleEnabled,
    onSettings,
    onDelete,
    onOpenInVSCode,
    menu,
    overlay,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TerminalContextMenu', () => {
  it('renders at the provided coordinates with the expected actions', () => {
    const { menu } = renderMenu()

    expect(menu).toHaveStyle({ left: '248px', top: '392px' })
    expect(menu.className).toContain('fixed')
    expect(screen.getByRole('button', { name: 'Restart terminal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate terminal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link to terminal/note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminal settings…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open on VS Code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete terminal' })).toBeInTheDocument()
  })

  it('labels the power action "Turn off terminal" when enabled', () => {
    renderMenu({ enabled: true })
    expect(screen.getByRole('button', { name: 'Turn off terminal' })).toBeInTheDocument()
  })

  it('labels the power action "Turn on terminal" when disabled', () => {
    renderMenu({ enabled: false })
    expect(screen.getByRole('button', { name: 'Turn on terminal' })).toBeInTheDocument()
  })

  it('clicking the power action triggers onToggleEnabled and closes', () => {
    const props = renderMenu({ enabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Turn off terminal' }))
    expect(props.onToggleEnabled).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Restart terminal', 'onRestart'],
    ['Terminal settings…', 'onSettings'],
    ['Duplicate terminal', 'onDuplicate'],
    ['Link to terminal/note', 'onLink'],
    ['Open on VS Code', 'onOpenInVSCode'],
    ['Delete terminal', 'onDelete'],
  ] as const)('clicking %s triggers its callback and closes', (label, callbackName) => {
    const props = renderMenu()

    fireEvent.click(screen.getByRole('button', { name: label }))

    expect(props[callbackName]).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when clicking outside the menu', () => {
    const { overlay, onClose } = renderMenu()

    fireEvent.mouseDown(overlay)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const { onClose } = renderMenu()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when right-clicking outside the menu', () => {
    const { overlay, onClose } = renderMenu()

    fireEvent.contextMenu(overlay)

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
