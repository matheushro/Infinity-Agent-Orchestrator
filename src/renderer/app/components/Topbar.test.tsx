import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Topbar } from './Topbar'

const setFullScreenMock = vi.fn(async (value: boolean) => value)
const isFullScreenMock = vi.fn(async () => false)
const onFullScreenChangeMock = vi.fn(() => () => undefined)

beforeEach(() => {
  setFullScreenMock.mockReset()
  setFullScreenMock.mockImplementation(async (value: boolean) => value)
  isFullScreenMock.mockReset()
  isFullScreenMock.mockResolvedValue(false)
  onFullScreenChangeMock.mockReset()
  onFullScreenChangeMock.mockImplementation(() => () => undefined)
  ;(globalThis as { window: typeof window }).window.windowApi = {
    isFullScreen: isFullScreenMock,
    setFullScreen: setFullScreenMock,
    onFullScreenChange: onFullScreenChangeMock,
  }
})

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

    expect(screen.getByRole('button', { name: 'Enter full screen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Shell:' })).toBeInTheDocument()
  })

  it('toggles full screen via the window bridge when the fullscreen button is clicked', async () => {
    renderTopbar()

    fireEvent.click(screen.getByRole('button', { name: 'Enter full screen' }))

    expect(setFullScreenMock).toHaveBeenCalledWith(true)
  })
})
