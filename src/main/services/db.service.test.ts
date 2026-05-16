import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- shared in-memory store (hoisted so vi.mock factory can reference it) ----

const store = vi.hoisted(() => ({
  terminals: new Map<string, Record<string, unknown>>(),
  edges: new Map<string, Record<string, unknown>>()
}))

const executedSql: string[] = []

// ---- boundary mocks ----

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/fake/userData') }
}))

// Full in-memory mock of better-sqlite3.
// better-sqlite3 was compiled for Electron's Node.js ABI and cannot be loaded
// in the plain Node.js test environment. We replicate only the subset of the
// API that db.service.ts actually calls (pragma, exec, prepare → all/run).
vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      pragma() { /* WAL mode — no-op in mock */ }
      exec(sql: string) {
        executedSql.push(sql)
      }

      prepare(sql: string) {
        return {
          all(): Record<string, unknown>[] {
            if (sql.includes('FROM terminals')) {
              return Array.from(store.terminals.values())
                .filter(t => t.active === 1)
                .sort((a, b) => (a.created_at as number) - (b.created_at as number))
            }
            if (sql.includes('FROM edges')) {
              return Array.from(store.edges.values())
                .sort((a, b) => (a.created_at as number) - (b.created_at as number))
                .map(({ id, source, target }) => ({ id, source, target }))
            }
            return []
          },

          run(...args: unknown[]) {
            if (sql.startsWith('INSERT INTO terminals')) {
              const rec = args[0] as Record<string, unknown>
              const existing = store.terminals.get(rec.id as string)
              store.terminals.set(
                rec.id as string,
                existing
                  ? { ...existing, ...rec, active: 1 }
                  : { ...rec, active: 1 }
              )
            } else if (sql.startsWith('INSERT INTO edges')) {
              const rec = args[0] as Record<string, unknown>
              const existing = store.edges.get(rec.id as string)
              store.edges.set(
                rec.id as string,
                existing
                  ? { ...existing, source: rec.source, target: rec.target, created_at: rec.created_at }
                  : { ...rec }
              )
            } else if (sql.includes('DELETE FROM edges WHERE source = ? OR target = ?')) {
              const id = args[0] as string
              for (const [key, edge] of store.edges) {
                if (edge.source === id || edge.target === id) store.edges.delete(key)
              }
            } else if (sql.includes('DELETE FROM terminals WHERE id = ?')) {
              store.terminals.delete(args[0] as string)
            } else if (sql.includes('DELETE FROM edges WHERE id = ?')) {
              store.edges.delete(args[0] as string)
            }
          }
        }
      }
    }
  }
})

import {
  initDb,
  listActiveTerminals,
  upsertTerminal,
  removeTerminal,
  listEdges,
  upsertEdge,
  removeEdge
} from './db.service'
import type { TerminalRecord, EdgeRecord } from '@shared/types/terminal'

// ---- helpers ----

let seq = 0

function makeTerminal(overrides: Partial<TerminalRecord> = {}): TerminalRecord {
  return {
    id: `term-${++seq}`,
    title: `Terminal ${seq}`,
    cwd: '/home/user',
    command: 'claude',
    shell: 'bash',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    ...overrides
  }
}

function makeEdge(overrides: Partial<EdgeRecord> = {}): EdgeRecord {
  return {
    id: `edge-${++seq}`,
    source: `term-src-${seq}`,
    target: `term-tgt-${seq}`,
    ...overrides
  }
}

beforeEach(() => {
  seq = 0
  store.terminals.clear()
  store.edges.clear()
  executedSql.length = 0
  initDb() // initializes the module-level `db` instance (mock: no-op schema ops)
})

// ===========================================================================
// initDb
// ===========================================================================

describe('initDb', () => {
  it('creates the terminals table — upsert succeeds without error', () => {
    expect(() => upsertTerminal(makeTerminal())).not.toThrow()
  })

  it('creates the edges table — upsertEdge succeeds without error', () => {
    const t1 = makeTerminal()
    const t2 = makeTerminal()
    upsertTerminal(t1)
    upsertTerminal(t2)
    expect(() => upsertEdge(makeEdge({ source: t1.id, target: t2.id }))).not.toThrow()
  })

  it('is idempotent (IF NOT EXISTS) — second call does not throw', () => {
    expect(() => initDb()).not.toThrow()
  })

  it('declares ON DELETE CASCADE on the edges foreign keys', () => {
    expect(executedSql.join('\n')).toContain(
      'FOREIGN KEY (source) REFERENCES terminals(id) ON DELETE CASCADE',
    )
    expect(executedSql.join('\n')).toContain(
      'FOREIGN KEY (target) REFERENCES terminals(id) ON DELETE CASCADE',
    )
  })
})

// ===========================================================================
// listActiveTerminals
// ===========================================================================

describe('listActiveTerminals', () => {
  it('returns an empty array when there are no terminals', () => {
    expect(listActiveTerminals()).toEqual([])
  })

  it('returns records that were just upserted (active = 1 by default)', () => {
    upsertTerminal(makeTerminal({ id: 'active-1' }))
    const results = listActiveTerminals()
    expect(results.some(r => r.id === 'active-1')).toBe(true)
  })

  it('returns multiple records ordered by created_at', () => {
    upsertTerminal(makeTerminal({ id: 'ord-1' }))
    upsertTerminal(makeTerminal({ id: 'ord-2' }))
    const ids = listActiveTerminals().map(r => r.id)
    expect(ids).toContain('ord-1')
    expect(ids).toContain('ord-2')
    // both inserted sequentially; created_at will be >= so order is stable
    expect(ids.indexOf('ord-1')).toBeLessThanOrEqual(ids.indexOf('ord-2'))
  })

  it('does not return a terminal after it has been removed', () => {
    upsertTerminal(makeTerminal({ id: 'gone-1' }))
    removeTerminal('gone-1')
    expect(listActiveTerminals().find(r => r.id === 'gone-1')).toBeUndefined()
  })
})

// ===========================================================================
// upsertTerminal
// ===========================================================================

describe('upsertTerminal', () => {
  it('inserts a new terminal with all provided fields', () => {
    const t = makeTerminal({ id: 'ins-1', title: 'My Term', cwd: '/projects/foo', x: 10, y: 20 })
    upsertTerminal(t)
    const found = listActiveTerminals().find(r => r.id === 'ins-1')
    expect(found).toBeDefined()
    expect(found?.title).toBe('My Term')
    expect(found?.cwd).toBe('/projects/foo')
    expect(found?.x).toBe(10)
    expect(found?.y).toBe(20)
  })

  it('updates an existing terminal on conflict, keeping only one row', () => {
    upsertTerminal(makeTerminal({ id: 'upd-1', title: 'Before', x: 0 }))
    upsertTerminal(makeTerminal({ id: 'upd-1', title: 'After', x: 500 }))
    const matches = listActiveTerminals().filter(r => r.id === 'upd-1')
    expect(matches.length).toBe(1)
    expect(matches[0].title).toBe('After')
    expect(matches[0].x).toBe(500)
  })

  it('ensures active = 1 on every upsert (record visible after re-insert)', () => {
    const t = makeTerminal({ id: 're-1' })
    upsertTerminal(t)
    upsertTerminal({ ...t, title: 'Updated' })
    const found = listActiveTerminals().find(r => r.id === 're-1')
    expect(found).toBeDefined()
  })
})

// ===========================================================================
// removeTerminal
// ===========================================================================

describe('removeTerminal', () => {
  it('removes the terminal record', () => {
    upsertTerminal(makeTerminal({ id: 'del-1' }))
    removeTerminal('del-1')
    expect(listActiveTerminals().find(r => r.id === 'del-1')).toBeUndefined()
  })

  it('cascades: removes edges where the terminal is the source', () => {
    upsertTerminal(makeTerminal({ id: 'src-1' }))
    upsertTerminal(makeTerminal({ id: 'tgt-1' }))
    upsertEdge(makeEdge({ id: 'e-src', source: 'src-1', target: 'tgt-1' }))
    removeTerminal('src-1')
    expect(listEdges().find(e => e.id === 'e-src')).toBeUndefined()
  })

  it('cascades: removes edges where the terminal is the target', () => {
    upsertTerminal(makeTerminal({ id: 'src-2' }))
    upsertTerminal(makeTerminal({ id: 'tgt-2' }))
    upsertEdge(makeEdge({ id: 'e-tgt', source: 'src-2', target: 'tgt-2' }))
    removeTerminal('tgt-2')
    expect(listEdges().find(e => e.id === 'e-tgt')).toBeUndefined()
  })

  it('does not remove unrelated edges', () => {
    upsertTerminal(makeTerminal({ id: 'rua' }))
    upsertTerminal(makeTerminal({ id: 'rub' }))
    upsertTerminal(makeTerminal({ id: 'ruc' }))
    upsertEdge(makeEdge({ id: 'e-ab', source: 'rua', target: 'rub' }))
    upsertEdge(makeEdge({ id: 'e-bc', source: 'rub', target: 'ruc' }))
    removeTerminal('rua')
    expect(listEdges().find(e => e.id === 'e-bc')).toBeDefined()
  })

  it('is a no-op when the id does not exist', () => {
    expect(() => removeTerminal('nonexistent')).not.toThrow()
  })
})

// ===========================================================================
// listEdges
// ===========================================================================

describe('listEdges', () => {
  it('returns an empty array when no edges exist', () => {
    expect(listEdges()).toEqual([])
  })

  it('returns all inserted edges', () => {
    upsertTerminal(makeTerminal({ id: 'le1' }))
    upsertTerminal(makeTerminal({ id: 'le2' }))
    upsertTerminal(makeTerminal({ id: 'le3' }))
    upsertEdge(makeEdge({ id: 'le-e1', source: 'le1', target: 'le2' }))
    upsertEdge(makeEdge({ id: 'le-e2', source: 'le2', target: 'le3' }))
    const edges = listEdges()
    expect(edges.length).toBe(2)
    expect(edges.map(e => e.id)).toContain('le-e1')
    expect(edges.map(e => e.id)).toContain('le-e2')
  })

  it('returns edges with id, source, and target fields (no created_at)', () => {
    upsertTerminal(makeTerminal({ id: 'lef1' }))
    upsertTerminal(makeTerminal({ id: 'lef2' }))
    upsertEdge(makeEdge({ id: 'lef-e', source: 'lef1', target: 'lef2' }))
    const [edge] = listEdges()
    expect(edge).toMatchObject({ id: 'lef-e', source: 'lef1', target: 'lef2' })
    expect((edge as Record<string, unknown>).created_at).toBeUndefined()
  })
})

// ===========================================================================
// upsertEdge
// ===========================================================================

describe('upsertEdge', () => {
  it('inserts a new edge correctly', () => {
    upsertEdge({ id: 'ue-new', source: 'eu1', target: 'eu2' })
    const found = listEdges().find(e => e.id === 'ue-new')
    expect(found).toBeDefined()
    expect(found?.source).toBe('eu1')
    expect(found?.target).toBe('eu2')
  })

  it('updates source and target on conflict (same id)', () => {
    upsertEdge({ id: 'ue-upd', source: 'e1', target: 'e2' })
    upsertEdge({ id: 'ue-upd', source: 'e2', target: 'e3' })
    const matches = listEdges().filter(e => e.id === 'ue-upd')
    expect(matches.length).toBe(1)
    expect(matches[0].source).toBe('e2')
    expect(matches[0].target).toBe('e3')
  })
})

// ===========================================================================
// removeEdge
// ===========================================================================

describe('removeEdge', () => {
  it('removes the edge by id', () => {
    upsertEdge({ id: 'rem-e', source: 're1', target: 're2' })
    removeEdge('rem-e')
    expect(listEdges().find(e => e.id === 'rem-e')).toBeUndefined()
  })

  it('does not remove other edges', () => {
    upsertEdge({ id: 'e-keep', source: 'ro1', target: 'ro2' })
    upsertEdge({ id: 'e-del', source: 'ro2', target: 'ro3' })
    removeEdge('e-del')
    expect(listEdges().find(e => e.id === 'e-keep')).toBeDefined()
  })

  it('is a no-op when the id does not exist', () => {
    expect(() => removeEdge('ghost-edge')).not.toThrow()
  })
})

// ===========================================================================
// FK ON DELETE CASCADE (enforced explicitly by removeTerminal's DELETE logic)
// ===========================================================================

describe('FK ON DELETE CASCADE', () => {
  it('orphan edges are gone after removeTerminal deletes their terminal', () => {
    upsertTerminal(makeTerminal({ id: 'fk-src' }))
    upsertTerminal(makeTerminal({ id: 'fk-tgt' }))
    upsertEdge({ id: 'fk-e', source: 'fk-src', target: 'fk-tgt' })
    removeTerminal('fk-src')
    expect(listEdges().find(e => e.id === 'fk-e')).toBeUndefined()
  })
})
