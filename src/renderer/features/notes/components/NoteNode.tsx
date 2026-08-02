// A movable/resizable Markdown note on the canvas.
//
// The body is a single Obsidian-style Live Preview surface: the Markdown is
// always rendered — headings, bold, lists, checkboxes, tables — and typing a
// marker formats the text instantly. There is no "raw text" editing mode; the
// syntax of a construct is only revealed while the caret is inside it.
// Double-click still arms editing (the canvas needs plain clicks for
// select/link/delete); Esc or blur leaves editing and saves.
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { IClose, ICopy } from '@renderer/components/ui'
import type { NoteRecord } from '@shared/types/notes'
import type { CanvasTool } from '@renderer/features/canvas/components/Canvas'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import { useNoteSearch } from '../hooks/useNoteSearch'
import type { MarkdownEditorHandle } from '../hooks/useMarkdownEditor'
import { MarkdownEditor } from './MarkdownEditor'
import { NoteSearchBar } from './NoteSearchBar'

const EMPTY_PLACEHOLDER = 'Empty note — double-click to edit'
const EDITING_PLACEHOLDER = 'Write Markdown…'

interface NoteNodeProps {
  note: NoteRecord
  globalTheme: CanvasTheme
  selected: boolean
  editing: boolean
  scale: number
  /** Active canvas tool — drives link/delete-on-click behaviour. */
  tool?: CanvasTool
  /** Highlighted as the pending link source while the link tool is armed. */
  linkSource?: string | null
  searchOpen?: boolean
  searchRequestId?: number
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onDragStart: (id: string) => void
  onMove: (id: string, patch: Partial<NoteRecord>) => void
  onUpdate: (id: string, patch: Partial<NoteRecord>) => void
  onRemove: (id: string) => void
  onEditingComplete: () => void
  onContextMenu: (id: string, x: number, y: number) => void
  onSearchClose?: () => void
}

export const NoteNode = memo(function NoteNode({
  note,
  globalTheme,
  selected,
  editing,
  scale,
  tool = 'select',
  linkSource = null,
  searchOpen = false,
  searchRequestId = 0,
  onSelect,
  onEdit,
  onDragStart,
  onMove,
  onUpdate,
  onRemove,
  onEditingComplete,
  onContextMenu,
  onSearchClose = () => {},
}: NoteNodeProps): JSX.Element {
  const isLinking = tool === 'link'
  const isDelete = tool === 'delete'
  const isLinkSource = linkSource === note.id
  const resolvedTheme = note.theme === 'auto' ? globalTheme : note.theme
  const isDark = resolvedTheme === 'dark'
  const [text, setText] = useState(note.content)
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(note.title)
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const searchBarRef = useRef<HTMLDivElement | null>(null)
  const textRef = useRef(text)
  const finishingRef = useRef(false)
  textRef.current = text

  const search = useNoteSearch({
    open: searchOpen,
    requestId: searchRequestId,
    text,
    editorRef,
    onClose: onSearchClose,
  })

  // While editing, the editor owns the text; outside of it the record does (a
  // rehydrate or an edit from a linked agent must show up immediately).
  useEffect(() => {
    if (editing) return
    setText(note.content)
  }, [editing, note.content])

  useEffect(() => {
    if (editing) finishingRef.current = false
  }, [editing])

  const commitContent = useCallback(() => {
    if (finishingRef.current) return
    finishingRef.current = true
    if (textRef.current !== note.content) onUpdate(note.id, { content: textRef.current })
    onEditingComplete()
  }, [note.content, note.id, onUpdate, onEditingComplete])

  // Edits reach here from typing (while editing) and from toggling a task
  // checkbox (possible at rest too — that one saves straight away, since there
  // is no blur coming to commit it).
  const handleChange = useCallback(
    (next: string) => {
      setText(next)
      textRef.current = next
      if (!editing && next !== note.content) onUpdate(note.id, { content: next })
    },
    [editing, note.content, note.id, onUpdate],
  )

  const handleBlur = useCallback(
    (event: FocusEvent) => {
      // Clicking into the find bar must not end the edit.
      if (searchBarRef.current?.contains(event.relatedTarget as Node | null)) return
      commitContent()
    },
    [commitContent],
  )

  function commitTitle(): void {
    const next = draftTitle.trim() || note.title
    if (next !== note.title) onUpdate(note.id, { title: next })
    setDraftTitle(next)
    setEditingTitle(false)
  }

  return (
    <Rnd
      size={{ width: note.width, height: note.height }}
      position={{ x: note.x, y: note.y }}
      minWidth={160}
      minHeight={120}
      scale={scale}
      dragHandleClassName="note-node-header"
      disableDragging={editing || isLinking || isDelete}
      enableResizing={{
        top: true,
        right: true,
        bottom: true,
        left: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
        topLeft: true,
      }}
      onDragStart={() => {
        if (!selected) onSelect(note.id)
        onDragStart(note.id)
      }}
      onDrag={(_e, d) => onMove(note.id, { x: d.x, y: d.y })}
      onDragStop={(_e, d) => onUpdate(note.id, { x: d.x, y: d.y })}
      onResizeStart={() => onSelect(note.id)}
      onResize={(_e, _dir, ref, _delta, pos) =>
        onMove(note.id, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y,
        })
      }
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onUpdate(note.id, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y,
        })
      }
      onMouseDown={(event: React.MouseEvent) => {
        event.stopPropagation()
        // In link/delete mode every click must reach the canvas router (which
        // resolves it to a link pick or a removal), even if the note is already
        // selected — so don't gate the callback on `selected` here.
        if (isLinking || isDelete) {
          onSelect(note.id)
          return
        }
        if (!selected) onSelect(note.id)
      }}
      onContextMenu={(event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        onSelect(note.id)
        onContextMenu(note.id, event.clientX, event.clientY)
      }}
      className={
        'note-node overflow-hidden rounded-[12px] ' +
        (selected ? 'is-selected node-shadow-selected ' : 'node-shadow ') +
        (editing ? 'is-editing ' : '') +
        // Always emit an explicit palette class so a note can force `light` even
        // inside a `.dark` root (and vice-versa); a bare `dark`-only class would
        // leave a forced-light note inheriting the ancestor's dark variables.
        (isDark ? 'dark ' : 'light ')
      }
      style={{
        background: 'var(--node-bg)',
        border: isLinkSource ? '1px solid var(--accent)' : '1px solid var(--line)',
        boxShadow: isLinkSource
          ? '0 0 0 2px color-mix(in oklch, var(--accent) 40%, transparent)'
          : undefined,
        cursor: isLinking ? 'crosshair' : isDelete ? 'not-allowed' : undefined,
        zIndex: editing || selected ? 20 : 2,
      }}
    >
      <div className="flex h-full flex-col">
        <div
          className="note-node-header flex items-center gap-2 px-3 select-none"
          style={{
            height: 32,
            background: 'var(--node-head)',
            borderBottom: '1px solid var(--line)',
            cursor: editing ? 'default' : 'grab',
          }}
        >
          <div className="flex min-w-0 flex-1 items-center leading-none">
            {editingTitle ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle()
                  if (e.key === 'Escape') {
                    setDraftTitle(note.title)
                    setEditingTitle(false)
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 bg-transparent outline-none text-[12.5px] font-medium"
                style={{ color: 'var(--fg)' }}
              />
            ) : (
              <span
                className="text-[12.5px] font-medium truncate"
                style={{ color: 'var(--fg)' }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setDraftTitle(note.title)
                  setEditingTitle(true)
                }}
                title="Double-click to rename"
              >
                {note.title}
              </span>
            )}
          </div>

          <button
            className="icon-btn !w-6 !h-6"
            onClick={(e) => {
              e.stopPropagation()
              void navigator.clipboard.writeText(note.title)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Copy note name"
            aria-label="Copy note name"
          >
            <ICopy size={12} />
          </button>

          <button
            className="icon-btn !w-6 !h-6"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(note.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Delete note"
            aria-label="Delete note"
          >
            <IClose size={12} />
          </button>
        </div>

        {searchOpen && (
          <NoteSearchBar
            containerRef={searchBarRef}
            inputRef={search.inputRef}
            query={search.query}
            matchCount={search.matchCount}
            currentIndex={search.currentIndex}
            onQueryChange={search.setQuery}
            onNext={search.next}
            onPrevious={search.previous}
            onClose={search.close}
          />
        )}

        <MarkdownEditor
          ref={editorRef}
          value={text}
          editable={editing}
          placeholder={editing ? EDITING_PLACEHOLDER : EMPTY_PLACEHOLDER}
          onChange={handleChange}
          onEscape={commitContent}
          onBlur={handleBlur}
          onRequestEdit={(coords) => {
            onEdit(note.id)
            editorRef.current?.focusAt(coords)
          }}
        />
      </div>
    </Rnd>
  )
})
