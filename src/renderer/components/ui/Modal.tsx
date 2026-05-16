// Reusable modal shell: overlay + centered panel + title. Feature-agnostic.
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { IClose } from './Icon'

interface ModalProps {
  title: string
  /** When true, clicking the backdrop dismisses the modal. Off by default. */
  closeOnOverlay?: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

export function Modal({
  title,
  closeOnOverlay = false,
  onClose,
  children,
  className = '',
}: ModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const getFocusable = (selector: string): HTMLElement[] =>
      Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => !element.hasAttribute('disabled'),
      )

    const initialFocusable = getFocusable(
      'button:not([disabled]):not([data-modal-close]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    const focusTarget = initialFocusable[0] ?? panel

    focusTarget.focus()

    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handlePanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return

    const panel = panelRef.current
    if (!panel) return

    const tabbables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('disabled'))

    if (!tabbables.length) return

    const active = document.activeElement as HTMLElement | null
    const currentIndex = active ? tabbables.indexOf(active) : -1
    const nextIndex = e.shiftKey
      ? currentIndex <= 0
        ? tabbables.length - 1
        : currentIndex - 1
      : currentIndex === -1 || currentIndex === tabbables.length - 1
        ? 0
        : currentIndex + 1

    e.preventDefault()
    tabbables[nextIndex]?.focus()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgb(0 0 0 / 0.45)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={`rounded-[14px] p-5 ${className}`}
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
          boxShadow: '0 24px 48px -12px rgb(var(--shadow-color) / 0.30)',
          color: 'var(--fg)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>
            {title}
          </h2>
          <button
            data-modal-close
            className="icon-btn !w-6 !h-6"
            onClick={onClose}
            aria-label="Close"
          >
            <IClose size={12} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
