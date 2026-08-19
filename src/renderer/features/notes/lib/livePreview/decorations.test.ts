import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { liveMarkdown, livePreviewField, renderMode } from './index'
import { TableWidget } from './tableWidget'
import { BulletWidget, CheckboxWidget, RuleWidget } from './widgets'

interface FlatDecoration {
  from: number
  to: number
  class?: string
  widget?: unknown
  block?: boolean
}

/**
 * The decorations a document produces. `cursor` is a document offset; leaving
 * it out models a note that is not being edited (no caret, nothing revealed).
 */
function decorationsOf(doc: string, cursor?: number): FlatDecoration[] {
  const state = EditorState.create({
    doc,
    selection: cursor === undefined ? undefined : EditorSelection.cursor(cursor),
    extensions: [
      EditorView.editable.of(cursor !== undefined),
      liveMarkdown(),
      renderMode('preview'),
    ],
  })
  const flat: FlatDecoration[] = []
  state.field(livePreviewField).decorations.between(0, doc.length, (from, to, value) => {
    flat.push({
      from,
      to,
      class: (value.spec as { class?: string }).class,
      widget: (value.spec as { widget?: unknown }).widget,
      block: (value.spec as { block?: boolean }).block,
    })
  })
  return flat
}

const classesOf = (decorations: FlatDecoration[]): string[] =>
  decorations.flatMap((decoration) => (decoration.class ? [decoration.class] : []))

/** A `Decoration.replace({})` with no widget — the "hide this syntax" marker. */
const hidden = (decorations: FlatDecoration[]): Array<[number, number]> =>
  decorations
    .filter((decoration) => decoration.class === undefined && decoration.widget === undefined)
    .map((decoration) => [decoration.from, decoration.to])

describe('live preview decorations', () => {
  it('renders a heading and hides its # marker while the caret is away', () => {
    const decorations = decorationsOf('# Title')

    expect(classesOf(decorations)).toContain('cm-md-heading cm-md-h1')
    expect(hidden(decorations)).toEqual([[0, 2]])
  })

  it('reveals the # marker when the caret is on the heading line', () => {
    const decorations = decorationsOf('# Title', 4)

    expect(classesOf(decorations)).toContain('cm-md-heading cm-md-h1')
    expect(hidden(decorations)).toEqual([])
  })

  it('keeps every marker hidden in a note that is not being edited', () => {
    // The resting selection sits at offset 0; without the editable check that
    // would un-render the first construct of every note on the canvas.
    expect(hidden(decorationsOf('# Title'))).toEqual([[0, 2]])
  })

  it('styles emphasis and hides its markers', () => {
    const decorations = decorationsOf('**bold** and *soft*')

    expect(classesOf(decorations)).toEqual(
      expect.arrayContaining(['cm-md-strong', 'cm-md-em']),
    )
    expect(hidden(decorations)).toEqual([
      [0, 2],
      [6, 8],
      [13, 14],
      [18, 19],
    ])
  })

  it('reveals only the construct under the caret', () => {
    const decorations = decorationsOf('**bold** and *soft*', 4)

    // The `**` pair is revealed, the `*` pair further along stays hidden.
    expect(hidden(decorations)).toEqual([
      [13, 14],
      [18, 19],
    ])
  })

  it('hides the code marks of an inline code span', () => {
    const decorations = decorationsOf('a `code` b')

    expect(classesOf(decorations)).toContain('cm-md-code')
    expect(hidden(decorations)).toEqual([
      [2, 3],
      [7, 8],
    ])
  })

  it('shows only the label of a link', () => {
    const decorations = decorationsOf('[label](https://example.com)')

    expect(classesOf(decorations)).toContain('cm-md-link')
    // `[`, `]`, `(`, the URL and `)` all collapse; `label` survives.
    expect(hidden(decorations)).toEqual([
      [0, 1],
      [6, 7],
      [7, 8],
      [8, 27],
      [27, 28],
    ])
  })

  it('replaces a bullet marker with a rendered bullet', () => {
    const decorations = decorationsOf('- item')

    expect(decorations.some((decoration) => decoration.widget instanceof BulletWidget)).toBe(true)
  })

  it('renders a task list as a checkbox and drops its bullet', () => {
    const decorations = decorationsOf('- [x] done')
    const checkbox = decorations.find(
      (decoration) => decoration.widget instanceof CheckboxWidget,
    )

    expect((checkbox?.widget as CheckboxWidget).checked).toBe(true)
    expect(hidden(decorations)).toEqual([[0, 2]])
  })

  it('keeps the checkbox rendered while the caret is on the task line', () => {
    const decorations = decorationsOf('- [ ] todo', 8)

    expect(decorations.some((decoration) => decoration.widget instanceof CheckboxWidget)).toBe(true)
  })

  it('renders a horizontal rule as a block widget', () => {
    const decorations = decorationsOf('a\n\n---\n\nb')
    const rule = decorations.find((decoration) => decoration.widget instanceof RuleWidget)

    expect(rule?.block).toBe(true)
    expect(rule?.from).toBe(3)
    expect(rule?.to).toBe(6)
  })

  it('renders a table as an editable block widget, caret or no caret', () => {
    const table = '| a | b |\n| - | - |\n| 1 | 2 |'
    const widgetOf = (cursor?: number): TableWidget =>
      decorationsOf(table, cursor).find(
        (decoration) => decoration.widget instanceof TableWidget,
      )?.widget as TableWidget

    expect(widgetOf().source).toBe(table)
    expect(widgetOf().editable).toBe(false)
    // Unlike every other construct, a table stays rendered under the caret —
    // its cells are the editor, so there is no raw-pipe fallback to reveal.
    expect(widgetOf(2).editable).toBe(true)
    expect(
      decorationsOf(table).find((decoration) => decoration.widget instanceof TableWidget)?.block,
    ).toBe(true)
  })

  it('leaves pipes that are not yet a table as plain text', () => {
    const decorations = decorationsOf('| a | b |\n| x | y |')

    expect(decorations.some((decoration) => decoration.widget instanceof TableWidget)).toBe(false)
  })

  it('renders nothing but plain text in Markdown source mode', () => {
    const state = EditorState.create({
      doc: '# Title',
      extensions: [EditorView.editable.of(true), liveMarkdown(), renderMode('source')],
    })

    expect(() => state.field(livePreviewField)).toThrow()
  })

  it('hides the ``` fence lines of a code block', () => {
    const decorations = decorationsOf('```\ncode\n```')
    const blocks = decorations.filter((decoration) => decoration.block)

    expect(blocks.map((block) => [block.from, block.to])).toEqual([
      [0, 3],
      [9, 12],
    ])
    expect(classesOf(decorations)).toContain('cm-md-code-line')
  })

  it('hides the > marker of a blockquote and marks the line', () => {
    const decorations = decorationsOf('> quoted')

    expect(classesOf(decorations)).toContain('cm-md-quote')
    expect(hidden(decorations)).toEqual([[0, 2]])
  })

  it('registers widgets as atomic so the caret steps over them', () => {
    const state = EditorState.create({
      doc: '- [ ] task',
      extensions: [EditorView.editable.of(true), liveMarkdown(), renderMode('preview')],
    })
    const atomic: Array<[number, number]> = []
    state.field(livePreviewField).atomic.between(0, 10, (from, to) => {
      atomic.push([from, to])
    })

    expect(atomic).toEqual([[2, 5]])
  })
})
