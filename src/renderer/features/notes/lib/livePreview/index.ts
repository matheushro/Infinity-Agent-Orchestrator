// Obsidian-style "Live Preview" for Markdown notes.
//
// One surface, always Markdown: the document is rendered as you type and the
// raw syntax of a construct is only revealed while the caret sits inside it.
// The rendering layer is swappable (`renderMode`) — a note can be flipped to
// show its Markdown text instead — but the document is the same either way.
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorView, keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { NoteViewMode } from '@shared/types/notes'
import { livePreviewDecorations } from './decorations'
import { searchHighlight } from './searchHighlight'
import { livePreviewTheme } from './theme'

/**
 * The stable part of a note's editing stack. It never gets reconfigured, so
 * undo history and the language parse survive a view-mode switch.
 */
export function liveMarkdown(): Extension {
  return [
    // `markdownLanguage` is the GFM dialect — tables, task lists, strikethrough
    // — matching the remark-gfm pipeline the note preview used before. Its
    // keymap keeps lists/quotes going when you press Enter.
    markdown({ base: markdownLanguage }),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    searchHighlight,
    livePreviewTheme,
  ]
}

/** Everything raw: no widgets, no hidden markers, monospace Markdown. */
const sourceMode: Extension = EditorView.contentAttributes.of({ class: 'cm-md-source' })

/** The swappable rendering layer, held in a compartment by the editor hook. */
export function renderMode(mode: NoteViewMode): Extension {
  return mode === 'source' ? sourceMode : livePreviewDecorations
}

export { livePreviewField } from './decorations'
export { setSearchMatches } from './searchHighlight'
