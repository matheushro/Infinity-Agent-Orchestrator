import '@testing-library/jest-dom/vitest'

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as Icons from './Icon'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Icon', () => {
  it('renders an inline svg with the requested size', () => {
    const { container } = render(
      <Icons.Icon size={18}>
        <path d="M0 0" />
      </Icons.Icon>,
    )

    const svg = container.querySelector('svg')

    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('width', '18')
    expect(svg).toHaveAttribute('height', '18')
    expect(svg).toHaveAttribute('fill', 'none')
  })

  it('renders every exported icon component without throwing', () => {
    const iconEntries = Object.entries(Icons).filter(
      ([name, value]) => name.startsWith('I') && name !== 'Icon' && typeof value === 'function',
    ) as Array<[string, (props?: Record<string, unknown>) => JSX.Element]>

    expect(iconEntries.length).toBeGreaterThan(0)

    for (const [name, IconComponent] of iconEntries) {
      const { container } = render(<IconComponent data-testid={name} size={16} />)

      expect(container.querySelector('svg')).toBeInTheDocument()
    }
  })
})
