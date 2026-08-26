// Effort picker shared by the create and edit terminal modals. Unlike the
// model, effort levels are a closed set the agent's CLI validates, so this is a
// plain dropdown over the agent's declared levels — no catalog, no free text.
// Empty means "agent default": no effort flag on the launch line.
import { Select } from '@renderer/components/ui'
import { effortsFor } from '@shared/agents'
import type { CommandDef } from '../types'

interface EffortFieldProps {
  /** Agent being configured — supplies the levels it accepts. */
  agent: CommandDef
  /** Currently pinned effort ('' = agent default). */
  value: string
  onChange: (value: string) => void
}

/** Shown first so clearing the pin is always one click away. */
const DEFAULT_OPTION = { value: '', label: 'Default (agent decides)' }

export function EffortField({ agent, value, onChange }: EffortFieldProps): JSX.Element {
  const options = [DEFAULT_OPTION, ...effortsFor(agent)]

  return <Select ariaLabel="Effort" value={value} options={options} onChange={onChange} />
}
