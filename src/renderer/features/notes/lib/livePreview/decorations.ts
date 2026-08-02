// Builds the live-preview decoration set for a document.
//
// This is a StateField (not a ViewPlugin) on purpose: block-level decorations —
// the rendered table and `---` widgets, and the hidden ``` fence lines — may
// only be provided from state, and a note is small enough to decorate whole.
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import {
  EditorState,
  RangeSet,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { blockDecorators } from './blocks'
import { inlineDecorators } from './inline'
import type { DecorationContext } from './context'

const PARSE_TIMEOUT_MS = 100

export interface LivePreview {
  decorations: DecorationSet
  /** Widget ranges, so the caret steps over them instead of hiding inside. */
  atomic: RangeSet<Decoration>
}

export function buildLivePreview(state: EditorState): LivePreview {
  const all: Range<Decoration>[] = []
  const widgets: Range<Decoration>[] = []
  const ctx: DecorationContext = {
    state,
    // A non-editable note keeps every marker hidden: its selection is stale
    // (offset 0) and would otherwise un-render the first construct of the doc.
    reveal: state.facet(EditorView.editable),
    add: (range) => all.push(range),
    addWidget: (range) => {
      all.push(range)
      widgets.push(range)
    },
  }

  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS) ?? syntaxTree(state)
  tree.iterate({
    enter: (node) => {
      const decorate = blockDecorators[node.name] ?? inlineDecorators[node.name]
      return decorate ? decorate(node, ctx) !== 'skip' : true
    },
  })

  return { decorations: Decoration.set(all, true), atomic: RangeSet.of(widgets, true) }
}

export const livePreviewField = StateField.define<LivePreview>({
  create: (state) => buildLivePreview(state),
  update(value, tr) {
    const editableChanged =
      tr.startState.facet(EditorView.editable) !== tr.state.facet(EditorView.editable)
    const selectionChanged = !tr.startState.selection.eq(tr.state.selection)
    const reparsed = syntaxTree(tr.startState) !== syntaxTree(tr.state)
    if (!tr.docChanged && !selectionChanged && !editableChanged && !reparsed) return value
    return buildLivePreview(tr.state)
  },
})

export const livePreviewDecorations: Extension = [
  livePreviewField,
  EditorView.decorations.from(livePreviewField, (value) => value.decorations),
  EditorView.atomicRanges.of((view) => view.state.field(livePreviewField).atomic),
]
