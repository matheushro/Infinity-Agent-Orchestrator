// Owns the CodeMirror instance behind a note body: creation, teardown, and the
// three things React needs to drive it (value, editability, focus).
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
import { liveMarkdown, setSearchMatches } from '../lib/livePreview'
import type { TextMatch } from '../lib/noteSearch'

interface UseMarkdownEditorOptions {
  value: string
  editable: boolean
  placeholder: string
  onChange: (value: string) => void
  onEscape: () => void
  onBlur: (event: FocusEvent) => void
}

export interface MarkdownEditorHandle {
  /** Focus the editor, optionally placing the caret under a screen point. */
  focusAt: (coords?: { x: number; y: number }) => void
  /** Paint "find in note" matches and scroll the active one into view. */
  showSearchMatches: (matches: TextMatch[], activeIndex: number) => void
  /** True when `node` lives inside the editor DOM. */
  contains: (node: Node | null) => boolean
}

export function useMarkdownEditor({
  value,
  editable,
  placeholder,
  onChange,
  onEscape,
  onBlur,
}: UseMarkdownEditorOptions): {
  containerRef: React.RefObject<HTMLDivElement>
  handle: MarkdownEditorHandle
} {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const modeRef = useRef(new Compartment())
  const pendingFocusRef = useRef<{ x: number; y: number } | null>(null)
  // Callbacks are read through a ref so the view is created exactly once —
  // rebuilding it on every render would drop the caret and undo history.
  const callbacksRef = useRef({ onChange, onEscape, onBlur })
  callbacksRef.current = { onChange, onEscape, onBlur }

  const applyFocus = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    view.focus()
    const coords = pendingFocusRef.current
    pendingFocusRef.current = null
    if (!coords) return
    const pos = view.posAtCoords(coords)
    if (pos != null) view.dispatch({ selection: { anchor: pos } })
  }, [])

  useLayoutEffect(() => {
    const parent = containerRef.current
    if (!parent) return

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          liveMarkdown(),
          Prec.highest(
            keymap.of([
              {
                key: 'Escape',
                run: () => {
                  callbacksRef.current.onEscape()
                  return true
                },
              },
            ]),
          ),
          modeRef.current.of([
            EditorView.editable.of(editable),
            placeholderExt(placeholder),
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacksRef.current.onChange(update.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            blur: (event) => {
              callbacksRef.current.onBlur(event)
              return false
            },
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
    // Mount-only: `value`/`editable`/`placeholder` are pushed in by the effects
    // below, never by recreating the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push external content in (rehydration, another agent editing the note),
  // but never fight the user: an identical doc is left untouched.
  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
    })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: modeRef.current.reconfigure([
        EditorView.editable.of(editable),
        placeholderExt(placeholder),
      ]),
    })
    if (editable) requestAnimationFrame(applyFocus)
  }, [editable, placeholder, applyFocus])

  const handle = useRef<MarkdownEditorHandle>({
    focusAt: (coords) => {
      pendingFocusRef.current = coords ?? null
      if (viewRef.current?.state.facet(EditorView.editable)) applyFocus()
    },
    showSearchMatches: (matches, activeIndex) => {
      const view = viewRef.current
      if (!view) return
      const active = matches[activeIndex]
      const inRange = active && active.end <= view.state.doc.length
      view.dispatch({
        effects: [
          setSearchMatches.of({ matches, activeIndex }),
          ...(inRange ? [EditorView.scrollIntoView(active.start, { y: 'center' })] : []),
        ],
        ...(inRange ? { selection: { anchor: active.start, head: active.end } } : {}),
      })
    },
    contains: (node) => Boolean(node && viewRef.current?.dom.contains(node)),
  }).current

  return { containerRef, handle }
}
