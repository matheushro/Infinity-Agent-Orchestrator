import { describe, it, expect } from 'vitest'
import {
  cacheHitRate,
  clampDay,
  formatDuration,
  formatPercent,
  formatTokens,
  isFutureDay,
  localDay,
  shiftDay,
  shortPath,
} from './format'

describe('localDay / shiftDay', () => {
  it('formata uma data local como YYYY-MM-DD', () => {
    expect(localDay(new Date(2026, 7, 5, 23, 30))).toBe('2026-08-05')
  })

  it('anda dias respeitando virada de mês', () => {
    expect(shiftDay('2026-08-01', -1)).toBe('2026-07-31')
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01')
  })
})

describe('isFutureDay / clampDay', () => {
  it('reconhece e limita dias após hoje', () => {
    expect(isFutureDay('2026-08-29', '2026-08-28')).toBe(true)
    expect(isFutureDay('2026-08-28', '2026-08-28')).toBe(false)
    expect(clampDay('2026-08-29', '2026-08-28')).toBe('2026-08-28')
    expect(clampDay('2026-08-20', '2026-08-28')).toBe('2026-08-20')
  })
})

describe('formatTokens', () => {
  it('abrevia milhares e milhões', () => {
    expect(formatTokens(940)).toBe('940')
    expect(formatTokens(17_894)).toBe('17.9k')
    expect(formatTokens(2_500_000)).toBe('2.50M')
  })
})

describe('formatPercent', () => {
  it('mostra um traço quando o percentual é desconhecido', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(3)).toBe('3.0%')
  })
})

describe('shortPath', () => {
  it('mostra as duas últimas pastas do caminho', () => {
    expect(shortPath('/home/dev/repos/app')).toBe('repos/app')
    expect(shortPath(null)).toBe('—')
  })
})

describe('formatDuration', () => {
  it('mostra segundos e minutos entre o prompt e a última requisição', () => {
    const start = new Date(2026, 7, 28, 9, 0, 0).toISOString()
    expect(formatDuration(start, new Date(2026, 7, 28, 9, 0, 42).toISOString())).toBe('42s')
    expect(formatDuration(start, new Date(2026, 7, 28, 9, 1, 5).toISOString())).toBe('1m 05s')
    expect(formatDuration(start, 'nada')).toBe('—')
  })
})

describe('cacheHitRate', () => {
  it('mostra a fatia do input servida por cache', () => {
    expect(cacheHitRate(1000, 620)).toBe('62%')
    expect(cacheHitRate(0, 0)).toBe('—')
  })
})
