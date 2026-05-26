import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from './SettingsModal'

const defaultProps = {
  theme: 'dark' as const,
  defaultShell: 'default' as const,
  defaultProjectFolder: '',
  onThemeChange: vi.fn(),
  onDefaultShellChange: vi.fn(),
  onDefaultProjectFolderChange: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  window.dialogApi = {
    selectFolder: vi.fn(),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete window.dialogApi
})

describe('SettingsModal', () => {
  it('renders the default project folder setting', () => {
    render(<SettingsModal {...defaultProps} />)

    expect(screen.getByText('Default project folder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('No default folder selected')).toBeInTheDocument()
  })

  it('selects and stores a default project folder', async () => {
    vi.mocked(window.dialogApi.selectFolder).mockResolvedValueOnce('/home/user/project')
    render(<SettingsModal {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: /Select/ }))

    await waitFor(() => {
      expect(window.dialogApi.selectFolder).toHaveBeenCalledTimes(1)
      expect(defaultProps.onDefaultProjectFolderChange).toHaveBeenCalledWith(
        '/home/user/project',
      )
    })
  })

  it('clears the default project folder when one is set', () => {
    render(
      <SettingsModal
        {...defaultProps}
        defaultProjectFolder="/home/user/project"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(defaultProps.onDefaultProjectFolderChange).toHaveBeenCalledWith('')
  })
})
