import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from './SettingsModal'

const defaultProps = {
  theme: 'dark' as const,
  defaultShell: 'default' as const,
  defaultProjectFolder: '',
  maxWorkspaces: 5,
  onThemeChange: vi.fn(),
  onDefaultShellChange: vi.fn(),
  onDefaultProjectFolderChange: vi.fn(),
  onMaxWorkspacesChange: vi.fn(),
  onManageModels: vi.fn(),
  onBackupImported: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  window.dialogApi = {
    selectFolder: vi.fn(),
  }
  window.backupApi = {
    exportToFile: vi.fn(),
    importFromFile: vi.fn(),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete window.dialogApi
  delete window.backupApi
})

describe('SettingsModal', () => {
  it('opens the model catalog editor from the Models section', () => {
    render(<SettingsModal {...defaultProps} />)

    expect(screen.getByText('Models')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Manage models/ }))

    expect(defaultProps.onManageModels).toHaveBeenCalledTimes(1)
    // Opening the editor is the parent's job — settings does not close itself.
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

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

  it('changes the default shell from the dropdown', () => {
    render(<SettingsModal {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'Default shell' }))
    fireEvent.click(screen.getByRole('option', { name: 'zsh' }))

    expect(defaultProps.onDefaultShellChange).toHaveBeenCalledWith('zsh')
  })

  it('commits the workspace limit on blur', () => {
    render(<SettingsModal {...defaultProps} />)

    const input = screen.getByLabelText('Workspace limit')

    fireEvent.change(input, { target: { value: '9' } })

    expect(defaultProps.onMaxWorkspacesChange).not.toHaveBeenCalled()

    fireEvent.blur(input)

    expect(defaultProps.onMaxWorkspacesChange).toHaveBeenCalledWith(9)
  })

  it('commits the workspace limit on enter', () => {
    render(<SettingsModal {...defaultProps} />)

    const input = screen.getByLabelText('Workspace limit')

    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(defaultProps.onMaxWorkspacesChange).toHaveBeenCalledWith(9)
  })

  it('exports a backup and shows the written path', async () => {
    vi.mocked(window.backupApi.exportToFile).mockResolvedValueOnce({
      canceled: false,
      path: '/home/user/iao-backup.json',
      counts: { workspaces: 1, terminals: 2, canvasTexts: 0, notes: 3, edges: 1, noteLinks: 1, models: 2 },
    })
    render(<SettingsModal {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: /Export data/ }))

    await waitFor(() => {
      expect(window.backupApi.exportToFile).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('status')).toHaveTextContent('/home/user/iao-backup.json')
    })
  })

  it('shows nothing when the export dialog is canceled', async () => {
    vi.mocked(window.backupApi.exportToFile).mockResolvedValueOnce({ canceled: true })
    render(<SettingsModal {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: /Export data/ }))

    await waitFor(() => expect(window.backupApi.exportToFile).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('imports a backup and notifies the app to reload', async () => {
    vi.mocked(window.backupApi.importFromFile).mockResolvedValueOnce({
      canceled: false,
      path: '/home/user/iao-backup.json',
      counts: { workspaces: 1, terminals: 2, canvasTexts: 0, notes: 3, edges: 1, noteLinks: 1, models: 2 },
    })
    render(<SettingsModal {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: /Import data/ }))

    await waitFor(() => {
      expect(window.backupApi.importFromFile).toHaveBeenCalledTimes(1)
      expect(defaultProps.onBackupImported).toHaveBeenCalledTimes(1)
    })
  })

  it('does not reload when the import dialog is canceled', async () => {
    vi.mocked(window.backupApi.importFromFile).mockResolvedValueOnce({ canceled: true })
    render(<SettingsModal {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: /Import data/ }))

    await waitFor(() => expect(window.backupApi.importFromFile).toHaveBeenCalledTimes(1))
    expect(defaultProps.onBackupImported).not.toHaveBeenCalled()
  })

  it('shows an error and does not reload when the import fails', async () => {
    vi.mocked(window.backupApi.importFromFile).mockRejectedValueOnce(
      new Error('Unsupported backup version: 99'),
    )
    render(<SettingsModal {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: /Import data/ }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Import failed/)
    })
    expect(defaultProps.onBackupImported).not.toHaveBeenCalled()
  })

  it('keeps focus while editing the workspace limit input', () => {
    render(<SettingsModal {...defaultProps} />)

    const input = screen.getByLabelText('Workspace limit') as HTMLInputElement

    input.focus()
    fireEvent.change(input, { target: { value: '' } })

    expect(input.value).toBe('')
    expect(input).toHaveFocus()
    expect(defaultProps.onMaxWorkspacesChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '12' } })

    expect(input.value).toBe('12')
    expect(input).toHaveFocus()
    expect(defaultProps.onMaxWorkspacesChange).not.toHaveBeenCalled()
  })
})
