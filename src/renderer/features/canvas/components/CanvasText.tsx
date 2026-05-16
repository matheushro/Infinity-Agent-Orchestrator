// Movable, inline-editable free text on the canvas.
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import type { CanvasTextRecord } from '@shared/types/canvas'

interface CanvasTextProps {
  text: CanvasTextRecord
  selected: boolean
  editing: boolean
  scale: number
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onDragStart: (id: string) => void
  onMove: (id: string, patch: Partial<CanvasTextRecord>) => void
  onUpdate: (id: string, patch: Partial<CanvasTextRecord>) => void
  onRemove: (id: string) => void
  onEditingComplete: () => void
  onContextMenu: (id: string, x: number, y: number) => void
}

export const CanvasText = memo(function CanvasText({
  text,
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
}: CanvasTextProps): JSX.Element {
  const [draft, setDraft] = useState(text.text)
  const [draftSize, setDraftSize] = useState<{ width: number; height: number } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const finishingRef = useRef(false)
  const fontSize = getCanvasTextFontSize(text.width, text.height)

  useEffect(() => {
    if (!editing) return
    finishingRef.current = false
    setDraft(text.text)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [editing, text.text])

  useLayoutEffect(() => {
    if (!editing) {
      setDraftSize(null)
      return
    }
    const measured = measureRef.current
    if (!measured) return
    setDraftSize({
      width: Math.max(64, Math.ceil(measured.offsetWidth)),
      height: Math.max(28, Math.ceil(measured.offsetHeight)),
    })
  }, [editing, draft, fontSize])

  function commit(): void {
    if (finishingRef.current) return
    finishingRef.current = true
    const next = draft.trim()
    if (!next) {
      onRemove(text.id)
    } else {
      const measured = measureRef.current
      const size = draftSize ?? (measured
        ? {
            width: Math.max(64, Math.ceil(measured.offsetWidth)),
            height: Math.max(28, Math.ceil(measured.offsetHeight)),
          }
        : {
            width: Math.max(64, text.width),
            height: Math.max(28, text.height),
          })
      onUpdate(text.id, {
        text: next,
        width: size.width,
        height: size.height,
      })
    }
    onEditingComplete()
  }

  function cancel(): void {
    if (finishingRef.current) return
    finishingRef.current = true
    if (!text.text.trim()) onRemove(text.id)
    onEditingComplete()
  }

  return (
    <Rnd
      className={
        'canvas-text rounded-[8px] ' +
        (selected ? 'is-selected ' : '') +
        (editing ? 'is-editing ' : '')
      }
      size={
        editing && draftSize
          ? draftSize
          : { width: text.width, height: text.height }
      }
      position={{ x: text.x, y: text.y }}
      minWidth={1}
      minHeight={1}
      scale={scale}
      disableDragging={editing}
      enableResizing={{ bottomRight: true }}
      onDragStart={() => {
        onSelect(text.id)
        onDragStart(text.id)
      }}
      onDrag={(_event, data) => onMove(text.id, { x: data.x, y: data.y })}
      onDragStop={(_event, data) => onUpdate(text.id, { x: data.x, y: data.y })}
      onResize={(_event, _dir, ref, _delta, position) => {
        onMove(text.id, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: position.x,
          y: position.y,
        })
      }}
      onResizeStop={(_event, _dir, ref, _delta, position) => {
        onUpdate(text.id, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: position.x,
          y: position.y,
        })
      }}
      onMouseDown={(event: React.MouseEvent) => {
        event.stopPropagation()
        if (!selected) onSelect(text.id)
      }}
      onContextMenu={(event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        onSelect(text.id)
        onContextMenu(text.id, event.clientX, event.clientY)
      }}
      onDoubleClick={(event: React.MouseEvent) => {
        event.stopPropagation()
        onEdit(text.id)
      }}
      style={{
        background: 'transparent',
        boxShadow: editing || selected ? '0 0 0 1.5px var(--accent)' : 'none',
        cursor: editing ? 'text' : 'grab',
        zIndex: editing || selected ? 20 : 2,
      }}
    >
      {editing && (
        <span
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 whitespace-pre px-2 py-1.5"
          style={{
            visibility: 'hidden',
            color: 'var(--fg)',
            fontSize,
            lineHeight: 1.15,
          }}
        >
          {draft || ' '}
        </span>
      )}
      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          placeholder="Type text"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onMouseDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
          className="h-full w-full resize-none bg-transparent px-2 py-1.5 outline-none"
          style={{
            color: 'var(--fg)',
            fontSize,
            lineHeight: 1.15,
            overflow: 'hidden',
          }}
        />
      ) : (
        <div
          className="h-full w-full overflow-hidden whitespace-pre-wrap px-2 py-1.5"
          style={{
            color: 'var(--fg)',
            fontSize,
            lineHeight: 1.15,
          }}
        >
          {text.text}
        </div>
      )}
    </Rnd>
  )
})

function getCanvasTextFontSize(width: number, height: number): number {
  return Math.max(14, Math.round(Math.min(width, height) / 3))
}
