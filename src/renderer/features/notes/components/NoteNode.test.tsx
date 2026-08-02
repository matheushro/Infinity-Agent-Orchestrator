import '@testing-library/jest-dom/vitest'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, type CSSProperties, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import type { NoteRecord } from '@shared/types/notes'

const mocks = vi.hoisted(() => {
  const rndInstances: Array<Record<string, unknown>> = []
  const Rnd = vi.fn((props: Record<string, unknown> & { children: ReactNode }) => (
    <div
      data-testid="note-root"
      className={String(props.className ?? '')}
      style={props.style as CSSProperties}
      onMouseDown={props.onMouseDown as React.MouseEventHandler}
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
  theme: 'auto',
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
    globalTheme: 'dark' as const,
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

/** The note body's CodeMirror instance. */
function editor(): EditorView {
  const dom = document.querySelector('.note-live') as HTMLElement
  const view = EditorView.findFromDOM(dom)
  if (!view) throw new Error('note editor not mounted')
  return view
}

/** What the note actually shows — hidden Markdown syntax is not in the DOM. */
function visibleText(): string {
  return (document.querySelector('.note-live .cm-content') as HTMLElement).textContent ?? ''
}

/** Type into the note the way a keystroke would: a change plus a caret move. */
function type(text: string, at = editor().state.doc.length): void {
  act(() => {
    editor().dispatch({
      changes: { from: at, insert: text },
      selection: { anchor: at + text.length },
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rndInstances.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NoteNode', () => {
  it('renders the note as live Markdown, with the syntax itself hidden', () => {
    const { container } = renderNode({
      note: { ...baseNote, content: '# Title\n\n**bold** and *italic*\n\n- item\n\n> quote' },
    })

    expect(screen.getByText('My note')).toBeInTheDocument()
    expect(container.querySelector('.cm-md-h1')).toHaveTextContent('Title')
    expect(container.querySelector('.cm-md-strong')).toHaveTextContent('bold')
    expect(container.querySelector('.cm-md-em')).toHaveTextContent('italic')
    expect(container.querySelector('.cm-md-bullet')).toBeInTheDocument()
    expect(container.querySelector('.cm-md-quote')).toHaveTextContent('quote')
    // The markers are gone from the rendering, but never from the document.
    expect(visibleText()).not.toMatch(/[#*>]/)
    expect(editor().state.doc.toString()).toContain('**bold**')
  })

  it('never falls back to a plain-text editor when editing starts', () => {
    const { container } = renderNode({ note: { ...baseNote, content: '# Title' }, editing: true })

    expect(container.querySelector('textarea')).toBeNull()
    expect(container.querySelector('.cm-md-h1')).toHaveTextContent('Title')
  })

  it('formats Markdown instantly as it is typed', () => {
    const { container } = renderNode({ note: { ...baseNote, content: '' }, editing: true })

    type('## Sec')
    expect(container.querySelector('.cm-md-h2')).toHaveTextContent('Sec')

    type('\n\n**strong**')
    expect(container.querySelector('.cm-md-strong')).toHaveTextContent('strong')

    type('\n\n- [ ] todo')
    expect(container.querySelector('input[type="checkbox"]')).toBeInTheDocument()
  })

  it('reveals the raw syntax of the construct under the caret only', () => {
    const { container } = renderNode({
      note: { ...baseNote, content: '**one** and **two**' },
      editing: true,
    })

    act(() => {
      editor().dispatch({ selection: { anchor: 4 } })
    })

    // `**one**` is being edited so it shows its markers; `**two**` stays rendered.
    expect(visibleText()).toBe('**one** and two')
    expect(container.querySelectorAll('.cm-md-strong')).toHaveLength(2)
  })

  it('shows a placeholder for empty notes', () => {
    const { container } = renderNode()
    expect(container.querySelector('.cm-placeholder')).toHaveTextContent(/Empty note/i)
  })

  it('follows the canvas theme when note theme is auto', () => {
    const { container } = renderNode({
      globalTheme: 'dark',
      note: { ...baseNote, theme: 'auto' },
    })

    expect(container.querySelector('.note-node')).toHaveClass('dark')
  })

  it('forces its own light theme when configured explicitly', () => {
    const { container } = renderNode({
      globalTheme: 'dark',
      note: { ...baseNote, theme: 'light' },
    })

    const node = container.querySelector('.note-node')
    expect(node).toHaveClass('light')
    expect(node).not.toHaveClass('dark')
  })

  it('copies the note name from the header', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderNode()

    fireEvent.click(screen.getByRole('button', { name: 'Copy note name' }))

    expect(writeText).toHaveBeenCalledWith(baseNote.title)
  })

  it('enters edit mode when the body is double-clicked', () => {
    const onEdit = vi.fn()
    const { container } = renderNode({ note: { ...baseNote, content: 'hello' }, onEdit })

    fireEvent.doubleClick(container.querySelector('.note-live') as HTMLElement)
    expect(onEdit).toHaveBeenCalledWith('note-1')
  })

  it('lets a click on a resting body reach the canvas, but not while editing', () => {
    const onSelect = vi.fn()
    const { container, rerender, props } = renderNode({
      note: { ...baseNote, content: 'text' },
      onSelect,
    })

    fireEvent.mouseDown(container.querySelector('.note-live') as HTMLElement)
    expect(onSelect).toHaveBeenCalledWith('note-1')

    onSelect.mockClear()
    rerender(<NoteNode {...props} selected editing />)
    fireEvent.mouseDown(container.querySelector('.note-live') as HTMLElement)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('commits the edited Markdown on Escape', () => {
    const onUpdate = vi.fn()
    const onEditingComplete = vi.fn()
    renderNode({
      note: { ...baseNote, content: '# raw' },
      editing: true,
      onUpdate,
      onEditingComplete,
    })

    type(' changed')
    fireEvent.keyDown(document.querySelector('.cm-content') as HTMLElement, { key: 'Escape' })

    expect(onUpdate).toHaveBeenCalledWith('note-1', { content: '# raw changed' })
    expect(onEditingComplete).toHaveBeenCalled()
  })

  it('commits content on blur', () => {
    const onUpdate = vi.fn()
    renderNode({ note: { ...baseNote, content: 'a' }, editing: true, onUpdate })

    type('b')
    fireEvent.blur(document.querySelector('.cm-content') as HTMLElement)

    expect(onUpdate).toHaveBeenCalledWith('note-1', { content: 'ab' })
  })

  it('highlights and navigates search matches without leaving edit mode', async () => {
    const onEditingComplete = vi.fn()
    renderNode({
      note: { ...baseNote, content: 'alpha beta alpha' },
      editing: true,
      searchOpen: true,
      searchRequestId: 1,
      onEditingComplete,
    })

    const searchInput = screen.getByRole('textbox', { name: 'Find in note' })
    fireEvent.change(searchInput, { target: { value: 'alpha' } })

    await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument())
    expect(document.querySelectorAll('.cm-md-search')).toHaveLength(2)
    expect(document.querySelector('.cm-md-search-active')).toHaveTextContent('alpha')
    expect(editor().state.selection.main.from).toBe(0)
    expect(onEditingComplete).not.toHaveBeenCalled()

    fireEvent.keyDown(searchInput, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('2/2')).toBeInTheDocument())
    expect(editor().state.selection.main.from).toBe(11)
    expect(onEditingComplete).not.toHaveBeenCalled()
  })

  it('searches a resting note too', async () => {
    renderNode({
      note: { ...baseNote, content: 'alpha beta' },
      searchOpen: true,
      searchRequestId: 1,
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Find in note' }), {
      target: { value: 'beta' },
    })

    await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument())
    expect(document.querySelector('.cm-md-search-active')).toHaveTextContent('beta')
  })

  it('closes search with Escape and returns control to the selected note', () => {
    const onSearchClose = vi.fn()
    renderNode({ searchOpen: true, searchRequestId: 1, onSearchClose })

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Find in note' }), {
      key: 'Escape',
    })

    expect(onSearchClose).toHaveBeenCalledTimes(1)
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

  it('toggles a task checkbox on a resting note and saves the Markdown', () => {
    const onUpdate = vi.fn()
    renderNode({ note: { ...baseNote, content: '- [ ] first\n- [x] second' }, onUpdate })

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)

    fireEvent.click(checkboxes[0])
    expect(onUpdate).toHaveBeenCalledWith('note-1', { content: '- [x] first\n- [x] second' })
  })

  it('toggles the task that was clicked, under StrictMode', () => {
    // Regression guard: the checkbox rewrites the document range it was built
    // from, so a stale or double-mounted widget would toggle the wrong task.
    const onUpdate = vi.fn()
    render(
      <StrictMode>
        <NoteNode
          note={{ ...baseNote, content: '- [ ] first\n- [ ] second' }}
          globalTheme="dark"
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

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)

    fireEvent.click(checkboxes[1])
    expect(onUpdate).toHaveBeenCalledWith('note-1', { content: '- [ ] first\n- [x] second' })
  })

  it('renders a GFM table as a block', async () => {
    const { container } = renderNode({
      note: { ...baseNote, content: '| a | b |\n| - | - |\n| 1 | 2 |' },
    })

    await waitFor(() =>
      expect(container.querySelector('.cm-md-block table')).toBeInTheDocument(),
    )
    expect(container.querySelector('.cm-md-block')).toHaveTextContent('1')
  })

  it('re-renders when the record content changes outside of editing', async () => {
    const { rerender, props, container } = renderNode({
      note: { ...baseNote, content: '# Before' },
    })
    expect(container.querySelector('.cm-md-h1')).toHaveTextContent('Before')

    rerender(<NoteNode {...props} note={{ ...props.note, content: '# After' }} />)

    await waitFor(() => expect(container.querySelector('.cm-md-h1')).toHaveTextContent('After'))
  })

  it('keeps the editor instance across unrelated re-renders', () => {
    const { rerender, props } = renderNode({ note: { ...baseNote, content: '# Heading' } })
    const before = editor()

    rerender(<NoteNode {...props} scale={2} selected />)

    expect(editor()).toBe(before)
  })

  it('removes the note when the delete button is clicked', () => {
    const onRemove = vi.fn()
    renderNode({ onRemove })

    fireEvent.click(screen.getByRole('button', { name: /delete note/i }))
    expect(onRemove).toHaveBeenCalledWith('note-1')
  })
})
