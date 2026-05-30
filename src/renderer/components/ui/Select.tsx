// Reusable dropdown select. Feature-agnostic, themed via CSS variables.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { IChevDown } from './Icon'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  /** Optional inline label rendered before the control. */
  label?: string
  /** Accessible name for the control when no visible label is rendered. */
  ariaLabel?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  className?: string
}

export function Select({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  className = '',
}: SelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonId = useId()
  const listboxId = useId()

  const selectedIndex = useMemo(() => {
    const index = options.findIndex((option) => option.value === value)
    return index >= 0 ? index : 0
  }, [options, value])

  const selectedOption = options[selectedIndex]

  useEffect(() => {
    if (!open) return

    function onDocumentPointerDown(event: PointerEvent): void {
      const root = wrapperRef.current
      if (!root) return
      if (event.target instanceof Node && root.contains(event.target)) return
      setOpen(false)
    }

    function onDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onDocumentKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown)
      document.removeEventListener('keydown', onDocumentKeyDown)
    }
  }, [open])

  function commit(index: number): void {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
  }

  function openMenu(nextIndex = selectedIndex): void {
    setActiveIndex(nextIndex)
    setOpen(true)
  }

  return (
    <div
      ref={wrapperRef}
      className={`relative flex w-full items-center gap-2 text-[11.5px] ${className}`}
      style={{ color: 'var(--fg-3)' }}
    >
      {label}
      <button
        id={buttonId}
        type="button"
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          openMenu()
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) {
              openMenu(Math.min(selectedIndex + 1, options.length - 1))
              return
            }
            setActiveIndex((current) => Math.min(current + 1, options.length - 1))
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              openMenu(Math.max(selectedIndex - 1, 0))
              return
            }
            setActiveIndex((current) => Math.max(current - 1, 0))
            return
          }
          if ((event.key === 'Enter' || event.key === ' ') && open) {
            event.preventDefault()
            commit(activeIndex)
          }
        }}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[6px] px-2 py-1 text-left text-[11.5px] outline-none"
        style={{
          background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
          color: 'var(--fg)',
          border: '1px solid var(--line-2)',
        }}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? value}</span>
        <IChevDown size={12} style={{ flexShrink: 0, color: 'var(--fg-3)' }} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-[8px]"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            boxShadow: '0 18px 36px -16px rgb(var(--shadow-color) / 0.25)',
          }}
        >
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={buttonId}
            className="max-h-56 overflow-auto p-1"
          >
            {options.map((option, index) => {
              const selected = option.value === value
              const active = index === activeIndex
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className="flex w-full items-center rounded-[6px] px-2 py-1.5 text-left text-[11.5px] transition-colors"
                  style={{
                    background: active
                      ? 'color-mix(in oklch, var(--fg) 8%, transparent)'
                      : 'transparent',
                    color: selected ? 'var(--fg)' : 'var(--fg-2)',
                    fontWeight: selected ? 500 : 400,
                  }}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
