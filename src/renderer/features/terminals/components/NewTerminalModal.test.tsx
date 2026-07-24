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

function renderModal(defaultFolder = '') {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()

  render(
    <NewTerminalModal
      defaultFolder={defaultFolder}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  )

  return { onCancel, onConfirm }
}

// The model picker reads the user's catalog through the db bridge.
const catalog = [
  { id: 'm-1', agent: 'claude', value: 'opus', label: 'Opus' },
  { id: 'm-2', agent: 'claude', value: 'sonnet', label: 'Sonnet' },
  { id: 'm-3', agent: 'codex', value: 'gpt-5.4', label: 'gpt-5.4' },
]

/** Suggestions currently offered by the model field's datalist. */
function suggestions(): string[] {
  return Array.from(document.querySelectorAll('datalist option')).map((o) =>
    o.getAttribute('value') ?? '',
  )
}

/** The catalog loads asynchronously — wait for it before touching the field. */
async function waitForCatalog(agent = 'claude'): Promise<void> {
  const expected = catalog.filter((m) => m.agent === agent).map((m) => m.value)
  await waitFor(() => expect(suggestions()).toEqual(expected))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.dialogApi = {
    selectFolder: vi.fn(),
  }
  window.dbApi = {
    listModels: vi.fn().mockResolvedValue(catalog),
    upsertModel: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),
  } as unknown as typeof window.dbApi
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
    expect(screen.getByRole('button', { name: /Gemini/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /GitHub Copilot/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Code/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cursor CLI/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Terminal/ })).toBeInTheDocument()
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

  it('prefills the folder from the default project folder and enables Open', () => {
    const defaultFolder = '/home/user/projects/default'
    const { onConfirm } = renderModal(defaultFolder)

    expect(screen.getByDisplayValue(defaultFolder)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onConfirm).toHaveBeenCalledWith(defaultFolder, 'claude', '', 'auto', '')
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
    expect(onConfirm).toHaveBeenCalledWith(selectedFolder, 'codex', 'Repo terminal', 'auto', '')
  })

  it('forwards the selected theme to onConfirm', async () => {
    const selectedFolder = '/home/user/projects/iao'
    vi.mocked(window.dialogApi.selectFolder).mockResolvedValueOnce(selectedFolder)
    const { onConfirm } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: /Select/ }))

    await waitFor(() => {
      expect(screen.getByDisplayValue(selectedFolder)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onConfirm).toHaveBeenCalledWith(selectedFolder, 'claude', '', 'dark', '')
  })

  it('suggests only the registered models of the selected agent', async () => {
    renderModal('/home/user/projects/default')

    await waitForCatalog('claude')

    fireEvent.click(screen.getByRole('button', { name: /Codex/ }))
    await waitFor(() => expect(suggestions()).toEqual(['gpt-5.4']))
  })

  it('forwards a model picked from the catalog without re-registering it', async () => {
    const defaultFolder = '/home/user/projects/default'
    const { onConfirm } = renderModal(defaultFolder)
    await waitForCatalog()

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'opus' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onConfirm).toHaveBeenCalledWith(defaultFolder, 'claude', '', 'auto', 'opus')
    expect(window.dbApi.upsertModel).not.toHaveBeenCalled()
  })

  it('registers a model typed by hand, so the next terminal offers it', async () => {
    const defaultFolder = '/home/user/projects/default'
    const { onConfirm } = renderModal(defaultFolder)
    await waitForCatalog()

    fireEvent.click(screen.getByRole('button', { name: /Codex/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'gpt-5.5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onConfirm).toHaveBeenCalledWith(defaultFolder, 'codex', '', 'auto', 'gpt-5.5')
    expect(window.dbApi.upsertModel).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'codex', value: 'gpt-5.5', label: 'gpt-5.5' }),
    )
  })

  it('resets the pin when changing agents, since a model is agent-specific', async () => {
    const defaultFolder = '/home/user/projects/default'
    const { onConfirm } = renderModal(defaultFolder)
    await waitForCatalog()

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'opus' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Codex/ }))

    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onConfirm).toHaveBeenCalledWith(defaultFolder, 'codex', '', 'auto', '')
  })

  it('hides the model field entirely for a plain terminal', async () => {
    renderModal('/home/user/projects/default')
    await waitForCatalog()

    fireEvent.click(screen.getByRole('button', { name: /^⌨️Terminal$/ }))

    expect(screen.queryByRole('combobox', { name: 'Model' })).not.toBeInTheDocument()
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
    const geminiButton = screen.getByRole('button', { name: /Gemini/ })
    const copilotButton = screen.getByRole('button', { name: /GitHub Copilot/ })

    expect(claudeButton.style.border).toBe('1px solid var(--accent)')
    expect(codexButton.style.border).toBe('1px solid var(--line-2)')
    expect(geminiButton.style.border).toBe('1px solid var(--line-2)')
    expect(copilotButton.style.border).toBe('1px solid var(--line-2)')

    fireEvent.click(geminiButton)

    expect(geminiButton.style.border).toBe('1px solid var(--accent)')
    expect(claudeButton.style.border).toBe('1px solid var(--line-2)')
    expect(codexButton.style.border).toBe('1px solid var(--line-2)')
    expect(copilotButton.style.border).toBe('1px solid var(--line-2)')
  })
})
