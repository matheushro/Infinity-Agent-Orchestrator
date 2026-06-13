// Floating right-click menu for a single terminal.
// Anchored to a viewport (clientX/clientY) position; closes on outside click,
// Esc, scroll, or after picking an action. Renders in a portal so it overlays
// any sibling terminal node regardless of DOM order.
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ICopy, ILink, INote, IPalette, IPower, IRefresh, ITrash } from '@renderer/components/ui'

interface TerminalContextMenuProps {
  x: number
  y: number
  /** Current power state, used to label the turn on/off action. */
  enabled: boolean
  onClose: () => void
  onRestart: () => void
  onDuplicate: () => void
  onLink: () => void
  onToggleEnabled: () => void
  onEditPrompt: () => void
  onDelete: () => void
  onStyle: () => void
  onOpenInVSCode: () => void
}

export function TerminalContextMenu({
  x,
  y,
  enabled,
  onClose,
  onRestart,
  onDuplicate,
  onLink,
  onToggleEnabled,
  onEditPrompt,
  onDelete,
  onStyle,
  onOpenInVSCode,
}: TerminalContextMenuProps): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    function onScroll(): void {
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onScroll, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onScroll)
    }
  }, [onClose])

  const items: Array<{ icon: ReactNode; label: string; onClick: () => void; danger?: boolean }> = [
    {
      icon: <IPower size={13} />,
      label: enabled ? 'Turn off terminal' : 'Turn on terminal',
      onClick: onToggleEnabled,
    },
    { icon: <IRefresh size={13} />, label: 'Restart terminal', onClick: onRestart },
    { icon: <INote size={13} />, label: 'Edit agent prompt…', onClick: onEditPrompt },
    { icon: <ICopy size={13} />, label: 'Duplicate terminal', onClick: onDuplicate },
    { icon: <ILink size={13} />, label: 'Link to terminal/note', onClick: onLink },
    { icon: <VSCodeIcon />, label: 'Open on VS Code', onClick: onOpenInVSCode },
    { icon: <IPalette size={13} />, label: 'Customize style…', onClick: onStyle },
    { icon: <ITrash size={13} />, label: 'Delete terminal', onClick: onDelete, danger: true },
  ]

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100]"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-[101] min-w-[220px] py-1 rounded-[10px]"
        style={{
          left: x,
          top: y,
          background: 'color-mix(in oklch, var(--bg-2) 96%, transparent)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--line)',
          boxShadow: '0 12px 32px -8px rgb(var(--shadow-color) / 0.32)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((it) => (
          <button
            key={it.label}
            className="ctx-item flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px]"
            style={{
              color: it.danger ? 'oklch(0.68 0.18 25)' : 'var(--fg)',
            }}
            onClick={() => {
              it.onClick()
              onClose()
            }}
          >
            <span
              className="inline-flex items-center justify-center"
              style={{
                width: 18,
                height: 18,
                color: it.danger ? 'oklch(0.68 0.18 25)' : 'var(--fg-2)',
              }}
            >
              {it.icon}
            </span>
            <span className="truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  )
}

function VSCodeIcon(): JSX.Element {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16.5 3.5 7.2 12l9.3 8.5 3.5-1.4V4.9l-3.5-1.4Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path
        d="M7.2 12 4 9.6 2.7 10.3v3.4L4 14.4 7.2 12Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  )
}
