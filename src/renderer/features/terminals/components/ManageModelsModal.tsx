// Settings → Models: curate the model strings each agent offers in the terminal
// pickers. Seeded on first run from the agent registry and grown from here or
// by typing an unknown model into a terminal.
import { useState } from 'react'
import { Button, Modal } from '@renderer/components/ui'
import { supportsModel } from '@shared/agents'
import type { ModelRecord } from '@shared/types/model'
import { COMMANDS } from '../commands'
import type { CommandDef } from '../types'
import { useModels } from '../hooks/useModels'

const FIELD_STYLE = {
  background: 'color-mix(in oklch, var(--fg) 4%, transparent)',
  color: 'var(--fg)',
  border: '1px solid var(--line-2)',
}

export function ManageModelsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { modelsFor, register, remove } = useModels()
  const agents: CommandDef[] = Object.values(COMMANDS).filter(supportsModel)

  return (
    <Modal title="Models" onClose={onClose} closeOnOverlay className="w-[520px]">
      <p className="mb-4 text-[11px]" style={{ color: 'var(--fg-3)' }}>
        Model strings offered when pinning a terminal. Each one is passed to the agent
        as-is. Removing a model here does not unpin terminals already using it.
      </p>

      <div className="flex max-h-[52vh] flex-col gap-5 overflow-y-auto pr-1">
        {agents.map((agent) => (
          <AgentModels
            key={agent.key}
            agent={agent}
            models={modelsFor(agent.key)}
            onAdd={(value) => register(agent.key, value)}
            onRemove={remove}
          />
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

function AgentModels({
  agent,
  models,
  onAdd,
  onRemove,
}: {
  agent: CommandDef
  models: ModelRecord[]
  onAdd: (value: string) => Promise<ModelRecord | null>
  onRemove: (id: string) => Promise<void>
}): JSX.Element {
  const [draft, setDraft] = useState('')

  async function add(): Promise<void> {
    const value = draft.trim()
    if (!value) return
    // register() is idempotent, so a duplicate simply resolves to the existing
    // row — clearing the field either way keeps the interaction predictable.
    await onAdd(value)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px]" style={{ color: 'var(--fg-2)', fontWeight: 500 }}>
        <span className="mr-1.5">{agent.icon}</span>
        {agent.label}
      </span>

      {models.length === 0 ? (
        <span className="text-[11px]" style={{ color: 'var(--fg-3)' }}>
          No models registered yet.
        </span>
      ) : (
        models.map((model) => (
          <div key={model.id} className="flex items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate rounded-[6px] px-2 py-1 text-[11.5px] font-mono"
              style={FIELD_STYLE}
            >
              {model.value}
            </span>
            <Button variant="ghost" onClick={() => void onRemove(model.id)}>
              <span aria-label={`Remove ${model.value}`}>Remove</span>
            </Button>
          </div>
        ))
      )}

      <div className="flex items-center gap-2">
        <input
          aria-label={`New model for ${agent.label}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder={agent.modelHint ?? 'Model id'}
          className="min-w-0 flex-1 rounded-[8px] px-2.5 h-8 text-[12.5px] font-mono outline-none"
          style={FIELD_STYLE}
        />
        <Button variant="secondary" disabled={!draft.trim()} onClick={() => void add()}>
          Add
        </Button>
      </div>
    </div>
  )
}
