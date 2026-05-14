// Dialog for creating a new terminal: name, folder and agent command.
import { useState } from 'react'
import { Button, Modal } from '@renderer/components/ui'
import { COMMANDS } from '../commands'
import type { CommandKey } from '../types'

interface NewTerminalModalProps {
  onCancel: () => void
  onConfirm: (folder: string, command: CommandKey, name: string) => void
}

export function NewTerminalModal({
  onCancel,
  onConfirm
}: NewTerminalModalProps): JSX.Element {
  const [folder, setFolder] = useState<string>('')
  const [command, setCommand] = useState<CommandKey>('claude')
  const [name, setName] = useState<string>('')

  async function pickFolder(): Promise<void> {
    const selected = await window.dialogApi.selectFolder()
    if (selected) setFolder(selected)
  }

  return (
    <Modal title="New terminal" onClose={onCancel} className="w-[440px]">
      {/* Terminal name ----------------------------------------------------- */}
      <label className="mb-1 block text-xs font-medium text-slate-300">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Terminal name (optional)"
        className="mb-4 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-100"
      />

      {/* Folder selection -------------------------------------------------- */}
      <label className="mb-1 block text-xs font-medium text-slate-300">Folder</label>
      <div className="mb-4 flex gap-2">
        <input
          readOnly
          value={folder}
          placeholder="No folder selected"
          className="min-w-0 flex-1 truncate rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-100"
        />
        <Button variant="secondary" onClick={pickFolder}>
          Select...
        </Button>
      </div>

      {/* Command selection ------------------------------------------------- */}
      <label className="mb-1 block text-xs font-medium text-slate-300">Command</label>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {Object.values(COMMANDS).map((c) => (
          <button
            key={c.key}
            onClick={() => setCommand(c.key)}
            className={`flex items-center gap-2 rounded border px-3 py-2 text-sm font-medium ${
              command === c.key
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <span className="text-lg">{c.icon}</span>
            {c.label}
          </button>
        ))}
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
