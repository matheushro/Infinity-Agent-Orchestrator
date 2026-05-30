import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Select } from './Select'

const OPTIONS = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
  { value: 'three', label: 'Three' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Select', () => {
  it('opens and changes value via keyboard', () => {
    const onChange = vi.fn()

    render(<Select ariaLabel="Mode" value="one" options={OPTIONS} onChange={onChange} />)

    const select = screen.getByRole('button', { name: 'Mode' })

    fireEvent.keyDown(select, { key: 'ArrowDown' })
    fireEvent.keyDown(select, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('two')
  })

  it('opens and changes value via mouse', () => {
    const onChange = vi.fn()

    render(<Select ariaLabel="Mode" value="one" options={OPTIONS} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mode' }))
    fireEvent.click(screen.getByRole('option', { name: 'Three' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('three')
  })
})
