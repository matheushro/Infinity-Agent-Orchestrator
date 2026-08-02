// Obsidian-style "Live Preview" for Markdown notes.
//
// One surface, always Markdown: the document is rendered as you type and the
// raw syntax of a construct is only revealed while the caret sits inside it.
// There is no separate plain-text editing mode.
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorView, keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { livePreviewDecorations } from './decorations'
import { searchHighlight } from './searchHighlight'
import { livePreviewTheme } from './theme'

/** The full editing stack for a note body. */
export function liveMarkdown(): Extension {
  return [
    // `markdownLanguage` is the GFM dialect — tables, task lists, strikethrough
    // — matching the remark-gfm pipeline the note preview used before. Its
    // keymap keeps lists/quotes going when you press Enter.
    markdown({ base: markdownLanguage }),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    livePreviewDecorations,
    searchHighlight,
    livePreviewTheme,
  ]
}

export { livePreviewField } from './decorations'
export { setSearchMatches } from './searchHighlight'
