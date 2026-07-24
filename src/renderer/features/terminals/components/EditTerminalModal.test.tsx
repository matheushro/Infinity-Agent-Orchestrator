import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Modal shell to avoid its focus-trap machinery; we only care about
// the fields and the confirm/cancel wiring here.
vi.mock('@renderer/components/ui', async () => {
  const actual = await vi.importActual<typeof import('@renderer/components/ui')>(
    '@renderer/components/ui',
  )
  function MockModal({
    title,
    children,
  }: {
    title: string
    onClose: () => void
    children: ReactNode
  }): JSX.Element {
    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        {children}
      </div>
    )
  }
  return { ...actual, Modal: MockModal }
})

import type { CommandKey } from '../commands'
import { EditTerminalModal } from './EditTerminalModal'

function renderModal(
  overrides: { title?: string; prompt?: string; command?: CommandKey; model?: string } = {},
) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <EditTerminalModal
      title={overrides.title ?? 'Claude · repo'}
      prompt={overrides.prompt ?? 'old prompt'}
      command={overrides.command ?? 'claude'}
      model={overrides.model ?? ''}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  )
  return { onConfirm, onClose }
}

// The model picker reads the user's catalog through the db bridge.
const catalog = [
  { id: 'm-1', agent: 'claude', value: 'opus', label: 'Opus' },
  { id: 'm-2', agent: 'claude', value: 'sonnet', label: 'Sonnet' },
  { id: 'm-3', agent: 'codex', value: 'gpt-5.4', label: 'gpt-5.4' },
]

/** Suggestions currently offered by the model field's datalist. */
function suggestions(): string[] {
  return Array.from(document.querySelectorAll('datalist option')).map(
    (o) => o.getAttribute('value') ?? '',
  )
}

/** The catalog loads asynchronously — wait for it before touching the field. */
async function waitForCatalog(agent: string): Promise<void> {
  const expected = catalog.filter((m) => m.agent === agent).map((m) => m.value)
  await waitFor(() => expect(suggestions()).toEqual(expected))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.dbApi = {
    listModels: vi.fn().mockResolvedValue(catalog),
    upsertModel: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),
  } as unknown as typeof window.dbApi
})

afterEach(() => {
  cleanup()
})

describe('EditTerminalModal', () => {
  it('pre-fills the name and prompt fields with the current values', () => {
    renderModal({ title: 'Reviewer', prompt: 'You are a reviewer.' })

    expect(screen.getByPlaceholderText('Terminal name')).toHaveValue('Reviewer')
    expect(
      screen.getByPlaceholderText("Markdown instructions that define this agent's role…"),
    ).toHaveValue('You are a reviewer.')
  })

  it('confirms with the edited title and prompt, then closes', () => {
    const { onConfirm, onClose } = renderModal({ title: 'Reviewer', prompt: 'old' })

    fireEvent.change(
      screen.getByPlaceholderText("Markdown instructions that define this agent's role…"),
      { target: { value: 'You are now a tester.' } },
    )
    fireEvent.change(screen.getByPlaceholderText('Terminal name'), {
      target: { value: 'Tester' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith({
      title: 'Tester',
      prompt: 'You are now a tester.',
      model: '',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('falls back to the original title when the name is cleared', () => {
    const { onConfirm } = renderModal({ title: 'Reviewer', prompt: 'p' })

    fireEvent.change(screen.getByPlaceholderText('Terminal name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith({ title: 'Reviewer', prompt: 'p', model: '' })
  })

  it('allows clearing the prompt to an empty string', () => {
    const { onConfirm } = renderModal({ title: 'Reviewer', prompt: 'something' })

    fireEvent.change(
      screen.getByPlaceholderText("Markdown instructions that define this agent's role…"),
      { target: { value: '' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith({ title: 'Reviewer', prompt: '', model: '' })
  })

  it('pre-fills and forwards the pinned model unchanged', async () => {
    const { onConfirm } = renderModal({ command: 'claude', model: 'opus' })
    await waitForCatalog('claude')

    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('opus')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ model: 'opus' }))
    expect(window.dbApi.upsertModel).not.toHaveBeenCalled()
  })

  it('suggests only the registered models of this terminal’s agent', async () => {
    renderModal({ command: 'codex', model: '' })

    await waitForCatalog('codex')
  })

  it('registers a model typed by hand and forwards it', async () => {
    const { onConfirm } = renderModal({ command: 'codex', model: '' })
    await waitForCatalog('codex')

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'gpt-5.5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.5' }))
    expect(window.dbApi.upsertModel).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'codex', value: 'gpt-5.5', label: 'gpt-5.5' }),
    )
  })

  it('unpins the terminal when the model is cleared, registering nothing', async () => {
    const { onConfirm } = renderModal({ command: 'claude', model: 'opus' })
    await waitForCatalog('claude')

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ model: '' }))
    expect(window.dbApi.upsertModel).not.toHaveBeenCalled()
  })

  it('hides the model field entirely for an agent that cannot pin a model', () => {
    renderModal({ command: 'terminal' })

    expect(screen.queryByText('Model')).not.toBeInTheDocument()
  })

  it('cancel closes without confirming', () => {
    const { onConfirm, onClose } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
