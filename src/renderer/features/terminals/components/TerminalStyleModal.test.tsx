import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_TERMINAL_STYLE,
  FONT_FAMILY_OPTIONS,
} from '../types'
import { TerminalStyleModal } from './TerminalStyleModal'

function renderModal(
  value = DEFAULT_TERMINAL_STYLE,
): {
  onChange: ReturnType<typeof vi.fn>
  onReset: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  const onReset = vi.fn()
  const onClose = vi.fn()

  render(
    <TerminalStyleModal
      terminalTitle="Atlas"
      value={value}
      onChange={onChange}
      onReset={onReset}
      onClose={onClose}
    />,
  )

  return { onChange, onReset, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TerminalStyleModal', () => {
  it('renders the current style values', () => {
    renderModal({
      theme: 'light',
      fontFamily: FONT_FAMILY_OPTIONS[2].value,
      fontSize: 18,
    })

    expect(screen.getByRole('heading', { name: 'Style · Atlas' })).toBeInTheDocument()
    // Dark chip is inactive when theme=light.
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveStyle({
      background: 'transparent',
      color: 'var(--fg-3)',
    })
    // Light chip is active.
    expect(screen.getByRole('button', { name: 'Light' })).toHaveStyle({
      background: 'var(--bg)',
      color: 'var(--fg)',
    })

    const select = screen.getByRole('button', { name: 'Font' })
    const range = screen.getByRole('slider') as HTMLInputElement

    expect(select).toHaveTextContent(FONT_FAMILY_OPTIONS[2].label)
    expect(range).toHaveValue('18')
    expect(screen.getByText('Font size · 18px')).toBeInTheDocument()
  })

  it.each([
    ['Auto', { theme: 'auto' }],
    ['Dark', { theme: 'dark' }],
    ['Light', { theme: 'light' }],
  ] as const)('clicking %s calls onChange with %o', (label, expectedPatch) => {
    const { onChange } = renderModal({
      theme: 'light',
      fontFamily: DEFAULT_TERMINAL_STYLE.fontFamily,
      fontSize: DEFAULT_TERMINAL_STYLE.fontSize,
    })

    fireEvent.click(screen.getByRole('button', { name: label }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expectedPatch)
  })

  it('changing the font size calls onChange with the numeric value', () => {
    const { onChange } = renderModal()

    fireEvent.change(screen.getByRole('slider'), { target: { value: '20' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ fontSize: 20 })
  })

  it('changing the font family calls onChange with the selected value', () => {
    const { onChange } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Font' }))
    fireEvent.click(screen.getByRole('option', { name: FONT_FAMILY_OPTIONS[3].label }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ fontFamily: FONT_FAMILY_OPTIONS[3].value })
  })

  it('calls onReset from the reset button', () => {
    const { onReset } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('calls onClose from Done and the modal close button', () => {
    const { onClose } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
