// "Find in note" highlighting, expressed as decorations over the same document
// the live preview renders — the note has a single surface now, so search no
// longer needs one strategy for the textarea and another for the preview.
import { StateEffect, StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import type { TextMatch } from '../noteSearch'

export interface SearchHighlightPayload {
  matches: TextMatch[]
  activeIndex: number
}

export const setSearchMatches = StateEffect.define<SearchHighlightPayload>()

const MATCH = Decoration.mark({ class: 'cm-md-search' })
const ACTIVE = Decoration.mark({ class: 'cm-md-search cm-md-search-active' })

function build(payload: SearchHighlightPayload, docLength: number): DecorationSet {
  const ranges: Range<Decoration>[] = []
  payload.matches.forEach((match, index) => {
    // The caller's text can lag the doc by a render; drop anything out of range
    // rather than letting CodeMirror throw on an invalid decoration.
    if (match.start >= match.end || match.end > docLength) return
    ranges.push((index === payload.activeIndex ? ACTIVE : MATCH).range(match.start, match.end))
  })
  return Decoration.set(ranges, true)
}

export const searchHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSearchMatches)) return build(effect.value, tr.state.doc.length)
    }
    return tr.docChanged ? value.map(tr.changes) : value
  },
  provide: (field) => EditorView.decorations.from(field),
})

export const searchHighlight: Extension = [searchHighlightField]
