import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, cleanup } from '@testing-library/react'
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

beforeEach(() => {
  vi.clearAllMocks()
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

  it('pre-fills and forwards the pinned model unchanged', () => {
    const { onConfirm } = renderModal({ command: 'claude', model: 'opus' })

    expect(screen.getByRole('button', { name: 'Model' })).toHaveTextContent('Opus')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'opus' }),
    )
  })

  it('shows a free-text model field for an agent with volatile ids and forwards it', () => {
    const { onConfirm } = renderModal({ command: 'codex', model: '' })

    const field = screen.getByRole('textbox', { name: 'Model' })
    fireEvent.change(field, { target: { value: 'gpt-5.4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4' }))
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
