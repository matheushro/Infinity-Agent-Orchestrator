// Prompt-by-prompt table: what was asked and what it cost. Paginated so a heavy
// day (hundreds of prompts) stays readable; a row opens the detail modal.
// Every column except Prompt sorts on click (click again to flip, a third time
// to clear and fall back to chronological order).
import { useEffect, useMemo, useState } from 'react'
import type { PromptUsage } from '@shared/types/usage'
import { formatPercent, formatTime, formatTokens, shortPath } from '../lib/format'

/** Rows per page — a heavy day can hold hundreds of prompts. */
export const PAGE_SIZE = 50

interface PromptUsageTableProps {
  entries: PromptUsage[]
  /** Agents that log rate limits get the limit columns; the others do not. */
  hasLimits: boolean
  onSelect: (entry: PromptUsage) => void
}

const BASE_HEAD = ['Hora', 'Prompt', 'Terminal', 'Modelo', 'Req', 'Input', 'Cache', 'Output', 'Total']
const LIMIT_HEAD = ['5h antes', '5h atual', '5h consumo', 'Semana consumo']

type SortDir = 'asc' | 'desc'
type SortValue = string | number

/** How each sortable header pulls its comparison key off a row. */
const SORT_KEYS: Record<string, (entry: PromptUsage) => SortValue> = {
  Hora: (entry) => entry.timestamp,
  Terminal: (entry) =>
    (entry.terminalTitle ?? entry.terminalId ?? entry.projectCwd ?? '').toLowerCase(),
  Modelo: (entry) => (entry.model ?? '').toLowerCase(),
  Req: (entry) => entry.requests,
  Input: (entry) => entry.inputTokens,
  Cache: (entry) => entry.cachedInputTokens,
  Output: (entry) => entry.outputTokens,
  Total: (entry) => entry.totalTokens,
  '5h antes': (entry) => entry.fiveHour.before ?? -1,
  '5h atual': (entry) => entry.fiveHour.after ?? -1,
  '5h consumo': (entry) => entry.fiveHour.used ?? -1,
  'Semana consumo': (entry) => entry.weekly.used ?? -1,
}

export function PromptUsageTable({
  entries,
  hasLimits,
  onSelect,
}: PromptUsageTableProps): JSX.Element {
  const head = hasLimits ? [...BASE_HEAD, ...LIMIT_HEAD] : BASE_HEAD
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return entries
    const read = SORT_KEYS[sort.key]
    if (!read) return entries
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...entries].sort((a, b) => {
      const left = read(a)
      const right = read(b)
      if (left < right) return -1 * factor
      if (left > right) return 1 * factor
      return 0
    })
  }, [entries, sort])

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))

  // A new day (or filter) can be shorter than the page we were on.
  useEffect(() => {
    setPage((current) => Math.min(current, pages - 1))
  }, [pages])

  function toggleSort(label: string): void {
    if (!SORT_KEYS[label]) return
    setPage(0)
    setSort((current) => {
      if (current?.key !== label) return { key: label, dir: 'desc' }
      if (current.dir === 'desc') return { key: label, dir: 'asc' }
      return null
    })
  }

  const start = page * PAGE_SIZE
  const visible = sorted.slice(start, start + PAGE_SIZE)

  return (
    <>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--fg-3)' }}>
              {head.map((label) => {
                const sortable = Boolean(SORT_KEYS[label])
                const active = sort?.key === label
                return (
                  <th
                    key={label}
                    onClick={() => toggleSort(label)}
                    aria-sort={
                      active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className="text-left font-medium px-2 py-1.5 whitespace-nowrap"
                    style={{
                      borderBottom: '1px solid var(--line)',
                      position: 'sticky',
                      top: 0,
                      background: 'var(--bg-2)',
                      zIndex: 1,
                      cursor: sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      color: active ? 'var(--fg)' : undefined,
                    }}
                    title={sortable ? 'Ordenar' : undefined}
                  >
                    {label}
                    {active ? (sort?.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr
                key={entry.id}
                onClick={() => onSelect(entry)}
                title="Ver detalhes do prompt"
                style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
              >
                <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: 'var(--fg-3)' }}>
                  {formatTime(entry.timestamp)}
                </td>
                <td
                  className="px-2 py-1.5"
                  style={{
                    maxWidth: 360,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.prompt}
                </td>
                <td
                  className="px-2 py-1.5 whitespace-nowrap"
                  title={entry.cwd ?? ''}
                  style={{ color: entry.origin === 'iao' ? 'var(--fg)' : 'var(--fg-3)' }}
                >
                  {entry.terminalTitle ?? entry.terminalId ?? `externo · ${shortPath(entry.projectCwd)}`}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: 'var(--fg-3)' }}>
                  {entry.model ?? '—'}
                </td>
                <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--fg-3)' }}>
                  {entry.requests}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{formatTokens(entry.inputTokens)}</td>
                <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--fg-3)' }}>
                  {formatTokens(entry.cachedInputTokens)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{formatTokens(entry.outputTokens)}</td>
                <td className="px-2 py-1.5 tabular-nums" style={{ fontWeight: 500 }}>
                  {formatTokens(entry.totalTokens)}
                </td>
                {hasLimits && (
                  <>
                    <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--fg-3)' }}>
                      {formatPercent(entry.fiveHour.before)}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--fg-3)' }}>
                      {formatPercent(entry.fiveHour.after)}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--accent)' }}>
                      {formatPercent(entry.fiveHour.used)}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums" style={{ color: 'var(--accent)' }}>
                      {formatPercent(entry.weekly.used)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="flex items-center gap-2 pt-2 text-[12px]"
        style={{ color: 'var(--fg-3)', flexShrink: 0 }}
      >
        <span>
          {start + 1}–{Math.min(start + PAGE_SIZE, sorted.length)} de {sorted.length} prompts
        </span>
        <div className="flex-1" />
        <button
          className="icon-btn !w-auto px-2"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0}
        >
          Anterior
        </button>
        <span>
          {page + 1}/{pages}
        </span>
        <button
          className="icon-btn !w-auto px-2"
          onClick={() => setPage((current) => Math.min(pages - 1, current + 1))}
          disabled={page >= pages - 1}
        >
          Próxima
        </button>
      </div>
    </>
  )
}
