// Agent switcher at the top of the reports screen. The tabs come from
// USAGE_AGENTS, so an agent becomes navigable as soon as its parser exists.
import { AGENTS } from '@shared/agents'
import { USAGE_AGENTS, type UsageAgent } from '@shared/types/usage'

interface AgentTabsProps {
  value: UsageAgent
  onChange: (agent: UsageAgent) => void
}

export function AgentTabs({ value, onChange }: AgentTabsProps): JSX.Element {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Agente">
      {USAGE_AGENTS.map((key) => {
        const agent = AGENTS[key as keyof typeof AGENTS]
        const active = value === key
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            title={agent.label}
            onClick={() => onChange(key)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[12.5px]"
            style={{
              border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
              background: active
                ? 'color-mix(in oklch, var(--accent) 12%, transparent)'
                : 'transparent',
              color: active ? 'var(--accent)' : 'var(--fg-2)',
            }}
          >
            <span aria-hidden>{agent.icon}</span>
            {agent.label}
          </button>
        )
      })}
    </div>
  )
}
