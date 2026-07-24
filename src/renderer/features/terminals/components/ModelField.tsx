// Model picker shared by the create and edit terminal modals: a combobox over
// the registered catalog that also accepts anything typed. An unknown string is
// registered by the modal on confirm, so the list grows as the user works
// instead of having to be curated up front. Empty means "agent default".
import { useId } from 'react'
import type { ModelRecord } from '@shared/types/model'
import type { CommandDef } from '../types'

interface ModelFieldProps {
  /** Agent being configured — supplies the placeholder hint for free-text ids. */
  agent: CommandDef
  /** Currently pinned model ('' = agent default). */
  value: string
  /** Registered models for this agent, offered as suggestions. */
  options: ModelRecord[]
  onChange: (value: string) => void
  className?: string
}

const FIELD_STYLE = {
  background: 'color-mix(in oklch, var(--fg) 4%, transparent)',
  color: 'var(--fg)',
  border: '1px solid var(--line-2)',
}

export function ModelField({
  agent,
  value,
  options,
  onChange,
  className = '',
}: ModelFieldProps): JSX.Element {
  const listId = useId()

  return (
    <>
      <input
        aria-label="Model"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={agent.modelHint ?? 'Default (agent decides)'}
        className={`w-full rounded-[8px] px-2.5 h-8 text-[12.5px] font-mono outline-none ${className}`}
        style={FIELD_STYLE}
      />
      <datalist id={listId}>
        {options.map((model) => (
          <option key={model.id} value={model.value} label={model.label} />
        ))}
      </datalist>
    </>
  )
}
