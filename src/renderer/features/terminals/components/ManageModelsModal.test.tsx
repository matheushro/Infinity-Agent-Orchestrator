import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Modal shell to avoid its focus-trap machinery; we only care about
// the catalog list and its add/remove wiring here.
vi.mock('@renderer/components/ui', async () => {
  const actual = await vi.importActual<typeof import('@renderer/components/ui')>(
    '@renderer/components/ui',
  )

  function MockModal({ title, children }: { title: string; children: ReactNode }): JSX.Element {
    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        {children}
      </div>
    )
  }

  return { ...actual, Modal: MockModal }
})

import { ManageModelsModal } from './ManageModelsModal'

const GENERATED_ID = '00000000-0000-4000-8000-000000000000' as const

const catalog = [
  { id: 'm-1', agent: 'claude', value: 'opus', label: 'Opus' },
  { id: 'm-2', agent: 'claude', value: 'sonnet', label: 'Sonnet' },
  { id: 'm-3', agent: 'gemini', value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
]

function renderModal() {
  const onClose = vi.fn()
  render(<ManageModelsModal onClose={onClose} />)
  return { onClose }
}

/** Wait for the async catalog load to land. */
async function waitForCatalog(): Promise<void> {
  await waitFor(() => expect(screen.getByText('opus')).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(GENERATED_ID)
  window.dbApi = {
    listModels: vi.fn().mockResolvedValue(catalog),
    upsertModel: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),
  } as unknown as typeof window.dbApi
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ManageModelsModal', () => {
  it('lists the registered models grouped under their agent', async () => {
    renderModal()
    await waitForCatalog()

    expect(screen.getByText('sonnet')).toBeInTheDocument()
    expect(screen.getByText('gemini-2.5-pro')).toBeInTheDocument()
  })

  it('shows an empty state for an agent with nothing registered', async () => {
    renderModal()
    await waitForCatalog()

    // Codex ships no curated models, so its section starts empty.
    expect(screen.getAllByText('No models registered yet.').length).toBeGreaterThan(0)
  })

  it('offers no section for an agent that cannot be pinned to a model', async () => {
    renderModal()
    await waitForCatalog()

    expect(screen.queryByLabelText('New model for Terminal')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New model for Claude Code')).toBeInTheDocument()
  })

  it('registers a model typed into an agent section', async () => {
    renderModal()
    await waitForCatalog()

    fireEvent.change(screen.getByLabelText('New model for Codex'), {
      target: { value: 'gpt-5.4' },
    })
    fireEvent.click(within(codexSection()).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(window.dbApi.upsertModel).toHaveBeenCalledWith({
        id: GENERATED_ID,
        agent: 'codex',
        value: 'gpt-5.4',
        label: 'gpt-5.4',
      }),
    )
    expect(await screen.findByText('gpt-5.4')).toBeInTheDocument()
  })

  it('registers on Enter and clears the field', async () => {
    renderModal()
    await waitForCatalog()

    const field = screen.getByLabelText('New model for Codex')
    fireEvent.change(field, { target: { value: 'gpt-5.4' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    await waitFor(() => expect(field).toHaveValue(''))
    expect(window.dbApi.upsertModel).toHaveBeenCalledOnce()
  })

  it('keeps the Add button disabled while the field is blank', async () => {
    renderModal()
    await waitForCatalog()

    const add = within(codexSection()).getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()

    fireEvent.change(screen.getByLabelText('New model for Codex'), { target: { value: '  ' } })
    expect(add).toBeDisabled()
  })

  it('does not register a value the agent already has', async () => {
    renderModal()
    await waitForCatalog()

    fireEvent.change(screen.getByLabelText('New model for Claude Code'), {
      target: { value: 'OPUS' },
    })
    fireEvent.click(within(claudeSection()).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(screen.getByLabelText('New model for Claude Code')).toHaveValue(''),
    )
    expect(window.dbApi.upsertModel).not.toHaveBeenCalled()
    expect(screen.getAllByText(/^opus$/i)).toHaveLength(1)
  })

  it('removes a model from the catalog', async () => {
    renderModal()
    await waitForCatalog()

    fireEvent.click(screen.getByLabelText('Remove opus'))

    await waitFor(() => expect(window.dbApi.removeModel).toHaveBeenCalledWith('m-1'))
    expect(screen.queryByText('opus')).not.toBeInTheDocument()
    expect(screen.getByText('sonnet')).toBeInTheDocument()
  })

  it('closes from the Done button', async () => {
    const { onClose } = renderModal()
    await waitForCatalog()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

/** The section wrapping one agent's list — anchored on its "new model" field. */
function sectionFor(agentLabel: string): HTMLElement {
  const field = screen.getByLabelText(`New model for ${agentLabel}`)
  return field.closest('div')!.parentElement as HTMLElement
}

function codexSection(): HTMLElement {
  return sectionFor('Codex')
}

function claudeSection(): HTMLElement {
  return sectionFor('Claude Code')
}
