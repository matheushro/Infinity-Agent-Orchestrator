import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createTextRanges, findTextMatches } from '../lib/noteSearch'
import type { TextMatch } from '../lib/noteSearch'

const MATCH_HIGHLIGHT = 'note-search-match'
const ACTIVE_HIGHLIGHT = 'note-search-active'

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void
  delete: (name: string) => void
}

type HighlightConstructor = new (...ranges: Range[]) => unknown

interface UseNoteSearchOptions {
  open: boolean
  requestId: number
  editing: boolean
  text: string
  textareaRef: RefObject<HTMLTextAreaElement>
  previewRef: RefObject<HTMLDivElement>
  onClose: () => void
}

interface UseNoteSearchResult {
  query: string
  setQuery: (query: string) => void
  currentIndex: number
  matchCount: number
  matches: TextMatch[]
  inputRef: RefObject<HTMLInputElement>
  next: () => void
  previous: () => void
  close: () => void
}

function getHighlightApi(): {
  registry: HighlightRegistry
  HighlightClass: HighlightConstructor
} | null {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)
    ?.highlights
  const HighlightClass = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight
  return registry && HighlightClass ? { registry, HighlightClass } : null
}

function clearHighlights(): void {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)
    ?.highlights
  registry?.delete(MATCH_HIGHLIGHT)
  registry?.delete(ACTIVE_HIGHLIGHT)
}

function revealTextareaMatch(textarea: HTMLTextAreaElement, start: number, end: number): void {
  textarea.setSelectionRange(start, end)
  const line = textarea.value.slice(0, start).split('\n').length - 1
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 20
  const targetTop = line * lineHeight
  const viewportPadding = Math.max(textarea.clientHeight / 3, lineHeight)

  if (targetTop < textarea.scrollTop || targetTop > textarea.scrollTop + textarea.clientHeight) {
    textarea.scrollTop = Math.max(0, targetTop - viewportPadding)
  }
}

function revealRange(range: Range): void {
  const element =
    range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement
  element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

export function useNoteSearch({
  open,
  requestId,
  editing,
  text,
  textareaRef,
  previewRef,
  onClose,
}: UseNoteSearchOptions): UseNoteSearchResult {
  const [query, setQueryState] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [matchCount, setMatchCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const editorMatches = useMemo(
    () => (open && editing ? findTextMatches(text, query) : []),
    [open, editing, text, query],
  )

  useEffect(() => {
    if (!open) {
      setQueryState('')
      setCurrentIndex(-1)
      setMatchCount(0)
      return
    }

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open, requestId])

  useLayoutEffect(() => {
    clearHighlights()
    if (!open || !query) {
      setMatchCount(0)
      setCurrentIndex(-1)
      return
    }

    if (editing) {
      const matches = editorMatches
      const nextIndex = matches.length === 0 ? -1 : Math.min(Math.max(currentIndex, 0), matches.length - 1)
      setMatchCount(matches.length)
      if (nextIndex !== currentIndex) setCurrentIndex(nextIndex)
      const active = matches[nextIndex]
      if (active && textareaRef.current) {
        revealTextareaMatch(textareaRef.current, active.start, active.end)
      }
      return
    }

    const preview = previewRef.current
    if (!preview) return
    const ranges = createTextRanges(preview, query)
    const nextIndex = ranges.length === 0 ? -1 : Math.min(Math.max(currentIndex, 0), ranges.length - 1)
    setMatchCount(ranges.length)
    if (nextIndex !== currentIndex) setCurrentIndex(nextIndex)

    const highlightApi = getHighlightApi()
    if (highlightApi && ranges.length > 0) {
      highlightApi.registry.set(MATCH_HIGHLIGHT, new highlightApi.HighlightClass(...ranges))
      const active = ranges[nextIndex]
      if (active) {
        highlightApi.registry.set(ACTIVE_HIGHLIGHT, new highlightApi.HighlightClass(active))
      }
    }

    const active = ranges[nextIndex]
    if (active) revealRange(active)

    return clearHighlights
  }, [open, query, currentIndex, editing, text, textareaRef, previewRef, editorMatches])

  const setQuery = useCallback((nextQuery: string) => {
    setQueryState(nextQuery)
    setCurrentIndex(nextQuery ? 0 : -1)
  }, [])

  const next = useCallback(() => {
    if (matchCount === 0) return
    setCurrentIndex((index) => (index + 1) % matchCount)
  }, [matchCount])

  const previous = useCallback(() => {
    if (matchCount === 0) return
    setCurrentIndex((index) => (index <= 0 ? matchCount - 1 : index - 1))
  }, [matchCount])

  const close = useCallback(() => {
    clearHighlights()
    onClose()
    requestAnimationFrame(() => {
      if (editing) textareaRef.current?.focus()
      else previewRef.current?.focus()
    })
  }, [editing, onClose, previewRef, textareaRef])

  return {
    query,
    setQuery,
    currentIndex,
    matchCount,
    matches: editorMatches,
    inputRef,
    next,
    previous,
    close,
  }
}
