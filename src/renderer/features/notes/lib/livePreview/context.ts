// Shared context + range helpers for the Obsidian-style live-preview decorator.
//
// The Obsidian rule we implement: Markdown syntax is *always* rendered, and the
// raw markers (`#`, `**`, `` ` ``, `[]()`, `>` …) are only revealed while the
// selection touches the construct they belong to. That way the document you
// type into is still plain Markdown — nothing is ever converted to a separate
// "source mode".
import type { EditorState, Range } from '@codemirror/state'
import type { Decoration } from '@codemirror/view'

export interface DecorationContext {
  state: EditorState
  /**
   * Whether the cursor may reveal raw markers. False when the editor is not
   * editable (the note is not being edited) — a stale selection at offset 0
   * must not un-render the first heading of every note on the canvas.
   */
  reveal: boolean
  /**
   * Whether the note is being edited. Same source as `reveal`, but asked for a
   * different reason: interactive widgets (the table) only take input while the
   * note is in edit mode.
   */
  editable: boolean
  /** Add a styling/hiding decoration. */
  add: (range: Range<Decoration>) => void
  /**
   * Add a decoration that replaces text with a widget. Widget ranges are also
   * registered as atomic so arrow keys step over them instead of parking the
   * caret inside an invisible range.
   */
  addWidget: (range: Range<Decoration>) => void
}

/** Handlers return 'skip' to stop the tree walk from descending into children. */
export type NodeDecorator = 'skip' | void

/** True when a selection range touches `[from, to]` (inclusive on both ends). */
function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from)
}

/** Start/end offsets of the whole lines spanned by `[from, to]`. */
export function lineSpan(state: EditorState, from: number, to: number): { from: number; to: number } {
  return {
    from: state.doc.lineAt(from).from,
    // `to` can sit on the line break that ends the block; step back one char so
    // we do not swallow the following line.
    to: state.doc.lineAt(Math.max(from, to - 1)).to,
  }
}

/** True when a selection range touches any line spanned by `[from, to]`. */
function selectionTouchesLines(state: EditorState, from: number, to: number): boolean {
  const span = lineSpan(state, from, to)
  return selectionTouches(state, span.from, span.to)
}

/** True when the construct must show its raw Markdown markers. */
export function isRevealed(ctx: DecorationContext, from: number, to: number): boolean {
  return ctx.reveal && selectionTouches(ctx.state, from, to)
}

/** Same, but the whole line counts as the construct (headings, quotes, lists). */
export function isLineRevealed(ctx: DecorationContext, from: number, to: number): boolean {
  return ctx.reveal && selectionTouchesLines(ctx.state, from, to)
}

/** Extend `pos` past the spaces that separate a marker from its content. */
export function skipSpaces(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos)
  let end = pos
  while (end < line.to && state.doc.sliceString(end, end + 1) === ' ') end += 1
  return end
}
