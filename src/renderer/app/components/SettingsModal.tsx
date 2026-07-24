// App settings modal: global theme, terminal defaults, and project folder.
// Triggered by the gear icon in the sidebar footer.
import { useEffect, useState } from 'react'
import { Button, Modal, Select } from '@renderer/components/ui'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import type { ShellType } from '@renderer/features/terminals/types'

interface SettingsModalProps {
  theme: CanvasTheme
  defaultShell: ShellType
  defaultProjectFolder: string
  maxWorkspaces: number
  onThemeChange: (theme: CanvasTheme) => void
  onDefaultShellChange: (shell: ShellType) => void
  onDefaultProjectFolderChange: (folder: string) => void
  onMaxWorkspacesChange: (limit: number) => void
  /** Opens the model catalog editor (App swaps this modal for that one). */
  onManageModels: () => void
  /** Called after a backup file was merged into the DB (App reloads the UI). */
  onBackupImported: () => void
  onClose: () => void
}

type BackupStatus = { kind: 'ok' | 'error'; text: string }

export function SettingsModal({
  theme,
  defaultShell,
  defaultProjectFolder,
  maxWorkspaces,
  onThemeChange,
  onDefaultShellChange,
  onDefaultProjectFolderChange,
  onMaxWorkspacesChange,
  onManageModels,
  onBackupImported,
  onClose,
}: SettingsModalProps): JSX.Element {
  const [workspaceLimitDraft, setWorkspaceLimitDraft] = useState(String(maxWorkspaces))
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)

  useEffect(() => {
    setWorkspaceLimitDraft(String(maxWorkspaces))
  }, [maxWorkspaces])

  async function pickDefaultProjectFolder(): Promise<void> {
    const selected = await window.dialogApi.selectFolder(defaultProjectFolder)
    if (selected) onDefaultProjectFolderChange(selected)
  }

  async function exportBackup(): Promise<void> {
    setBackupBusy(true)
    setBackupStatus(null)
    try {
      const result = await window.backupApi.exportToFile()
      if (!result.canceled) {
        setBackupStatus({ kind: 'ok', text: `Exported to ${result.path}` })
      }
    } catch {
      setBackupStatus({ kind: 'error', text: 'Export failed. Check the chosen location and try again.' })
    } finally {
      setBackupBusy(false)
    }
  }

  async function importBackup(): Promise<void> {
    setBackupBusy(true)
    setBackupStatus(null)
    try {
      const result = await window.backupApi.importFromFile()
      if (!result.canceled) {
        setBackupStatus({ kind: 'ok', text: 'Import complete — reloading…' })
        onBackupImported()
      }
    } catch {
      setBackupStatus({ kind: 'error', text: 'Import failed: not a valid IAO backup file.' })
    } finally {
      setBackupBusy(false)
    }
  }

  function commitWorkspaceLimit(value: string): void {
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) {
      setWorkspaceLimitDraft(String(maxWorkspaces))
      return
    }
    const next = Math.max(1, Math.min(99, parsed))
    setWorkspaceLimitDraft(String(next))
    onMaxWorkspacesChange(next)
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
            ariaLabel="Default shell"
            value={defaultShell}
            onChange={(v) => onDefaultShellChange(v as ShellType)}
            options={[
              { value: 'default', label: 'System default' },
              { value: 'bash', label: 'bash' },
              { value: 'zsh', label: 'zsh' },
            ]}
          />
        </Field>

        <Field
          label="Workspace limit"
          hint="Maximum number of workspaces allowed in the sidebar"
        >
          <input
            type="number"
            min={1}
            max={99}
            value={workspaceLimitDraft}
            onChange={(e) => {
              setWorkspaceLimitDraft(e.target.value)
            }}
            onBlur={(e) => commitWorkspaceLimit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitWorkspaceLimit(e.currentTarget.value)
                e.currentTarget.blur()
              }
            }}
            className="w-24 rounded-[8px] px-2.5 h-8 text-[12.5px] outline-none"
            style={FIELD_STYLE}
            aria-label="Workspace limit"
          />
        </Field>

        <Field
          label="Models"
          hint="The model strings each agent offers when pinning a terminal. Typing an unknown model into a terminal registers it here too."
        >
          <div>
            <Button variant="secondary" onClick={onManageModels}>
              Manage models…
            </Button>
          </div>
        </Field>

        <Field
          label="Backup"
          hint="Export everything (workspaces, terminals, agents, prompts, notes, texts, links) to a JSON file, or import a previously exported one. Importing merges by id and reloads the app."
        >
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={backupBusy} onClick={exportBackup}>
              Export data…
            </Button>
            <Button variant="secondary" disabled={backupBusy} onClick={importBackup}>
              Import data…
            </Button>
          </div>
          {backupStatus && (
            <span
              role="status"
              className="text-[11px] break-all"
              style={{ color: backupStatus.kind === 'error' ? '#e5484d' : 'var(--accent)' }}
            >
              {backupStatus.text}
            </span>
          )}
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
