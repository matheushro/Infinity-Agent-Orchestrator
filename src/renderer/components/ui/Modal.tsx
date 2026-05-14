// Reusable modal shell: overlay + centered panel + title. Feature-agnostic.
import type { ReactNode } from 'react'

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
  className = ''
}: ModalProps): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl ${className}`}
      >
        <h2 className="mb-4 text-sm font-semibold text-slate-100">{title}</h2>
        {children}
      </div>
    </div>
  )
}
