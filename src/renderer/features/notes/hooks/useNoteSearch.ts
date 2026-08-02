// "Find in note" over the live-preview editor.
//
// The note has a single Markdown surface now, so search has a single strategy:
// match the source text and hand the offsets to CodeMirror, which paints them
// and scrolls the active one into view.
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { findTextMatches } from '../lib/noteSearch'
import type { MarkdownEditorHandle } from './useMarkdownEditor'

interface UseNoteSearchOptions {
  open: boolean
  requestId: number
  /** Current note body — the same string the editor holds. */
  text: string
  editorRef: RefObject<MarkdownEditorHandle>
  onClose: () => void
}

interface UseNoteSearchResult {
  query: string
  setQuery: (query: string) => void
  currentIndex: number
  matchCount: number
  inputRef: RefObject<HTMLInputElement>
  next: () => void
  previous: () => void
  close: () => void
}

export function useNoteSearch({
  open,
  requestId,
  text,
  editorRef,
  onClose,
}: UseNoteSearchOptions): UseNoteSearchResult {
  const [query, setQueryState] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = open && query ? findTextMatches(text, query) : []
  const matchCount = matches.length
  // Clamp instead of resetting: typing another character usually keeps you on
  // the same region of the note.
  const activeIndex = matchCount === 0 ? -1 : Math.min(Math.max(currentIndex, 0), matchCount - 1)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open, requestId])

  useEffect(() => {
    if (!open) {
      setQueryState('')
      setCurrentIndex(-1)
    }
  }, [open])

  useEffect(() => {
    if (activeIndex !== currentIndex) setCurrentIndex(activeIndex)
    editorRef.current?.showSearchMatches(matches, activeIndex)
    // `matches` is rebuilt every render; the query/text/index triple is what
    // actually decides its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, text, activeIndex, currentIndex, editorRef])

  const setQuery = useCallback((nextQuery: string) => {
    setQueryState(nextQuery)
    setCurrentIndex(nextQuery ? 0 : -1)
  }, [])

  const next = useCallback(() => {
    setCurrentIndex((index) => (matchCount === 0 ? -1 : (index + 1) % matchCount))
  }, [matchCount])

  const previous = useCallback(() => {
    setCurrentIndex((index) => (matchCount === 0 ? -1 : index <= 0 ? matchCount - 1 : index - 1))
  }, [matchCount])

  const close = useCallback(() => {
    editorRef.current?.showSearchMatches([], -1)
    onClose()
    // Hand control back to the note being edited; a no-op at rest.
    editorRef.current?.focusAt()
  }, [editorRef, onClose])

  return { query, setQuery, currentIndex: activeIndex, matchCount, inputRef, next, previous, close }
}
