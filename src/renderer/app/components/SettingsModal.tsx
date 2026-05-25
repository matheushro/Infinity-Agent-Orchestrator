// App settings modal: global theme and default shell.
// Triggered by the gear icon in the sidebar footer.
import { Modal, Select } from '@renderer/components/ui'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import type { ShellType } from '@renderer/features/terminals/types'

interface SettingsModalProps {
  theme: CanvasTheme
  defaultShell: ShellType
  onThemeChange: (theme: CanvasTheme) => void
  onDefaultShellChange: (shell: ShellType) => void
  onClose: () => void
}

export function SettingsModal({
  theme,
  defaultShell,
  onThemeChange,
  onDefaultShellChange,
  onClose,
}: SettingsModalProps): JSX.Element {
  return (
    <Modal title="Settings" onClose={onClose} closeOnOverlay className="w-[420px]">
      <div className="flex flex-col gap-5">
        <Field label="Theme" hint="Applied to the whole app">
          <div
            className="flex items-center rounded-[8px] p-0.5"
            style={{
              background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
              border: '1px solid var(--line-2)',
            }}
          >
            <Chip
              label="Light"
              active={theme === 'light'}
              onClick={() => onThemeChange('light')}
            />
            <Chip
              label="Dark"
              active={theme === 'dark'}
              onClick={() => onThemeChange('dark')}
            />
          </div>
        </Field>

        <Field
          label="Default shell"
          hint="Used when creating new terminals"
        >
          <Select
            value={defaultShell}
            onChange={(v) => onDefaultShellChange(v as ShellType)}
            options={[
              { value: 'default', label: 'System default' },
              { value: 'bash', label: 'bash' },
              { value: 'zsh', label: 'zsh' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
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
      {hint && (
        <span className="text-[11px]" style={{ color: 'var(--fg-3)' }}>
          {hint}
        </span>
      )}
    </div>
  )
}

function Chip({
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
