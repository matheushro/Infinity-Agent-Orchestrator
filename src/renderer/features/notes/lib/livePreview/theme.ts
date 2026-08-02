// Visual language of the note editor. Everything is expressed with the app's
// CSS variables so a note follows the canvas theme (or forces its own) exactly
// like the old rendered preview did.
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const CODE_BG = 'color-mix(in oklch, var(--fg) 8%, transparent)'

export const livePreviewTheme: Extension = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'transparent',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.55',
    overflow: 'auto',
  },
  '.cm-content': {
    padding: '12px',
    caretColor: 'var(--fg)',
    wordBreak: 'break-word',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  '.cm-placeholder': { color: 'var(--fg-3)' },

  // ── Rendered Markdown ──────────────────────────────────────────────────
  '.cm-md-heading': { fontWeight: '600', lineHeight: '1.25' },
  '.cm-md-h1': { fontSize: '1.5em' },
  '.cm-md-h2': { fontSize: '1.3em' },
  '.cm-md-h3': { fontSize: '1.13em' },
  '.cm-md-h4, .cm-md-h5, .cm-md-h6': { fontSize: '1em' },
  '.cm-md-strong': { fontWeight: '600' },
  '.cm-md-em': { fontStyle: 'italic' },
  '.cm-md-strike': { textDecoration: 'line-through', color: 'var(--fg-3)' },
  '.cm-md-code': {
    fontFamily: MONO,
    fontSize: '0.88em',
    background: CODE_BG,
    borderRadius: '4px',
    padding: '0.12em 0.35em',
  },
  '.cm-md-link': { color: 'var(--accent)', textDecoration: 'underline' },
  '.cm-md-quote': {
    borderLeft: '3px solid var(--line)',
    paddingLeft: '0.85em',
    color: 'var(--fg-3)',
  },
  '.cm-md-code-line': {
    fontFamily: MONO,
    fontSize: '0.88em',
    background: CODE_BG,
    padding: '0 0.6em',
  },
  '.cm-md-table-source': { fontFamily: MONO, fontSize: '0.88em' },
  '.cm-md-bullet': { color: 'var(--fg-3)' },
  '.cm-md-rule': { padding: '0.4em 0' },
  '.cm-md-rule hr': { border: '0', borderTop: '1px solid var(--line)', margin: '0' },
  '.cm-md-image': { maxWidth: '100%', borderRadius: '6px', verticalAlign: 'middle' },
  '.cm-md-block': { margin: '0.3em 0', overflowX: 'auto' },

  // Task checkbox — same look as the old preview's checkbox.
  '.cm-md-task': {
    appearance: 'none',
    width: '15px',
    height: '15px',
    margin: '0 0.45em 0 0',
    verticalAlign: '-2px',
    border: '1.5px solid var(--fg-3)',
    borderRadius: '4px',
    background: 'var(--node-bg)',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.12s ease, border-color 0.12s ease',
  },
  '.cm-md-task:hover': { borderColor: 'var(--accent)' },
  '.cm-md-task:checked': { background: 'var(--accent)', borderColor: 'var(--accent)' },
  '.cm-md-task:checked::after': {
    content: '""',
    position: 'absolute',
    left: '4px',
    top: '1px',
    width: '4px',
    height: '8px',
    border: 'solid var(--node-bg)',
    borderWidth: '0 2px 2px 0',
    transform: 'rotate(45deg)',
  },

  // ── Find in note ───────────────────────────────────────────────────────
  '.cm-md-search': {
    background: 'color-mix(in oklch, var(--accent) 42%, transparent)',
    borderRadius: '2px',
  },
  '.cm-md-search-active': { background: 'var(--accent)', color: 'var(--accent-fg, #fff)' },
})
