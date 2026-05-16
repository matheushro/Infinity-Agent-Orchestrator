import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Topbar } from './Topbar'

function renderTopbar(overrides: Partial<ComponentProps<typeof Topbar>> = {}) {
  const props: ComponentProps<typeof Topbar> = {
    workspaceName: 'My Workspace',
    terminalCount: 2,
    theme: 'dark',
    shell: 'default',
    onToggleTheme: vi.fn(),
    onShellChange: vi.fn(),
    ...overrides,
  }

  return {
    ...render(<Topbar {...props} />),
    props,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Topbar', () => {
  it('shows the active workspace name in the breadcrumb', () => {
    renderTopbar({ workspaceName: 'Dev Workspace' })
    expect(screen.getByText('Dev Workspace')).toBeInTheDocument()
  })

  it('shows the terminal count with the correct singular and plural forms', () => {
    const { rerender } = renderTopbar({ terminalCount: 1 })

    expect(screen.getByText('1 terminal')).toBeInTheDocument()

    rerender(<Topbar workspaceName="My Workspace" terminalCount={2} theme="dark" shell="default" onToggleTheme={vi.fn()} onShellChange={vi.fn()} />)

    expect(screen.getByText('2 terminals')).toBeInTheDocument()
  })

  it('propagates shell changes from the select control', () => {
    const { props } = renderTopbar()

    fireEvent.change(screen.getByRole('combobox', { name: 'Shell:' }), {
      target: { value: 'zsh' },
    })

    expect(props.onShellChange).toHaveBeenCalledWith('zsh')
  })

  it('calls onToggleTheme when the theme button is clicked', () => {
    const { props } = renderTopbar()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))

    expect(props.onToggleTheme).toHaveBeenCalledTimes(1)
  })

  it('exposes accessible names for the icon buttons and shell select', () => {
    renderTopbar()

    expect(screen.getByRole('button', { name: 'Toggle grid' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shortcuts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Shell:' })).toBeInTheDocument()
  })
})
