import { describe, it, expect } from 'vitest'
import type { TerminalRecord, EdgeRecord, ShellType } from './terminal'

describe('TerminalRecord — forma e campos obrigatórios', () => {
  it('aceita objeto com todos os campos requeridos', () => {
    const record: TerminalRecord = {
      id: 'node-1',
      title: 'My Terminal',
      cwd: '/home/user',
      command: 'claude',
      shell: 'bash',
      x: 100,
      y: 200,
      width: 800,
      height: 600
    }
    expect(record.id).toBe('node-1')
    expect(record.title).toBe('My Terminal')
    expect(record.cwd).toBe('/home/user')
    expect(record.command).toBe('claude')
    expect(record.shell).toBe('bash')
    expect(record.x).toBe(100)
    expect(record.y).toBe(200)
    expect(record.width).toBe(800)
    expect(record.height).toBe(600)
  })

  it('possui exatamente os 9 campos do schema SQLite (id, title, cwd, command, shell, x, y, width, height)', () => {
    const record: TerminalRecord = {
      id: 'a', title: 'b', cwd: 'c', command: 'd', shell: 'e',
      x: 0, y: 0, width: 1, height: 1
    }
    const keys = Object.keys(record).sort()
    expect(keys).toEqual(['command', 'cwd', 'height', 'id', 'shell', 'title', 'width', 'x', 'y'])
  })

  it('campos numéricos (x, y, width, height) aceitam valores negativos e zero', () => {
    const record: TerminalRecord = {
      id: 't', title: '', cwd: '', command: '', shell: '',
      x: -50, y: 0, width: 0, height: -10
    }
    expect(record.x).toBe(-50)
    expect(record.y).toBe(0)
  })
})

describe('EdgeRecord — forma e campos obrigatórios', () => {
  it('aceita objeto com id, source, target', () => {
    const edge: EdgeRecord = {
      id: 'edge-1',
      source: 'node-a',
      target: 'node-b'
    }
    expect(edge.id).toBe('edge-1')
    expect(edge.source).toBe('node-a')
    expect(edge.target).toBe('node-b')
  })

  it('possui exatamente 3 campos (id, source, target)', () => {
    const edge: EdgeRecord = { id: 'e', source: 's', target: 't' }
    const keys = Object.keys(edge).sort()
    expect(keys).toEqual(['id', 'source', 'target'])
  })
})

describe('ShellType — valores aceitos', () => {
  it("aceita 'default'", () => {
    const shell: ShellType = 'default'
    expect(['default', 'bash', 'zsh']).toContain(shell)
  })

  it("aceita 'bash'", () => {
    const shell: ShellType = 'bash'
    expect(['default', 'bash', 'zsh']).toContain(shell)
  })

  it("aceita 'zsh'", () => {
    const shell: ShellType = 'zsh'
    expect(['default', 'bash', 'zsh']).toContain(shell)
  })

  it('cobre exatamente 3 variantes (default | bash | zsh)', () => {
    // Verify via a type-safe exhaustive switch
    const assertExhaustive = (s: ShellType): string => {
      switch (s) {
        case 'default': return 'default'
        case 'bash': return 'bash'
        case 'zsh': return 'zsh'
      }
    }
    expect(assertExhaustive('default')).toBe('default')
    expect(assertExhaustive('bash')).toBe('bash')
    expect(assertExhaustive('zsh')).toBe('zsh')
  })
})
