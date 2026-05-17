// Movable, inline-editable free text on the canvas. Box hugs the rendered
// glyphs (no padding) so behaviour matches Excalidraw: the bounding box only
// grows with the text itself.
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import type { CanvasTextRecord } from '@shared/types/canvas'

const LINE_HEIGHT = 1.2
const MIN_FONT_SIZE = 14

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
  const fontSize = getCanvasTextFontSize(text.text, text.height)

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
      width: Math.ceil(measured.offsetWidth),
      height: Math.ceil(measured.offsetHeight),
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
            width: Math.ceil(measured.offsetWidth),
            height: Math.ceil(measured.offsetHeight),
          }
        : { width: text.width, height: text.height })
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

  // Snap the box around the text rendered at the font size implied by the
  // user-dragged height. Keeps the bounds tight to the glyphs so the box can
  // only grow proportionally to the text itself — diagonal-style growth, with
  // no padding around the rendered content.
  function snapToTextAtBox(_width: number, height: number): { width: number; height: number } {
    if (typeof document === 'undefined') return { width: _width, height }
    const nextFontSize = getCanvasTextFontSize(text.text, height)
    const probe = document.createElement('span')
    probe.textContent = text.text || ' '
    probe.style.cssText =
      `position:absolute;left:-9999px;top:-9999px;visibility:hidden;` +
      `white-space:pre;padding:0;margin:0;line-height:${LINE_HEIGHT};font-size:${nextFontSize}px;`
    document.body.appendChild(probe)
    const measuredW = Math.ceil(probe.offsetWidth)
    const measuredH = Math.ceil(probe.offsetHeight)
    document.body.removeChild(probe)
    if (measuredW <= 0 || measuredH <= 0) return { width: _width, height }
    return { width: measuredW, height: measuredH }
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
      // Resize must always be uniform/diagonal — text grows in both axes
      // together, never stretched in just one direction like a terminal node.
      lockAspectRatio
      onDragStart={() => {
        onSelect(text.id)
        onDragStart(text.id)
      }}
      onDrag={(_event, data) => onMove(text.id, { x: data.x, y: data.y })}
      onDragStop={(_event, data) => onUpdate(text.id, { x: data.x, y: data.y })}
      onResize={(_event, _dir, ref, _delta, position) => {
        const snapped = snapToTextAtBox(ref.offsetWidth, ref.offsetHeight)
        onMove(text.id, {
          width: snapped.width,
          height: snapped.height,
          x: position.x,
          y: position.y,
        })
      }}
      onResizeStop={(_event, _dir, ref, _delta, position) => {
        const snapped = snapToTextAtBox(ref.offsetWidth, ref.offsetHeight)
        onUpdate(text.id, {
          width: snapped.width,
          height: snapped.height,
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
          className="pointer-events-none absolute left-0 top-0 whitespace-pre"
          style={{
            visibility: 'hidden',
            color: 'var(--fg)',
            fontSize,
            lineHeight: LINE_HEIGHT,
            padding: 0,
            margin: 0,
          }}
        >
          {draft || ' '}
        </span>
      )}
      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          placeholder=""
          wrap="off"
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
          className="h-full w-full resize-none bg-transparent outline-none"
          style={{
            color: 'var(--fg)',
            fontSize,
            lineHeight: LINE_HEIGHT,
            padding: 0,
            margin: 0,
            border: 0,
            overflow: 'hidden',
            whiteSpace: 'pre',
          }}
        />
      ) : (
        <div
          className="h-full w-full overflow-hidden"
          style={{
            color: 'var(--fg)',
            fontSize,
            lineHeight: LINE_HEIGHT,
            padding: 0,
            margin: 0,
            whiteSpace: 'pre',
          }}
        >
          {text.text}
        </div>
      )}
    </Rnd>
  )
})

function getCanvasTextFontSize(text: string, height: number): number {
  const lines = Math.max(1, text.split('\n').length)
  return Math.max(MIN_FONT_SIZE, Math.round(height / (LINE_HEIGHT * lines)))
}
