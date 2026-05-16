import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import { Sidebar } from './Sidebar'

const terminals: TerminalNodeData[] = [
  {
    id: 'alpha',
    x: 0,
    y: 0,
    width: 320,
    height: 220,
    shell: 'default',
    title: 'Alpha Shell',
    cwd: '/Users/me/Workspace/AlphaApp',
    command: 'claude',
  },
  {
    id: 'beta',
    x: 20,
    y: 20,
    width: 320,
    height: 220,
    shell: 'default',
    title: 'Beta Terminal',
    cwd: '/Users/me/Projects/Beta',
    command: 'claude',
  },
  {
    id: 'gamma',
    x: 40,
    y: 40,
    width: 320,
    height: 220,
    shell: 'default',
    title: 'Gamma',
    cwd: '/Users/me/Workspace/Gamma',
    command: 'claude',
  },
]

function renderSidebar(overrides: Partial<ComponentProps<typeof Sidebar>> = {}) {
  const props: ComponentProps<typeof Sidebar> = {
    terminals,
    selectedId: 'beta',
    theme: 'dark',
    query: '',
    collapsed: false,
    onCollapsedChange: vi.fn(),
    onQuery: vi.fn(),
    onNewTerminal: vi.fn(),
    onSelect: vi.fn(),
    onFocus: vi.fn(),
    onStartLink: vi.fn(),
    onToggleTheme: vi.fn(),
    ...overrides,
  }

  return {
    ...render(<Sidebar {...props} />),
    props,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Sidebar', () => {
  it('filters terminals by title and cwd without case sensitivity', () => {
    const { rerender } = renderSidebar({ query: 'aLpHa' })

    expect(screen.getByText('Alpha Shell')).toBeTruthy()
    expect(screen.queryByText('Beta Terminal')).toBeNull()
    expect(screen.queryByText('Gamma')).toBeNull()

    rerender(
      <Sidebar
        terminals={terminals}
        selectedId="beta"
        theme="dark"
        query="wOrKsPaCe"
        collapsed={false}
        onCollapsedChange={vi.fn()}
        onQuery={vi.fn()}
        onNewTerminal={vi.fn()}
        onSelect={vi.fn()}
        onFocus={vi.fn()}
        onStartLink={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    )

    expect(screen.getByText('Alpha Shell')).toBeTruthy()
    expect(screen.getByText('Gamma')).toBeTruthy()
    expect(screen.queryByText('Beta Terminal')).toBeNull()
  })

  it('calls onSelect and onFocus when a terminal item is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('Alpha Shell'))

    expect(props.onSelect).toHaveBeenCalledWith('alpha')
    expect(props.onFocus).toHaveBeenCalledWith('alpha')
  })

  it('highlights the selected terminal item', () => {
    renderSidebar({ selectedId: 'beta' })

    expect(screen.getByText('Beta Terminal').closest('.term-item')?.className).toContain('active')
    expect(screen.getByText('Alpha Shell').closest('.term-item')?.className).not.toContain(
      'active',
    )
  })

  it('calls onNewTerminal from the sidebar actions', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: /New terminal/ }))

    expect(props.onNewTerminal).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleTheme with the opposite theme from the active chip', () => {
    const { props, rerender } = renderSidebar({ theme: 'dark' })

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(props.onToggleTheme).toHaveBeenCalledWith('light')

    rerender(
      <Sidebar
        terminals={terminals}
        selectedId="beta"
        theme="light"
        query=""
        collapsed={false}
        onCollapsedChange={vi.fn()}
        onQuery={vi.fn()}
        onNewTerminal={vi.fn()}
        onSelect={vi.fn()}
        onFocus={vi.fn()}
        onStartLink={vi.fn()}
        onToggleTheme={props.onToggleTheme}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(props.onToggleTheme).toHaveBeenCalledWith('dark')
  })

  it('toggles collapsed state through onCollapsedChange', () => {
    const { props, rerender } = renderSidebar({ collapsed: false })

    fireEvent.click(screen.getByTitle('Collapse sidebar'))
    expect(props.onCollapsedChange).toHaveBeenCalledWith(true)

    rerender(
      <Sidebar
        terminals={terminals}
        selectedId="beta"
        theme="dark"
        query=""
        collapsed
        onCollapsedChange={props.onCollapsedChange}
        onQuery={vi.fn()}
        onNewTerminal={vi.fn()}
        onSelect={vi.fn()}
        onFocus={vi.fn()}
        onStartLink={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false)
  })

  it('calls onStartLink from the item link button', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getAllByRole('button', { name: 'Link from this terminal' })[0])

    expect(props.onStartLink).toHaveBeenCalledWith('alpha')
  })

  it('keeps icon buttons accessible while hiding labels in collapsed mode', () => {
    renderSidebar({ collapsed: true })

    expect(screen.queryByText('Terminals')).toBeNull()
    expect(screen.queryByText('Alpha Shell')).toBeNull()
    expect(screen.queryByText('Beta Terminal')).toBeNull()
    expect(screen.queryByText('Gamma')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New terminal' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'A' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'B' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'G' })).toBeTruthy()
    expect(screen.getByTitle('Alpha Shell · /Users/me/Workspace/AlphaApp')).toBeTruthy()
  })
})
