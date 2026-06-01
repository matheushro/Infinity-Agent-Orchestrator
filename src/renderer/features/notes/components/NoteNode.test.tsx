import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, type CSSProperties, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteRecord } from '@shared/types/notes'

const mocks = vi.hoisted(() => {
  const rndInstances: Array<Record<string, unknown>> = []
  const Rnd = vi.fn((props: Record<string, unknown> & { children: ReactNode }) => (
    <div
      data-testid="note-root"
      className={String(props.className ?? '')}
      style={props.style as CSSProperties}
    >
      {props.children}
    </div>
  ))
  return { rndInstances, Rnd }
})

vi.mock('react-rnd', () => ({
  Rnd: (props: Record<string, unknown>) => {
    mocks.rndInstances.push(props)
    return mocks.Rnd(props as never)
  },
}))

import { NoteNode } from './NoteNode'

const baseNote: NoteRecord = {
  id: 'note-1',
  title: 'My note',
  content: '',
  x: 40,
  y: 50,
  width: 280,
  height: 200,
  workspace_id: 'ws-1',
  created_at: 1000,
  updated_at: 1000,
}

function renderNode(overrides: Partial<React.ComponentProps<typeof NoteNode>> = {}) {
  const props = {
    note: baseNote,
    selected: false,
    editing: false,
    scale: 1,
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onDragStart: vi.fn(),
    onMove: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onEditingComplete: vi.fn(),
    onContextMenu: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<NoteNode {...props} />) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rndInstances.length = 0
})

describe('NoteNode', () => {
  it('shows the title and renders Markdown content in view mode', async () => {
    renderNode({
      note: {
        ...baseNote,
        content: '# Title\n\n**bold** and *italic*\n\n- item\n\n`code`\n\n> quote',
      },
    })

    expect(screen.getByText('My note')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument())
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
    expect(screen.getByText('item').closest('li')).toBeInTheDocument()
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getByText('quote').closest('blockquote')).toBeInTheDocument()
  })

  it('shows a placeholder for empty notes', () => {
    renderNode()
    expect(screen.getByText(/Empty note/i)).toBeInTheDocument()
  })

  it('enters edit mode when the body is double-clicked', () => {
    const onEdit = vi.fn()
    renderNode({ note: { ...baseNote, content: 'hello' }, onEdit })

    fireEvent.doubleClick(screen.getByText('hello'))
    expect(onEdit).toHaveBeenCalledWith('note-1')
  })

  it('renders a textarea with the raw Markdown in edit mode and commits on Escape', () => {
    const onUpdate = vi.fn()
    const onEditingComplete = vi.fn()
    renderNode({
      note: { ...baseNote, content: '# raw' },
      editing: true,
      onUpdate,
      onEditingComplete,
    })

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('# raw')

    fireEvent.change(textarea, { target: { value: '# changed' } })
    fireEvent.keyDown(textarea, { key: 'Escape' })

    expect(onUpdate).toHaveBeenCalledWith('note-1', { content: '# changed' })
    expect(onEditingComplete).toHaveBeenCalled()
  })

  it('commits content on blur', () => {
    const onUpdate = vi.fn()
    renderNode({ note: { ...baseNote, content: 'a' }, editing: true, onUpdate })

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'b' } })
    fireEvent.blur(textarea)

    expect(onUpdate).toHaveBeenCalledWith('note-1', { content: 'b' })
  })

  it('renames the title inline on Enter', () => {
    const onUpdate = vi.fn()
    renderNode({ onUpdate })

    fireEvent.doubleClick(screen.getByText('My note'))
    const input = screen.getByDisplayValue('My note')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onUpdate).toHaveBeenCalledWith('note-1', { title: 'Renamed' })
  })

  it('toggles a task-list checkbox in view mode and rewrites the Markdown', async () => {
    const onUpdate = vi.fn()
    renderNode({ note: { ...baseNote, content: '- [ ] first\n- [x] second' }, onUpdate })

    const checkboxes = await screen.findAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)

    fireEvent.click(checkboxes[0])
    expect(onUpdate).toHaveBeenCalledWith('note-1', { content: '- [x] first\n- [x] second' })
  })

  it('keeps the same checkbox DOM node across re-renders (no remount mid-click)', async () => {
    // Regression: markdownComponents used to be rebuilt every render, so
    // react-markdown saw a new component type and remounted each checkbox on
    // every render. A remount between mousedown and mouseup cancels the native
    // `click`, so toggling a task did nothing in the real browser.
    const { rerender, props } = renderNode({
      note: { ...baseNote, content: '- [ ] first' },
      selected: false,
    })
    const before = await screen.findByRole('checkbox')

    rerender(<NoteNode {...props} selected />)
    const after = screen.getByRole('checkbox')

    expect(after).toBe(before)
  })

  it('toggles the correct task by DOM order under StrictMode (dev double-render)', async () => {
    // Regression: deriving the task index with a render-time counter
    // over-counts under React.StrictMode (dev runs render twice), so clicking
    // a checkbox toggled the wrong task — or none. The index must be computed
    // from DOM order at click time instead.
    const onUpdate = vi.fn()
    render(
      <StrictMode>
        <NoteNode
          note={{ ...baseNote, content: '- [ ] first\n- [ ] second' }}
          selected={false}
          editing={false}
          scale={1}
          onSelect={vi.fn()}
          onEdit={vi.fn()}
          onDragStart={vi.fn()}
          onMove={vi.fn()}
          onUpdate={onUpdate}
          onRemove={vi.fn()}
          onEditingComplete={vi.fn()}
          onContextMenu={vi.fn()}
        />
      </StrictMode>,
    )

    const checkboxes = await screen.findAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)

    fireEvent.click(checkboxes[1])
    expect(onUpdate).toHaveBeenCalledWith('note-1', { content: '- [ ] first\n- [x] second' })
  })

  it('removes the note when the delete button is clicked', () => {
    const onRemove = vi.fn()
    renderNode({ onRemove })

    fireEvent.click(screen.getByRole('button', { name: /delete note/i }))
    expect(onRemove).toHaveBeenCalledWith('note-1')
  })
})
