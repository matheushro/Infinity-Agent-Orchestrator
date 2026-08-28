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
    onOpenReports: vi.fn(),
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

    rerender(<Topbar workspaceName="My Workspace" terminalCount={2} />)

    expect(screen.getByText('2 terminals')).toBeInTheDocument()
  })

  it('exposes accessible names for the fullscreen icon button', () => {
    renderTopbar()

    expect(screen.getByRole('button', { name: 'Enter full screen' })).toBeInTheDocument()
  })

  it('toggles full screen via the window bridge when the fullscreen button is clicked', async () => {
    renderTopbar()

    fireEvent.click(screen.getByRole('button', { name: 'Enter full screen' }))

    expect(setFullScreenMock).toHaveBeenCalledWith(true)
  })
})
