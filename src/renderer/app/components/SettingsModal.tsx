// App settings modal: global theme, terminal defaults, and project folder.
// Triggered by the gear icon in the sidebar footer.
import { Button, Modal, Select } from '@renderer/components/ui'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import type { ShellType } from '@renderer/features/terminals/types'

interface SettingsModalProps {
  theme: CanvasTheme
  defaultShell: ShellType
  defaultProjectFolder: string
  onThemeChange: (theme: CanvasTheme) => void
  onDefaultShellChange: (shell: ShellType) => void
  onDefaultProjectFolderChange: (folder: string) => void
  onClose: () => void
}

export function SettingsModal({
  theme,
  defaultShell,
  defaultProjectFolder,
  onThemeChange,
  onDefaultShellChange,
  onDefaultProjectFolderChange,
  onClose,
}: SettingsModalProps): JSX.Element {
  async function pickDefaultProjectFolder(): Promise<void> {
    const selected = await window.dialogApi.selectFolder(defaultProjectFolder)
    if (selected) onDefaultProjectFolderChange(selected)
  }

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
          label="Default project folder"
          hint="Prefills the folder when creating new terminals"
        >
          <div className="flex gap-2">
            <input
              readOnly
              value={defaultProjectFolder}
              placeholder="No default folder selected"
              className="min-w-0 flex-1 truncate rounded-[8px] px-2.5 h-8 text-[12.5px] font-mono outline-none"
              style={FIELD_STYLE}
            />
            <Button variant="secondary" onClick={pickDefaultProjectFolder}>
              Select…
            </Button>
            {defaultProjectFolder && (
              <Button
                variant="ghost"
                onClick={() => onDefaultProjectFolderChange('')}
              >
                Clear
              </Button>
            )}
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

const FIELD_STYLE = {
  background: 'color-mix(in oklch, var(--fg) 4%, transparent)',
  color: 'var(--fg)',
  border: '1px solid var(--line-2)',
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
