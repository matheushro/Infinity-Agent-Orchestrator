// Per-terminal style editor: theme, font family, font size.
// Lives in the renderer only — values are persisted via useTerminalStyles
// (localStorage).
import { Button, Modal, Select } from '@renderer/components/ui'
import {
  DEFAULT_TERMINAL_STYLE,
  FONT_FAMILY_OPTIONS,
  type TerminalStyle,
} from '../types'

interface TerminalStyleModalProps {
  terminalTitle: string
  value: TerminalStyle
  onChange: (patch: Partial<TerminalStyle>) => void
  onReset: () => void
  onClose: () => void
}

export function TerminalStyleModal({
  terminalTitle,
  value,
  onChange,
  onReset,
  onClose,
}: TerminalStyleModalProps): JSX.Element {
  return (
    <Modal
      title={`Style · ${terminalTitle}`}
      onClose={onClose}
      closeOnOverlay
      className="w-[380px]"
    >
      <div className="flex flex-col gap-4">
        <Field label="Theme">
          <div
            className="flex items-center rounded-[8px] p-0.5"
            style={{
              background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
              border: '1px solid var(--line-2)',
            }}
          >
            <ThemeChip
              label="Auto"
              active={value.theme === 'auto'}
              onClick={() => onChange({ theme: 'auto' })}
            />
            <ThemeChip
              label="Dark"
              active={value.theme === 'dark'}
              onClick={() => onChange({ theme: 'dark' })}
            />
            <ThemeChip
              label="Light"
              active={value.theme === 'light'}
              onClick={() => onChange({ theme: 'light' })}
            />
          </div>
        </Field>

        <Field label="Font">
          <Select
            ariaLabel="Font"
            value={value.fontFamily}
            onChange={(v) => onChange({ fontFamily: v })}
            options={FONT_FAMILY_OPTIONS}
          />
        </Field>

        <Field label={`Font size · ${value.fontSize}px`}>
          <input
            type="range"
            min={10}
            max={22}
            step={1}
            value={value.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="w-full"
          />
        </Field>

        <div className="flex items-center justify-between pt-1">
          <button
            className="text-[11.5px]"
            style={{ color: 'var(--fg-3)' }}
            onClick={onReset}
          >
            Reset to default
          </button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[10.5px] uppercase tracking-[0.08em]"
        style={{ color: 'var(--fg-3)', fontWeight: 500 }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function ThemeChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex-1 h-7 rounded-[6px] text-[11.5px] transition-colors"
      style={{
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--fg-3)',
        fontWeight: active ? 500 : 400,
        boxShadow: active ? '0 1px 2px rgb(0 0 0 / 0.10)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

// Re-export so callers can construct an initial value without duplication.
export { DEFAULT_TERMINAL_STYLE }
