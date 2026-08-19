// The note body: a single always-Markdown surface (Obsidian Live Preview).
// It renders while you type and reveals raw syntax only under the caret — there
// is no plain-text mode to fall back to.
import { forwardRef, useImperativeHandle } from 'react'
import type { NoteViewMode } from '@shared/types/notes'
import { useMarkdownEditor, type MarkdownEditorHandle } from '../hooks/useMarkdownEditor'

interface MarkdownEditorProps {
  value: string
  /** Only an editing note takes keystrokes; a resting note still renders. */
  editable: boolean
  /** Rendered live preview, or the Markdown text itself. */
  mode: NoteViewMode
  placeholder: string
  onChange: (value: string) => void
  onEscape: () => void
  onBlur: (event: FocusEvent) => void
  /** Fired when a resting note is double-clicked, with the click position. */
  onRequestEdit: (coords: { x: number; y: number }) => void
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    { value, editable, mode, placeholder, onChange, onEscape, onBlur, onRequestEdit },
    ref,
  ) {
    const { containerRef, handle } = useMarkdownEditor({
      value,
      editable,
      mode,
      placeholder,
      onChange,
      onEscape,
      onBlur,
    })
    useImperativeHandle(ref, () => handle, [handle])

    return (
      <div
        ref={containerRef}
        className="note-live min-h-0 flex-1 overflow-hidden"
        // While editing, a click is text selection and stops here. At rest the
        // click has to reach the canvas router, which resolves it to selecting
        // the note (or picking a link source / deleting it).
        onMouseDown={(event) => {
          if (editable) event.stopPropagation()
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (!editable) onRequestEdit({ x: event.clientX, y: event.clientY })
        }}
      />
    )
  },
)
