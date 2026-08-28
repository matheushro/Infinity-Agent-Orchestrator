// Everything known about one prompt: the full text plus the context needed to
// judge its cost (terminal, model, requests, tokens, limit movement).
import { Modal } from '@renderer/components/ui'
import type { PromptUsage } from '@shared/types/usage'
import {
  cacheHitRate,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatTokens,
} from '../lib/format'

interface PromptDetailModalProps {
  entry: PromptUsage
  /** Agents without rate-limit logs (Claude) hide the limits section. */
  hasLimits: boolean
  onClose: () => void
}

export function PromptDetailModal({
  entry,
  hasLimits,
  onClose,
}: PromptDetailModalProps): JSX.Element {
  return (
    <Modal
      title="Detalhes do prompt"
      onClose={onClose}
      closeOnOverlay
      className="flex flex-col w-[min(880px,92vw)] max-h-[88vh]"
    >
      <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-4">
        <section>
          <SectionTitle>Prompt</SectionTitle>
          <pre
            className="text-[12.5px] p-3 rounded-[10px] whitespace-pre-wrap"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              color: 'var(--fg)',
              fontFamily: 'inherit',
              margin: 0,
            }}
          >
            {entry.prompt}
          </pre>
        </section>

        <section>
          <SectionTitle>Origem</SectionTitle>
          <Rows
            rows={[
              ['Terminal', entry.terminalTitle ?? entry.terminalId ?? 'fora do IAO'],
              ['Origem', entry.origin === 'iao' ? 'IAO (terminal do canvas)' : 'Codex externo'],
              ['Projeto', entry.projectCwd ?? '—'],
              ['Sessão', entry.sessionId],
              ['Modelo', entry.model ?? '—'],
              ['Esforço', entry.effort ?? '—'],
              ['Branch', entry.branch ?? '—'],
            ]}
          />
        </section>

        <section>
          <SectionTitle>Execução</SectionTitle>
          <Rows
            rows={[
              ['Início', formatDateTime(entry.timestamp)],
              ['Fim', formatDateTime(entry.endedAt)],
              ['Duração', formatDuration(entry.timestamp, entry.endedAt)],
              ['Requisições ao modelo', String(entry.requests)],
            ]}
          />
        </section>

        <section>
          <SectionTitle>Tokens</SectionTitle>
          <Rows
            rows={[
              ['Input', formatTokens(entry.inputTokens)],
              [
                'Cache',
                `${formatTokens(entry.cachedInputTokens)} (${cacheHitRate(
                  entry.inputTokens,
                  entry.cachedInputTokens,
                )} do input)`,
              ],
              ['Output', formatTokens(entry.outputTokens)],
              ['Raciocínio', formatTokens(entry.reasoningOutputTokens)],
              ['Total', formatTokens(entry.totalTokens)],
            ]}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--fg-3)' }}>
            Soma das {entry.requests} requisições do turno — cada chamada de ferramenta reenvia o
            contexto, por isso o input costuma ser bem maior que o texto do prompt.
          </p>
        </section>

        {hasLimits && (
        <section>
          <SectionTitle>Limites</SectionTitle>
          <Rows
            rows={[
              [
                'Janela 5h',
                `${formatPercent(entry.fiveHour.before)} → ${formatPercent(entry.fiveHour.after)} (consumo ${formatPercent(entry.fiveHour.used)})`,
              ],
              [
                'Janela semanal',
                `${formatPercent(entry.weekly.before)} → ${formatPercent(entry.weekly.after)} (consumo ${formatPercent(entry.weekly.used)})`,
              ],
            ]}
          />
        </section>
        )}
      </div>
    </Modal>
  )
}

function SectionTitle({ children }: { children: string }): JSX.Element {
  return (
    <h3 className="text-[12px] font-semibold mb-1.5" style={{ color: 'var(--fg-2)' }}>
      {children}
    </h3>
  )
}

function Rows({ rows }: { rows: [string, string][] }): JSX.Element {
  return (
    <dl className="text-[12px] grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt style={{ color: 'var(--fg-3)' }}>{label}</dt>
          <dd style={{ color: 'var(--fg)', margin: 0, wordBreak: 'break-word' }}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
