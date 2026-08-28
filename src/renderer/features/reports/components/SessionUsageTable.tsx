// Per-session roll-up: which project consumed what during the day.
import type { SessionUsage } from '@shared/types/usage'
import { formatPercent, formatTime, formatTokens, shortPath } from '../lib/format'

interface SessionUsageTableProps {
  sessions: SessionUsage[]
  hasLimits: boolean
}

const BASE_HEAD = ['Terminal', 'Projeto', 'Modelo', 'Prompts', 'Tokens']
const LIMIT_HEAD = ['Consumo 5h', 'Consumo semana']
const TAIL_HEAD = ['Início', 'Fim']

export function SessionUsageTable({ sessions, hasLimits }: SessionUsageTableProps): JSX.Element {
  const head = hasLimits ? [...BASE_HEAD, ...LIMIT_HEAD, ...TAIL_HEAD] : [...BASE_HEAD, ...TAIL_HEAD]
  return (
    <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ color: 'var(--fg-3)' }}>
          {head.map((label) => (
            <th
              key={label}
              className="text-left font-medium px-2 py-1.5 whitespace-nowrap"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => (
          <tr key={session.sessionId} style={{ borderBottom: '1px solid var(--line)' }}>
            <td
              className="px-2 py-1.5 whitespace-nowrap"
              style={{ color: session.origin === 'iao' ? 'var(--fg)' : 'var(--fg-3)' }}
            >
              {session.terminalTitle ?? session.terminalId ?? 'externo'}
            </td>
            <td className="px-2 py-1.5" title={session.cwd ?? ''}>
              {shortPath(session.projectCwd ?? session.cwd)}
            </td>
            <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: 'var(--fg-3)' }}>
              {session.model ?? '—'}
            </td>
            <td className="px-2 py-1.5 tabular-nums">{session.prompts}</td>
            <td className="px-2 py-1.5 tabular-nums">{formatTokens(session.totalTokens)}</td>
            {hasLimits && (
              <>
                <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--accent)' }}>
                  {formatPercent(session.percentUsed)}
                </td>
                <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--accent)' }}>
                  {formatPercent(session.percentWeeklyUsed)}
                </td>
              </>
            )}
            <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--fg-3)' }}>
              {formatTime(session.firstAt)}
            </td>
            <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--fg-3)' }}>
              {formatTime(session.lastAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
