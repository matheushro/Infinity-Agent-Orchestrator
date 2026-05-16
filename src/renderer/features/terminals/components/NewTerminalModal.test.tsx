import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/components/ui', async () => {
  const actual = await vi.importActual<typeof import('@renderer/components/ui')>(
    '@renderer/components/ui',
  )

  function MockModal({
    title,
    onClose,
    children,
    className = '',
  }: {
    title: string
    onClose: () => void
    children: ReactNode
    className?: string
  }): JSX.Element {
    useEffect(() => {
      function onKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') onClose()
      }

      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
      <div data-testid="modal" className={className}>
        <h2>{title}</h2>
        {children}
      </div>
    )
  }

  return {
    ...actual,
    Modal: MockModal,
  }
})

import { NewTerminalModal } from './NewTerminalModal'

function renderModal() {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()

  render(<NewTerminalModal onCancel={onCancel} onConfirm={onConfirm} />)

  return { onCancel, onConfirm }
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

describe('NewTerminalModal', () => {
  it('renders folder, command, and name controls', () => {
    renderModal()

    expect(screen.getByPlaceholderText('Terminal name (optional)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('No folder selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Select/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Codex/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Claude Code/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /GitHub Copilot/ })).toBeInTheDocument()
  })

  it('calls selectFolder and populates the folder input', async () => {
    const selectedFolder = '/home/user/projects/iao'
    vi.mocked(window.dialogApi.selectFolder).mockResolvedValueOnce(selectedFolder)

    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /Select/ }))

    await waitFor(() => {
      expect(window.dialogApi.selectFolder).toHaveBeenCalledTimes(1)
      expect(screen.getByDisplayValue(selectedFolder)).toBeInTheDocument()
    })
  })

  it('keeps the confirm button disabled until a folder is selected', () => {
    renderModal()

    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled()
  })

  it('calls onConfirm with the current folder, command, and trimmed name', async () => {
    const selectedFolder = '/home/user/projects/iao'
    vi.mocked(window.dialogApi.selectFolder).mockResolvedValueOnce(selectedFolder)
    const { onConfirm } = renderModal()

    fireEvent.change(screen.getByPlaceholderText('Terminal name (optional)'), {
      target: { value: '  Repo terminal  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Select/ }))

    await waitFor(() => {
      expect(screen.getByDisplayValue(selectedFolder)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Codex/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(selectedFolder, 'codex', 'Repo terminal')
  })

  it('calls onCancel from the cancel button', () => {
    const { onCancel } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('forwards Escape to onCancel through the modal shell contract', () => {
    const { onCancel } = renderModal()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('updates the command selection between claude and codex', () => {
    renderModal()

    const claudeButton = screen.getByRole('button', { name: /Claude Code/ })
    const codexButton = screen.getByRole('button', { name: /Codex/ })
    const copilotButton = screen.getByRole('button', { name: /GitHub Copilot/ })

    expect(claudeButton.style.border).toBe('1px solid var(--accent)')
    expect(codexButton.style.border).toBe('1px solid var(--line-2)')
    expect(copilotButton.style.border).toBe('1px solid var(--line-2)')

    fireEvent.click(copilotButton)

    expect(copilotButton.style.border).toBe('1px solid var(--accent)')
    expect(claudeButton.style.border).toBe('1px solid var(--line-2)')
    expect(codexButton.style.border).toBe('1px solid var(--line-2)')
  })
})
