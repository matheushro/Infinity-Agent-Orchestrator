// "Find in note" bar. Pure presentation over the state owned by useNoteSearch.
import type { RefObject } from 'react'
import { IChevDown, IClose, ISearch } from '@renderer/components/ui'

interface NoteSearchBarProps {
  containerRef: RefObject<HTMLDivElement>
  inputRef: RefObject<HTMLInputElement>
  query: string
  matchCount: number
  currentIndex: number
  onQueryChange: (query: string) => void
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
}

export function NoteSearchBar({
  containerRef,
  inputRef,
  query,
  matchCount,
  currentIndex,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: NoteSearchBarProps): JSX.Element {
  return (
    <div
      ref={containerRef}
      className="note-search flex h-9 shrink-0 items-center gap-1.5 px-2"
      style={{ background: 'var(--node-head)', borderBottom: '1px solid var(--line)' }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ISearch size={13} style={{ color: 'var(--fg-3)' }} aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (event.shiftKey) onPrevious()
            else onNext()
          }
        }}
        placeholder="Find in note"
        aria-label="Find in note"
        className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
        style={{ color: 'var(--fg)' }}
      />
      <span
        className="min-w-[42px] text-right text-[10.5px] tabular-nums"
        style={{
          color: matchCount === 0 && query ? 'var(--traffic-close)' : 'var(--fg-3)',
        }}
        aria-live="polite"
      >
        {!query ? '' : matchCount === 0 ? '0/0' : `${currentIndex + 1}/${matchCount}`}
      </span>
      <button
        type="button"
        className="icon-btn !h-6 !w-6"
        onClick={onPrevious}
        disabled={matchCount === 0}
        title="Previous result (Shift+Enter)"
        aria-label="Previous result"
      >
        <IChevDown size={12} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <button
        type="button"
        className="icon-btn !h-6 !w-6"
        onClick={onNext}
        disabled={matchCount === 0}
        title="Next result (Enter)"
        aria-label="Next result"
      >
        <IChevDown size={12} />
      </button>
      <button
        type="button"
        className="icon-btn !h-6 !w-6"
        onClick={onClose}
        title="Close search (Escape)"
        aria-label="Close search"
      >
        <IClose size={11} />
      </button>
    </div>
  )
}
