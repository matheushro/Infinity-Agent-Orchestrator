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
  it('changes value via keyboard', () => {
    const onChange = vi.fn()

    render(<Select label="Mode" value="one" options={OPTIONS} onChange={onChange} />)

    const select = screen.getByRole('combobox', { name: 'Mode' })

    select.focus()
    fireEvent.keyDown(select, { key: 'ArrowDown' })
    fireEvent.change(select, { target: { value: 'two' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('two')
  })

  it('changes value via mouse', () => {
    const onChange = vi.fn()

    render(<Select label="Mode" value="one" options={OPTIONS} onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), {
      target: { value: 'three' },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('three')
  })
})
