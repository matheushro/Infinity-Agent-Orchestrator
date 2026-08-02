import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Modal shell to avoid its focus-trap machinery; we only care about the
// fields and the confirm/cancel wiring here.
vi.mock('@renderer/components/ui', async () => {
  const actual = await vi.importActual<typeof import('@renderer/components/ui')>(
    '@renderer/components/ui',
  )

  function MockModal({
    title,
    onClose,
    children,
  }: {
    title: string
    onClose: () => void
    children: ReactNode
  }): JSX.Element {
    useEffect(() => {
      function onKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        {children}
      </div>
    )
  }

  return { ...actual, Modal: MockModal }
})

import { DEFAULT_TERMINAL_STYLE, FONT_FAMILY_OPTIONS } from '../types'
import {
  TerminalSettingsModal,
  createDraft,
  type TerminalSettingsDraft,
} from './TerminalSettingsModal'

const PROMPT_PLACEHOLDER = "Markdown instructions that define this agent's role…"

// The model picker reads the user's catalog through the db bridge.
const catalog = [
  { id: 'm-1', agent: 'claude', value: 'opus', label: 'Opus' },
  { id: 'm-2', agent: 'claude', value: 'sonnet', label: 'Sonnet' },
  { id: 'm-3', agent: 'codex', value: 'gpt-5.4', label: 'gpt-5.4' },
]

const EDIT_DRAFT: TerminalSettingsDraft = {
  name: 'Reviewer',
  folder: '/home/user/repo',
  command: 'claude',
  model: 'opus',
  prompt: 'You are a reviewer.',
  style: { theme: 'light', fontFamily: FONT_FAMILY_OPTIONS[2].value, fontSize: 18 },
}

function renderModal(
  mode: 'create' | 'edit' = 'create',
  initial: TerminalSettingsDraft = createDraft(''),
) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  render(
    <TerminalSettingsModal
      mode={mode}
      initial={initial}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )

  return { onConfirm, onCancel }
}

/** Suggestions currently offered by the model field's datalist. */
function suggestions(): string[] {
  return Array.from(document.querySelectorAll('datalist option')).map(
    (o) => o.getAttribute('value') ?? '',
  )
}

/** The catalog loads asynchronously — wait for it before touching the field. */
async function waitForCatalog(agent = 'claude'): Promise<void> {
  const expected = catalog.filter((m) => m.agent === agent).map((m) => m.value)
  await waitFor(() => expect(suggestions()).toEqual(expected))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.dialogApi = { selectFolder: vi.fn() }
  window.dbApi = {
    listModels: vi.fn().mockResolvedValue(catalog),
    upsertModel: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),
  } as unknown as typeof window.dbApi
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.dialogApi
})

describe('TerminalSettingsModal — one dialog for everything', () => {
  it('offers name, folder, agent, model, prompt and style in a single dialog', async () => {
    renderModal()
    await waitForCatalog()

    expect(screen.getByPlaceholderText('Terminal name (optional)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('No folder selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Select/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Claude Code/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(PROMPT_PLACEHOLDER)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Font' })).toBeInTheDocument()
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  describe('create mode', () => {
    it('launches the terminal with the agent prompt already set', async () => {
      const { onConfirm } = renderModal('create', createDraft('/home/user/project'))

      fireEvent.change(screen.getByPlaceholderText(PROMPT_PLACEHOLDER), {
        target: { value: 'You are a reviewer.' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Open' }))

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: '/home/user/project',
          command: 'claude',
          prompt: 'You are a reviewer.',
        }),
      )
    })

    it('confirms name, agent, model and style together', async () => {
      const { onConfirm } = renderModal('create', createDraft('/home/user/project'))
      await waitForCatalog()

      fireEvent.change(screen.getByPlaceholderText('Terminal name (optional)'), {
        target: { value: '  Repo terminal  ' },
      })
      fireEvent.click(screen.getByRole('button', { name: /Codex/ }))
      fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
        target: { value: 'gpt-5.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
      fireEvent.change(screen.getByRole('slider'), { target: { value: '20' } })
      fireEvent.click(screen.getByRole('button', { name: 'Open' }))

      expect(onConfirm).toHaveBeenCalledWith({
        name: 'Repo terminal',
        folder: '/home/user/project',
        command: 'codex',
        model: 'gpt-5.5',
        prompt: '',
        style: { ...DEFAULT_TERMINAL_STYLE, theme: 'dark', fontSize: 20 },
      })
      // A model typed by hand joins the catalog for the next terminal.
      expect(window.dbApi.upsertModel).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'codex', value: 'gpt-5.5' }),
      )
    })

    it('keeps the confirm button disabled until a folder is chosen', () => {
      renderModal('create', createDraft(''))

      expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled()
    })

    it('populates the folder from the picker', async () => {
      vi.mocked(window.dialogApi.selectFolder).mockResolvedValueOnce('/picked/folder')
      renderModal('create', createDraft(''))

      fireEvent.click(screen.getByRole('button', { name: /Select/ }))

      await waitFor(() => {
        expect(screen.getByDisplayValue('/picked/folder')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled()
      })
    })

    it('leaves the name empty so the caller can derive one from agent + folder', () => {
      const { onConfirm } = renderModal('create', createDraft('/home/user/project'))

      fireEvent.change(screen.getByPlaceholderText('Terminal name (optional)'), {
        target: { value: '   ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Open' }))

      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: '' }))
    })
  })

  describe('edit mode', () => {
    it('pre-fills every field from the terminal', async () => {
      renderModal('edit', EDIT_DRAFT)
      await waitForCatalog()

      expect(screen.getByRole('heading', { name: 'Terminal · Reviewer' })).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Terminal name')).toHaveValue('Reviewer')
      expect(screen.getByDisplayValue('/home/user/repo')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('opus')
      expect(screen.getByPlaceholderText(PROMPT_PLACEHOLDER)).toHaveValue('You are a reviewer.')
      expect(screen.getByRole('button', { name: 'Font' })).toHaveTextContent(
        FONT_FAMILY_OPTIONS[2].label,
      )
      expect(screen.getByRole('slider')).toHaveValue('18')
      expect(screen.getByRole('button', { name: 'Light' })).toHaveStyle({
        background: 'var(--bg)',
      })
    })

    it('labels the confirm button so the restart is not a surprise', () => {
      renderModal('edit', EDIT_DRAFT)

      expect(screen.getByRole('button', { name: 'Save & restart' })).toBeInTheDocument()
    })

    it('confirms the edited prompt, agent and style in one save', async () => {
      const { onConfirm } = renderModal('edit', EDIT_DRAFT)
      await waitForCatalog()

      fireEvent.change(screen.getByPlaceholderText(PROMPT_PLACEHOLDER), {
        target: { value: 'You are now a tester.' },
      })
      fireEvent.change(screen.getByPlaceholderText('Terminal name'), {
        target: { value: 'Tester' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save & restart' }))

      expect(onConfirm).toHaveBeenCalledWith({
        name: 'Tester',
        folder: '/home/user/repo',
        command: 'claude',
        model: 'opus',
        prompt: 'You are now a tester.',
        style: { ...EDIT_DRAFT.style, theme: 'auto' },
      })
    })

    it('keeps the current name when the field is cleared', () => {
      const { onConfirm } = renderModal('edit', EDIT_DRAFT)

      fireEvent.change(screen.getByPlaceholderText('Terminal name'), { target: { value: '  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save & restart' }))

      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Reviewer' }))
    })

    it('allows clearing the prompt back to none', () => {
      const { onConfirm } = renderModal('edit', EDIT_DRAFT)

      fireEvent.change(screen.getByPlaceholderText(PROMPT_PLACEHOLDER), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save & restart' }))

      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ prompt: '' }))
    })

    it('unpins the model when it is cleared, registering nothing', async () => {
      const { onConfirm } = renderModal('edit', EDIT_DRAFT)
      await waitForCatalog()

      fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: '  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save & restart' }))

      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ model: '' }))
      expect(window.dbApi.upsertModel).not.toHaveBeenCalled()
    })

    it('reverts the style to the app defaults from Reset style', () => {
      const { onConfirm } = renderModal('edit', EDIT_DRAFT)

      fireEvent.click(screen.getByRole('button', { name: 'Reset style' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save & restart' }))

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ style: DEFAULT_TERMINAL_STYLE }),
      )
    })
  })

  it('suggests only the registered models of the selected agent', async () => {
    renderModal('create', createDraft('/home/user/project'))
    await waitForCatalog('claude')

    fireEvent.click(screen.getByRole('button', { name: /Codex/ }))
    await waitFor(() => expect(suggestions()).toEqual(['gpt-5.4']))
  })

  it('resets the pin when changing agents, since a model is agent-specific', async () => {
    const { onConfirm } = renderModal('edit', EDIT_DRAFT)
    await waitForCatalog('claude')

    fireEvent.click(screen.getByRole('button', { name: /Codex/ }))

    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Save & restart' }))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'codex', model: '' }),
    )
  })

  it('hides the model field entirely for a plain terminal', async () => {
    renderModal('create', createDraft('/home/user/project'))
    await waitForCatalog()

    fireEvent.click(screen.getByRole('button', { name: /^⌨️Terminal$/ }))

    expect(screen.queryByRole('combobox', { name: 'Model' })).not.toBeInTheDocument()
  })

  it('cancels from the button and from Escape without confirming', () => {
    const { onConfirm, onCancel } = renderModal('edit', EDIT_DRAFT)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
