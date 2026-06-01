// A movable/resizable Markdown note on the canvas. Two states:
//  - view: header title + rendered Markdown (double-click body to edit)
//  - edit: raw Markdown <textarea> (Esc or blur leaves edit mode and saves)
// Task-list checkboxes stay interactive in view mode and rewrite the raw
// Markdown when toggled. Mirrors CanvasText's prop shape so Canvas wiring is
// identical to the text element.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { IClose } from '@renderer/components/ui'
import type { NoteRecord } from '@shared/types/notes'
import { toggleTaskAt } from '../lib/markdown'

// Hoisted so the array identity is stable across renders — a fresh `[remarkGfm]`
// literal would make react-markdown reprocess the document on every render.
const REMARK_PLUGINS = [remarkGfm]

interface NoteNodeProps {
  note: NoteRecord
  selected: boolean
  editing: boolean
  scale: number
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onDragStart: (id: string) => void
  onMove: (id: string, patch: Partial<NoteRecord>) => void
  onUpdate: (id: string, patch: Partial<NoteRecord>) => void
  onRemove: (id: string) => void
  onEditingComplete: () => void
  onContextMenu: (id: string, x: number, y: number) => void
}

export const NoteNode = memo(function NoteNode({
  note,
  selected,
  editing,
  scale,
  onSelect,
  onEdit,
  onDragStart,
  onMove,
  onUpdate,
  onRemove,
  onEditingComplete,
  onContextMenu,
}: NoteNodeProps): JSX.Element {
  const [draft, setDraft] = useState(note.content)
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(note.title)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const finishingRef = useRef(false)

  useEffect(() => {
    if (!editing) return
    finishingRef.current = false
    setDraft(note.content)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [editing, note.content])

  function commitContent(): void {
    if (finishingRef.current) return
    finishingRef.current = true
    if (draft !== note.content) onUpdate(note.id, { content: draft })
    onEditingComplete()
  }

  function commitTitle(): void {
    const next = draftTitle.trim() || note.title
    if (next !== note.title) onUpdate(note.id, { title: next })
    setDraftTitle(next)
    setEditingTitle(false)
  }

  // The Markdown components MUST be referentially stable: react-markdown uses
  // each override function as the rendered element's component *type*, so a
  // fresh object/closure per render makes React unmount+remount every checkbox
  // on each render. That remount mid-click (mousedown lands on the old node,
  // mouseup on the freshly-mounted one) means the browser never fires `click`,
  // so toggling silently did nothing. We keep one stable `markdownComponents`
  // and read the latest note/handler through a ref so the closures stay fresh.
  const latestRef = useRef({ id: note.id, content: note.content, onUpdate })
  latestRef.current = { id: note.id, content: note.content, onUpdate }

  const markdownComponents = useMemo<Components>(
    () => ({
      input: ({ node: _node, ...props }) => {
        if (props.type === 'checkbox') {
          return (
            <input
              type="checkbox"
              checked={Boolean(props.checked)}
              // The task index is derived at click time from the checkbox's
              // position among its siblings (DOM order == document order ==
              // toggleTaskAt's ordinals). Computing it during render with a
              // counter is impure and breaks under StrictMode's double render.
              onChange={(event) => {
                const container = event.currentTarget.closest('.note-markdown')
                const boxes = Array.from(
                  container?.querySelectorAll('input[type="checkbox"]') ?? [],
                )
                const index = boxes.indexOf(event.currentTarget)
                if (index < 0) return
                const { id, content, onUpdate: update } = latestRef.current
                update(id, { content: toggleTaskAt(content, index) })
              }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            />
          )
        }
        return <input {...props} />
      },
      // Render links as text-styled anchors but never let them navigate the app
      // window (no external-shell handling in step 1).
      a: ({ node: _node, children, ...props }) => (
        <a {...props} onClick={(event) => event.preventDefault()} rel="noreferrer">
          {children}
        </a>
      ),
    }),
    [],
  )

  return (
    <Rnd
      size={{ width: note.width, height: note.height }}
      position={{ x: note.x, y: note.y }}
      minWidth={160}
      minHeight={120}
      scale={scale}
      dragHandleClassName="note-node-header"
      disableDragging={editing}
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
        (editing ? 'is-editing ' : '')
      }
      style={{
        background: 'var(--node-bg)',
        border: '1px solid var(--line)',
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
              onRemove(note.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Delete note"
            aria-label="Delete note"
          >
            <IClose size={12} />
          </button>
        </div>

        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            placeholder="Write Markdown…"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitContent}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                commitContent()
              }
            }}
            className="note-editor min-h-0 flex-1 resize-none bg-transparent outline-none p-3 nice-scroll"
            style={{ color: 'var(--fg)' }}
          />
        ) : (
          <div
            className="note-markdown min-h-0 flex-1 overflow-auto p-3 nice-scroll"
            style={{ color: 'var(--fg)' }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              onEdit(note.id)
            }}
          >
            {note.content.trim() ? (
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
                {note.content}
              </ReactMarkdown>
            ) : (
              <span className="text-[12px]" style={{ color: 'var(--fg-3)' }}>
                Empty note — double-click to edit
              </span>
            )}
          </div>
        )}
      </div>
    </Rnd>
  )
})
