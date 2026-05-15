// Reusable modal shell: overlay + centered panel + title. Feature-agnostic.
import type { ReactNode } from 'react'
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgb(0 0 0 / 0.45)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`rounded-[14px] p-5 ${className}`}
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
          boxShadow: '0 24px 48px -12px rgb(var(--shadow-color) / 0.30)',
          color: 'var(--fg)',
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>
            {title}
          </h2>
          <button
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
