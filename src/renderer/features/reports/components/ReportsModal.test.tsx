import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptUsage, UsageReport } from '@shared/types/usage'
import { ReportsModal } from './ReportsModal'

const listDays = vi.fn()
const loadReport = vi.fn()

const entry: PromptUsage = {
  id: 'a#0',
  timestamp: new Date(2026, 7, 28, 9, 12).toISOString(),
  sessionId: 'sess-1',
  cwd: '/home/dev/repos/app',
  model: 'gpt-5.6-sol',
  effort: 'medium',
  branch: 'main',
  prompt: 'ajusta o layout do terminal',
  requests: 3,
  endedAt: new Date(2026, 7, 28, 9, 13).toISOString(),
  origin: 'iao',
  terminalId: 'term-7',
  terminalTitle: 'API Codex',
  projectCwd: '/home/dev/repos/app',
  inputTokens: 17_648,
  cachedInputTokens: 11_008,
  outputTokens: 246,
  reasoningOutputTokens: 44,
  totalTokens: 17_894,
  fiveHour: { before: 3, after: 4, used: 1 },
  weekly: { before: 30, after: 31, used: 1 },
}

function report(overrides: Partial<UsageReport> = {}): UsageReport {
  return {
    agent: 'codex',
    hasLimits: true,
    day: '2026-08-28',
    root: '/logs',
    missingRoot: false,
    entries: [entry],
    sessions: [
      {
        sessionId: 'sess-1',
        cwd: '/home/dev/repos/app/.iao/roles/term-7',
        projectCwd: '/home/dev/repos/app',
        model: 'gpt-5.6-sol',
        origin: 'iao',
        terminalId: 'term-7',
        terminalTitle: 'API Codex',
        prompts: 1,
        totalTokens: 17_894,
        percentUsed: 1,
        percentWeeklyUsed: 0.4,
        firstAt: entry.timestamp,
        lastAt: entry.timestamp,
      },
    ],
    totals: {
      prompts: 1,
      inputTokens: 17_648,
      cachedInputTokens: 11_008,
      outputTokens: 246,
      totalTokens: 17_894,
      percentUsed: 1,
      percentWeeklyUsed: 0.4,
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listDays.mockResolvedValue(['2026-08-28'])
  loadReport.mockResolvedValue(report())
  ;(window as unknown as { usageApi: unknown }).usageApi = { days: listDays, report: loadReport }
})

describe('ReportsModal', () => {
  it('mostra os totais do dia, o prompt e o resumo por sessão', async () => {
    render(<ReportsModal onClose={vi.fn()} />)

    expect(await screen.findByText('ajusta o layout do terminal')).toBeInTheDocument()
    // total do card, da linha do prompt e do resumo por sessão
    expect(screen.getAllByText('17.9k').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('1.0%').length).toBeGreaterThan(0)
    expect(screen.getByText(/Por sessão/)).toBeInTheDocument()
    expect(screen.getAllByText('API Codex').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Consumo semana').length).toBeGreaterThan(0)
  })

  it('avisa quando o dia não tem prompts', async () => {
    loadReport.mockResolvedValue(report({ entries: [], sessions: [] }))
    render(<ReportsModal onClose={vi.fn()} />)

    expect(await screen.findByText(/Nenhum prompt em/)).toBeInTheDocument()
  })

  it('avisa quando a pasta de sessões não existe', async () => {
    loadReport.mockResolvedValue(report({ entries: [], sessions: [], missingRoot: true }))
    render(<ReportsModal onClose={vi.fn()} />)

    expect(await screen.findByText(/Pasta de sessões não encontrada/)).toBeInTheDocument()
  })

  it('recarrega ao pedir o dia anterior', async () => {
    render(<ReportsModal onClose={vi.fn()} />)
    await screen.findByText('ajusta o layout do terminal')

    fireEvent.click(screen.getByLabelText('Dia anterior'))

    await waitFor(() => expect(loadReport).toHaveBeenCalledTimes(2))
  })

  it('abre o modal de detalhe ao clicar na linha do prompt', async () => {
    render(<ReportsModal onClose={vi.fn()} />)
    const row = await screen.findByText('ajusta o layout do terminal')

    fireEvent.click(row)

    expect(await screen.findByText('Detalhes do prompt')).toBeInTheDocument()
    expect(screen.getByText('Requisições ao modelo')).toBeInTheDocument()
    expect(screen.getByText('IAO (terminal do canvas)')).toBeInTheDocument()
  })

  it('mostra o loading enquanto lê os logs', async () => {
    let resolveReport: ((value: UsageReport) => void) | undefined
    loadReport.mockReturnValue(
      new Promise<UsageReport>((resolve) => {
        resolveReport = resolve
      }),
    )
    render(<ReportsModal onClose={vi.fn()} />)

    expect(await screen.findByText(/Lendo as sessões/)).toBeInTheDocument()

    resolveReport?.(report())
    expect(await screen.findByText('ajusta o layout do terminal')).toBeInTheDocument()
  })

  it('pagina os prompts do dia sem esconder nenhum', async () => {
    const many = Array.from({ length: 120 }, (_, index) => ({
      ...entry,
      id: `a#${index}`,
      prompt: `prompt ${index}`,
    }))
    loadReport.mockResolvedValue(report({ entries: many, totals: { ...report().totals, prompts: 120 } }))
    render(<ReportsModal onClose={vi.fn()} />)

    expect(await screen.findByText('1–50 de 120 prompts')).toBeInTheDocument()
    expect(screen.getByText('prompt 0')).toBeInTheDocument()
    expect(screen.queryByText('prompt 50')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Próxima'))

    expect(screen.getByText('prompt 50')).toBeInTheDocument()
    expect(screen.getByText('51–100 de 120 prompts')).toBeInTheDocument()
  })

  it('troca de agente pelas abas e esconde os limites quando o agente não os registra', async () => {
    render(<ReportsModal onClose={vi.fn()} />)
    await screen.findByText('ajusta o layout do terminal')
    expect(screen.getByRole('tab', { name: /Codex/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText('Consumo 5h').length).toBeGreaterThan(0)

    loadReport.mockResolvedValue(report({ agent: 'claude', hasLimits: false }))
    fireEvent.click(screen.getByRole('tab', { name: /Claude/ }))

    await waitFor(() =>
      expect(loadReport).toHaveBeenCalledWith({
        agent: 'claude',
        day: expect.any(String),
        onlyIao: false,
      }),
    )
    await waitFor(() => expect(screen.queryByText('Consumo 5h')).not.toBeInTheDocument())
    expect(screen.queryByText('5h consumo')).not.toBeInTheDocument()
    expect(screen.getByText('ajusta o layout do terminal')).toBeInTheDocument()
  })

  it('recarrega ao clicar no atalho "Ontem"', async () => {
    render(<ReportsModal onClose={vi.fn()} />)
    await screen.findByText('ajusta o layout do terminal')

    fireEvent.click(screen.getByRole('button', { name: 'Ontem' }))

    await waitFor(() => expect(loadReport).toHaveBeenCalledTimes(2))
    const lastDay = loadReport.mock.calls.at(-1)?.[0].day as string
    const firstDay = loadReport.mock.calls[0][0].day as string
    expect(lastDay < firstDay).toBe(true)
    expect(screen.getByRole('button', { name: 'Ontem' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('filtra a tabela por um terminal específico do IAO', async () => {
    const outra: PromptUsage = {
      ...entry,
      id: 'b#0',
      prompt: 'prompt de outro terminal',
      origin: 'iao',
      terminalId: 'term-9',
      terminalTitle: 'Web Codex',
    }
    loadReport.mockResolvedValue(
      report({ entries: [entry, outra], totals: { ...report().totals, prompts: 2 } }),
    )
    render(<ReportsModal onClose={vi.fn()} />)
    await screen.findByText('ajusta o layout do terminal')
    expect(screen.getByText('prompt de outro terminal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar por terminal do IAO' }))
    fireEvent.click(screen.getByRole('option', { name: /API Codex/ }))

    await waitFor(() =>
      expect(screen.queryByText('prompt de outro terminal')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('ajusta o layout do terminal')).toBeInTheDocument()
  })

  it('ordena a tabela ao clicar no cabeçalho de uma coluna', async () => {
    const rows = [
      { ...entry, id: 'r0', prompt: 'menor', totalTokens: 10 },
      { ...entry, id: 'r1', prompt: 'maior', totalTokens: 999_999 },
    ]
    loadReport.mockResolvedValue(report({ entries: rows }))
    render(<ReportsModal onClose={vi.fn()} />)
    await screen.findByText('menor')

    fireEvent.click(screen.getByText('Total'))

    const cells = screen.getAllByRole('cell')
    const promptCells = cells
      .map((cell) => cell.textContent)
      .filter((text) => text === 'menor' || text === 'maior')
    expect(promptCells).toEqual(['maior', 'menor'])
  })

  it('filtra somente os prompts enviados pelo IAO', async () => {
    render(<ReportsModal onClose={vi.fn()} />)
    await screen.findByText('ajusta o layout do terminal')

    fireEvent.click(screen.getByLabelText('Só prompts do IAO'))

    await waitFor(() =>
      expect(loadReport).toHaveBeenCalledWith({
        agent: 'codex',
        day: expect.any(String),
        onlyIao: true,
      }),
    )
  })
})
