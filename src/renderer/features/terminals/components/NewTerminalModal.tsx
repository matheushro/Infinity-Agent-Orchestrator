// Dialog for creating a new terminal: name, folder and agent command.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@renderer/components/ui'
import { COMMANDS } from '../commands'
import type { CommandKey } from '../types'

interface NewTerminalModalProps {
  onCancel: () => void
  onConfirm: (folder: string, command: CommandKey, name: string) => void
}

const FIELD_STYLE = {
  background: 'color-mix(in oklch, var(--fg) 4%, transparent)',
  color: 'var(--fg)',
  border: '1px solid var(--line-2)',
}

export function NewTerminalModal({
  onCancel,
  onConfirm,
}: NewTerminalModalProps): JSX.Element {
  const [folder, setFolder] = useState<string>('')
  const [command, setCommand] = useState<CommandKey>('claude')
  const [name, setName] = useState<string>('')

  async function pickFolder(): Promise<void> {
    const selected = await window.dialogApi.selectFolder()
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
              onClick={() => setCommand(c.key)}
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

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!folder} onClick={() => onConfirm(folder, command, name.trim())}>
          Open
        </Button>
      </div>
    </Modal>
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
