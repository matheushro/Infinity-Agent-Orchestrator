// Dialog for creating a new terminal: name, folder and agent command.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@renderer/components/ui'
import { supportsModel } from '@shared/agents'
import { COMMANDS } from '../commands'
import type { CommandDef, CommandKey } from '../commands'
import { useModels } from '../hooks/useModels'
import type { TerminalStyle } from '../types'
import { ModelField } from './ModelField'

type Theme = TerminalStyle['theme']

// Sentinel for "no pin" — '' leaves the agent on its own default model.
const DEFAULT_MODEL = ''

interface NewTerminalModalProps {
  defaultFolder?: string
  onCancel: () => void
  onConfirm: (folder: string, command: CommandKey, name: string, theme: Theme, model: string) => void
}

const FIELD_STYLE = {
  background: 'color-mix(in oklch, var(--fg) 4%, transparent)',
  color: 'var(--fg)',
  border: '1px solid var(--line-2)',
}

export function NewTerminalModal({
  defaultFolder = '',
  onCancel,
  onConfirm,
}: NewTerminalModalProps): JSX.Element {
  const [folder, setFolder] = useState<string>(defaultFolder)
  const [command, setCommand] = useState<CommandKey>('claude')
  const [name, setName] = useState<string>('')
  const [theme, setTheme] = useState<Theme>('auto')
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const { modelsFor, register } = useModels()

  // Models the selected agent supports; switching agent resets the pin since a
  // value valid for one agent is meaningless for another.
  const agent: CommandDef = COMMANDS[command]

  function selectCommand(next: CommandKey): void {
    setCommand(next)
    setModel(DEFAULT_MODEL)
  }

  function confirm(): void {
    // A model typed by hand joins the catalog, so the next terminal offers it.
    void register(command, model)
    onConfirm(folder, command, name.trim(), theme, model.trim())
  }

  async function pickFolder(): Promise<void> {
    const selected = await window.dialogApi.selectFolder(folder || defaultFolder)
    if (selected) setFolder(selected)
  }

  return (
    <Modal title="New terminal" onClose={onCancel} className="w-[460px]">
      <Label>Name</Label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Terminal name (optional)"
        className="mb-4 w-full rounded-[8px] px-2.5 h-8 text-[12.5px] outline-none"
        style={FIELD_STYLE}
      />

      <Label>Folder</Label>
      <div className="mb-4 flex gap-2">
        <input
          readOnly
          value={folder}
          placeholder="No folder selected"
          className="min-w-0 flex-1 truncate rounded-[8px] px-2.5 h-8 text-[12.5px] font-mono outline-none"
          style={FIELD_STYLE}
        />
        <Button variant="secondary" onClick={pickFolder}>
          Select…
        </Button>
      </div>

      <Label>Command</Label>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {Object.values(COMMANDS).map((c) => {
          const active = command === c.key
          return (
            <button
              key={c.key}
              onClick={() => selectCommand(c.key)}
              className="flex items-center gap-2 rounded-[8px] px-3 h-10 text-[12.5px] font-medium transition-colors"
              style={{
                background: active
                  ? 'color-mix(in oklch, var(--accent) 12%, transparent)'
                  : 'color-mix(in oklch, var(--fg) 4%, transparent)',
                color: active ? 'var(--fg)' : 'var(--fg-2)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line-2)'}`,
              }}
            >
              <span className="text-base">{c.icon}</span>
              {c.label}
            </button>
          )
        })}
      </div>

      {supportsModel(agent) && (
        <div className="mb-5">
          <Label>Model</Label>
          <ModelField
            agent={agent}
            value={model}
            options={modelsFor(command)}
            onChange={setModel}
          />
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--fg-3)' }}>
            Pick a registered model or type a new one — it gets saved for next time.
            Leave empty to let the agent decide.
          </p>
        </div>
      )}

      <Label>Theme</Label>
      <div
        className="mb-5 flex items-center rounded-[8px] p-0.5"
        style={{
          background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
          border: '1px solid var(--line-2)',
        }}
      >
        <ThemeChip label="Auto" active={theme === 'auto'} onClick={() => setTheme('auto')} />
        <ThemeChip label="Dark" active={theme === 'dark'} onClick={() => setTheme('dark')} />
        <ThemeChip label="Light" active={theme === 'light'} onClick={() => setTheme('light')} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!folder} onClick={confirm}>
          Open
        </Button>
      </div>
    </Modal>
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

function Label({ children }: { children: ReactNode }): JSX.Element {
  return (
    <label
      className="mb-1 block text-[10.5px] uppercase tracking-[0.08em]"
      style={{ color: 'var(--fg-3)', fontWeight: 500 }}
    >
      {children}
    </label>
  )
}
