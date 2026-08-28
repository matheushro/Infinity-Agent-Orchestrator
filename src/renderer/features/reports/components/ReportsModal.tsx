// Reports screen: prompt-by-prompt consumption for one day, per agent.
import { useEffect, useMemo, useState } from 'react'
import { Modal, Select, IChevRight, IRefresh } from '@renderer/components/ui'
import type { PromptUsage, UsageAgent } from '@shared/types/usage'
import { useUsageReport } from '../hooks/useUsageReport'
import { sumTotals, terminalOptions } from '../lib/aggregate'
import { formatPercent, formatTokens, shiftDay } from '../lib/format'
import { AgentTabs } from './AgentTabs'
import { PromptDetailModal } from './PromptDetailModal'
import { PromptUsageTable } from './PromptUsageTable'
import { SessionUsageTable } from './SessionUsageTable'

interface ReportsModalProps {
  onClose: () => void
}

export function ReportsModal({ onClose }: ReportsModalProps): JSX.Element {
  const [agent, setAgent] = useState<UsageAgent>('codex')
  const {
    day,
    setDay,
    maxDay,
    report,
    loading,
    fetching,
    onlyIao,
    setOnlyIao,
    error,
    live,
    setLive,
    refresh,
    stepDay,
  } = useUsageReport(agent)
  const [selected, setSelected] = useState<PromptUsage | null>(null)
  const [terminalId, setTerminalId] = useState<string | null>(null)

  const allEntries = report?.entries ?? []
  const allSessions = report?.sessions ?? []
  // Claude does not log rate-limit percentages — hide those columns and cards
  // instead of showing a column of dashes.
  const hasLimits = report?.hasLimits ?? false

  // Terminals that sent a prompt today, so the report can be narrowed to one.
  const terminals = useMemo(() => terminalOptions(allEntries), [allEntries])

  // Drop the terminal filter when that terminal has no prompts on the new day.
  useEffect(() => {
    if (terminalId && !terminals.some((option) => option.id === terminalId)) {
      setTerminalId(null)
    }
  }, [terminals, terminalId])

  const entries = terminalId
    ? allEntries.filter((entry) => entry.terminalId === terminalId)
    : allEntries
  const sessions = terminalId
    ? allSessions.filter((session) => session.terminalId === terminalId)
    : allSessions
  const totals = terminalId ? sumTotals(entries) : report?.totals

  const yesterday = shiftDay(maxDay, -1)

  return (
    <>
      <Modal
        title="Relatórios de consumo"
        // Escape closes the detail modal first: both dialogs answer the key, so
        // this handler must be a no-op while a prompt is open.
        onClose={() => (selected ? setSelected(null) : onClose())}
        className="flex flex-col w-[min(1360px,96vw)] h-[min(880px,93vh)]"
      >
        <div
          className="flex flex-col gap-2.5 mb-3 pb-3"
          style={{ borderBottom: '1px solid var(--line)', flexShrink: 0 }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <AgentTabs value={agent} onChange={setAgent} />

            <div className="w-px h-5 mx-1" style={{ background: 'var(--line)' }} />

            <div className="flex items-center gap-1">
              <QuickDayButton
                label="Hoje"
                active={day === maxDay}
                onClick={() => setDay(maxDay)}
              />
              <QuickDayButton
                label="Ontem"
                active={day === yesterday}
                onClick={() => setDay(yesterday)}
              />
            </div>

            <div
              className="flex items-center rounded-[8px] overflow-hidden"
              style={{ border: '1px solid var(--line-2)' }}
            >
              <button
                className="icon-btn !w-7 !h-7 !rounded-none"
                onClick={() => stepDay(-1)}
                aria-label="Dia anterior"
              >
                <span style={{ transform: 'rotate(180deg)', display: 'flex' }}>
                  <IChevRight size={12} />
                </span>
              </button>
              <input
                type="date"
                aria-label="Dia"
                value={day}
                max={maxDay}
                onChange={(e) => {
                  if (e.target.value) setDay(e.target.value)
                }}
                className="px-2 py-1 text-[12px] tabular-nums outline-none"
                style={{
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  borderLeft: '1px solid var(--line-2)',
                  borderRight: '1px solid var(--line-2)',
                  colorScheme: 'light dark',
                }}
              />
              <button
                className="icon-btn !w-7 !h-7 !rounded-none"
                onClick={() => stepDay(1)}
                aria-label="Próximo dia"
                disabled={day >= maxDay}
              >
                <IChevRight size={12} />
              </button>
            </div>

            <button className="icon-btn" onClick={refresh} aria-label="Atualizar agora">
              <IRefresh size={12} />
            </button>

            <div className="flex-1" />
            {fetching && (
              <span className="text-[12px]" style={{ color: 'var(--fg-3)' }}>
                lendo os logs…
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label
              className="flex items-center gap-1.5 text-[12px]"
              style={{ color: 'var(--fg-3)' }}
            >
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              Tempo real
            </label>
            <label
              className="flex items-center gap-1.5 text-[12px]"
              style={{ color: 'var(--fg-3)' }}
            >
              <input
                type="checkbox"
                checked={onlyIao}
                onChange={(e) => setOnlyIao(e.target.checked)}
              />
              Só prompts do IAO
            </label>

            <div className="w-px h-4" style={{ background: 'var(--line)' }} />

            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--fg-3)' }}>
              Terminal
              <Select
                ariaLabel="Filtrar por terminal do IAO"
                value={terminalId ?? ''}
                options={[
                  { value: '', label: 'Todos os terminais' },
                  ...terminals.map((option) => ({
                    value: option.id,
                    label: `${option.label} · ${option.prompts}`,
                  })),
                ]}
                onChange={(value) => setTerminalId(value || null)}
                className="min-w-[190px]"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-3" style={{ flexShrink: 0 }}>
          <StatCard label="Prompts" value={String(totals?.prompts ?? 0)} />
          <StatCard label="Tokens" value={formatTokens(totals?.totalTokens ?? 0)} />
          <StatCard label="Input" value={formatTokens(totals?.inputTokens ?? 0)} />
          <StatCard label="Cache" value={formatTokens(totals?.cachedInputTokens ?? 0)} />
          <StatCard label="Output" value={formatTokens(totals?.outputTokens ?? 0)} />
          {hasLimits && (
            <>
              <StatCard label="Consumo 5h" value={formatPercent(totals?.percentUsed ?? 0)} />
              <StatCard
                label="Consumo semana"
                value={formatPercent(totals?.percentWeeklyUsed ?? 0)}
              />
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {error && (
            <p className="text-[12px] py-4" style={{ color: 'var(--danger, #e5484d)' }}>
              Falha ao ler os logs: {error}
            </p>
          )}

          {loading && (
            <p className="text-[12px] py-4" style={{ color: 'var(--fg-3)' }}>
              Lendo as sessões de {day}…
            </p>
          )}

          {!loading && report?.missingRoot && (
            <p className="text-[12px] py-4" style={{ color: 'var(--fg-3)' }}>
              Pasta de sessões não encontrada em <code>{report.root}</code>.
            </p>
          )}

          {!loading && report && !report.missingRoot && entries.length === 0 && (
            <p className="text-[12px] py-4" style={{ color: 'var(--fg-3)' }}>
              Nenhum prompt em {day}
              {terminalId ? ' neste terminal' : onlyIao ? ' vindo de um terminal do IAO' : ''}.
            </p>
          )}

          {!loading && entries.length > 0 && (
            <>
              <PromptUsageTable entries={entries} hasLimits={hasLimits} onSelect={setSelected} />

              <details className="mt-3" style={{ flexShrink: 0 }}>
                <summary
                  className="text-[12px] font-semibold cursor-pointer"
                  style={{ color: 'var(--fg-2)' }}
                >
                  Por sessão ({sessions.length})
                </summary>
                <div className="mt-2 overflow-auto" style={{ maxHeight: 220 }}>
                  <SessionUsageTable sessions={sessions} hasLimits={hasLimits} />
                </div>
              </details>
            </>
          )}
        </div>
      </Modal>

      {selected && (
        <PromptDetailModal
          entry={selected}
          hasLimits={hasLimits}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

function QuickDayButton({
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
      aria-pressed={active}
      className="px-2.5 py-1 rounded-[8px] text-[12px]"
      style={{
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        background: active ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--fg-2)',
      }}
    >
      {label}
    </button>
  )
}

function StatCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      className="px-3 py-2 rounded-[10px] min-w-[104px]"
      style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
    >
      <div className="text-[11px]" style={{ color: 'var(--fg-3)' }}>
        {label}
      </div>
      <div className="text-[15px] tabular-nums" style={{ color: 'var(--fg)' }}>
        {value}
      </div>
    </div>
  )
}
