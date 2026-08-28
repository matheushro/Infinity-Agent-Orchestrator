// Reports screen: prompt-by-prompt consumption for one day, per agent.
import { useState } from 'react'
import { Modal, Select, IChevRight, IRefresh } from '@renderer/components/ui'
import type { PromptUsage, UsageAgent } from '@shared/types/usage'
import { useUsageReport } from '../hooks/useUsageReport'
import { formatPercent, formatTokens } from '../lib/format'
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
    days,
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
  const totals = report?.totals
  const entries = report?.entries ?? []
  // Claude does not log rate-limit percentages — hide those columns and cards
  // instead of showing a column of dashes.
  const hasLimits = report?.hasLimits ?? false

  return (
    <>
      <Modal
        title="Relatórios de consumo"
        // Escape closes the detail modal first: both dialogs answer the key, so
        // this handler must be a no-op while a prompt is open.
        onClose={() => (selected ? setSelected(null) : onClose())}
        className="flex flex-col w-[min(1360px,96vw)] h-[min(880px,93vh)]"
      >
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <AgentTabs value={agent} onChange={setAgent} />

          <div className="w-px h-5 mx-1" style={{ background: 'var(--line)' }} />

          <button className="icon-btn" onClick={() => stepDay(-1)} aria-label="Dia anterior">
            <span style={{ transform: 'rotate(180deg)', display: 'flex' }}>
              <IChevRight size={12} />
            </span>
          </button>
          <Select
            ariaLabel="Dia"
            value={day}
            options={days.map((value) => ({ value, label: value }))}
            onChange={setDay}
            className="min-w-[150px]"
          />
          <button className="icon-btn" onClick={() => stepDay(1)} aria-label="Próximo dia">
            <IChevRight size={12} />
          </button>

          <button className="icon-btn" onClick={refresh} aria-label="Atualizar agora">
            <IRefresh size={12} />
          </button>
          <label className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--fg-3)' }}>
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Tempo real
          </label>
          <label className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--fg-3)' }}>
            <input
              type="checkbox"
              checked={onlyIao}
              onChange={(e) => setOnlyIao(e.target.checked)}
            />
            Só prompts do IAO
          </label>

          <div className="flex-1" />
          {fetching && (
            <span className="text-[12px]" style={{ color: 'var(--fg-3)' }}>
              lendo os logs…
            </span>
          )}
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
              {onlyIao ? ' vindo de um terminal do IAO' : ''}.
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
                  Por sessão ({report?.sessions.length ?? 0})
                </summary>
                <div className="mt-2 overflow-auto" style={{ maxHeight: 220 }}>
                  <SessionUsageTable sessions={report?.sessions ?? []} hasLimits={hasLimits} />
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
