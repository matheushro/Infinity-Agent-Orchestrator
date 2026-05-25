import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- shared in-memory store (hoisted so vi.mock factory can reference it) ----

const store = vi.hoisted(() => ({
  terminals: new Map<string, Record<string, unknown>>(),
  edges: new Map<string, Record<string, unknown>>(),
  canvasTexts: new Map<string, Record<string, unknown>>(),
  workspaces: new Map<string, Record<string, unknown>>(),
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
        if (/DELETE\s+FROM\s+terminals\s+WHERE\s+workspace_id\s+NOT\s+IN\s+\(\s*SELECT\s+id\s+FROM\s+workspaces\s*\)/i.test(sql)) {
          const validIds = new Set(Array.from(store.workspaces.keys()))
          for (const [key, t] of store.terminals) {
            if (!validIds.has(t.workspace_id as string)) store.terminals.delete(key)
          }
        }
      }

      prepare(sql: string) {
        return {
          all(...args: unknown[]): Record<string, unknown>[] {
            if (sql.includes('FROM terminals')) {
              let rows = Array.from(store.terminals.values()).filter(t => t.active === 1)
              // workspace_id filter support
              if (sql.includes('workspace_id = ?') && args[0]) {
                rows = rows.filter(t => t.workspace_id === args[0])
              }
              return rows.sort((a, b) => (a.created_at as number) - (b.created_at as number))
            }
            if (sql.includes('FROM edges')) {
              return Array.from(store.edges.values())
                .sort((a, b) => (a.created_at as number) - (b.created_at as number))
                .map(({ id, source, target }) => ({ id, source, target }))
            }
            if (sql.includes('FROM canvas_texts')) {
              return Array.from(store.canvasTexts.values())
                .filter(t => !sql.includes('workspace_id = ?') || t.workspace_id === args[0])
                .sort((a, b) => (a.created_at as number) - (b.created_at as number))
                .map(({ id, text, x, y, width, height, workspace_id }) => ({
                  id,
                  text,
                  x,
                  y,
                  width,
                  height,
                  workspace_id,
                }))
            }
            if (sql.includes('FROM workspaces')) {
              return Array.from(store.workspaces.values())
                .sort((a, b) => (a.created_at as number) - (b.created_at as number))
            }
            return []
          },

          get(...args: unknown[]): Record<string, unknown> | null {
            if (sql.includes('COUNT(*) as n FROM workspaces')) {
              return { n: store.workspaces.size }
            }
            if (sql.includes('MAX(position)') && sql.includes('FROM workspaces')) {
              let max = -1
              for (const w of store.workspaces.values()) {
                const p = typeof w.position === 'number' ? w.position : -1
                if (p > max) max = p
              }
              return { m: max }
            }
            if (sql.startsWith('SELECT * FROM workspaces WHERE id = ?')) {
              return store.workspaces.get(args[0] as string) ?? null
            }
            return null
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
            } else if (sql.startsWith('INSERT INTO workspaces')) {
              if (typeof args[0] === 'object' && args[0] !== null) {
                // named params: createWorkspace uses @id/@name/@created_at
                const rec = args[0] as Record<string, unknown>
                store.workspaces.set(rec.id as string, { ...rec })
              } else {
                // positional params: initDb seed uses (?, ?, ?)
                const id = args[0] as string
                store.workspaces.set(id, { id, name: args[1], created_at: args[2] })
              }
            } else if (sql.startsWith('INSERT INTO edges')) {
              const rec = args[0] as Record<string, unknown>
              const existing = store.edges.get(rec.id as string)
              store.edges.set(
                rec.id as string,
                existing
                  ? { ...existing, source: rec.source, target: rec.target, created_at: rec.created_at }
                  : { ...rec }
              )
            } else if (sql.startsWith('INSERT INTO canvas_texts')) {
              const rec = args[0] as Record<string, unknown>
              const existing = store.canvasTexts.get(rec.id as string)
              store.canvasTexts.set(
                rec.id as string,
                existing
                  ? { ...existing, ...rec, created_at: existing.created_at }
                  : { ...rec }
              )
            } else if (sql.includes('UPDATE terminals SET workspace_id')) {
              // migration: assign orphaned terminals to default workspace
              for (const [key, t] of store.terminals) {
                if (!t.workspace_id || t.workspace_id === '') {
                  store.terminals.set(key, { ...t, workspace_id: args[0] })
                }
              }
            } else if (sql.includes('DELETE FROM edges WHERE source = ? OR target = ?')) {
              const id = args[0] as string
              for (const [key, edge] of store.edges) {
                if (edge.source === id || edge.target === id) store.edges.delete(key)
              }
            } else if (sql.includes('DELETE FROM terminals WHERE id = ?')) {
              store.terminals.delete(args[0] as string)
            } else if (sql.includes('DELETE FROM edges WHERE id = ?')) {
              store.edges.delete(args[0] as string)
            } else if (sql.includes('DELETE FROM canvas_texts WHERE id = ?')) {
              store.canvasTexts.delete(args[0] as string)
            } else if (sql.includes('DELETE FROM workspaces WHERE id = ?')) {
              store.workspaces.delete(args[0] as string)
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
  removeEdge,
  listCanvasTexts,
  upsertCanvasText,
  removeCanvasText,
  listWorkspaces,
  createWorkspace,
  deleteWorkspace,
} from './db.service'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { TerminalRecord, EdgeRecord } from '@shared/types/terminal'
import type { WorkspaceRecord } from '@shared/types/workspace'

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
    workspace_id: 'default',
    ...overrides
  }
}

function makeWorkspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    id: `ws-${++seq}`,
    name: `Workspace ${seq}`,
    created_at: seq * 1000,
    ...overrides,
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

function makeCanvasText(overrides: Partial<CanvasTextRecord> = {}): CanvasTextRecord {
  return {
    id: `text-${++seq}`,
    text: `Text ${seq}`,
    x: 10,
    y: 20,
    width: 220,
    height: 44,
    workspace_id: 'default',
    ...overrides,
  }
}

beforeEach(() => {
  seq = 0
  store.terminals.clear()
  store.edges.clear()
  store.canvasTexts.clear()
  store.workspaces.clear()
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

  it('sweeps terminals whose workspace no longer exists on startup', () => {
    // Pre-seed: a valid workspace and a terminal in a workspace that was deleted.
    store.workspaces.set('valid-ws', { id: 'valid-ws', name: 'Valid', created_at: 1 })
    store.terminals.set('keep', {
      id: 'keep',
      title: 'Keep',
      cwd: '/x',
      command: 'claude',
      shell: 'bash',
      x: 0, y: 0, width: 100, height: 100,
      workspace_id: 'valid-ws',
      active: 1,
      created_at: 1,
    })
    store.terminals.set('orphan', {
      id: 'orphan',
      title: 'Orphan',
      cwd: '/x',
      command: 'claude',
      shell: 'bash',
      x: 0, y: 0, width: 100, height: 100,
      workspace_id: 'deleted-ws',
      active: 1,
      created_at: 1,
    })

    initDb()

    expect(store.terminals.has('keep')).toBe(true)
    expect(store.terminals.has('orphan')).toBe(false)
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

// ===========================================================================
// initDb — workspace schema & seed (2.1-2.6)
// ===========================================================================

describe('initDb — workspace schema', () => {
  it('2.1 creates the workspaces table — createWorkspace succeeds without error', () => {
    expect(() => createWorkspace(makeWorkspace())).not.toThrow()
  })

  it('2.2 adds workspace_id column to terminals — upsert with workspace_id succeeds', () => {
    expect(() => upsertTerminal(makeTerminal({ workspace_id: 'ws-abc' }))).not.toThrow()
  })

  it('2.4 on first run seeds a default workspace row', () => {
    // beforeEach clears store and calls initDb fresh each time.
    const workspaces = listWorkspaces()
    expect(workspaces.some((w) => w.id === 'default')).toBe(true)
  })

  it('2.5 on second run does not insert a duplicate default workspace', () => {
    initDb()
    const defaults = listWorkspaces().filter((w) => w.id === 'default')
    expect(defaults.length).toBe(1)
  })

  it('2.6 orphaned terminals (empty workspace_id) are reassigned to default on init', () => {
    // Insert a terminal with no workspace_id by setting it blank, then re-init.
    store.terminals.set('orphan', {
      id: 'orphan', title: 'T', cwd: '/', command: 'claude',
      shell: 'bash', x: 0, y: 0, width: 800, height: 600, active: 1,
      created_at: 1, workspace_id: '',
    })
    store.workspaces.clear()
    initDb()
    const t = store.terminals.get('orphan')
    expect(t?.workspace_id).toBe('default')
  })
})

// ===========================================================================
// listWorkspaces (2.7-2.9)
// ===========================================================================

describe('listWorkspaces', () => {
  it('2.7 returns empty array when no workspaces exist (after clearing seed)', () => {
    store.workspaces.clear()
    expect(listWorkspaces()).toEqual([])
  })

  it('2.8 returns all inserted workspace records ordered by created_at', () => {
    store.workspaces.clear()
    const w1 = makeWorkspace({ id: 'lw-1', created_at: 1000 })
    const w2 = makeWorkspace({ id: 'lw-2', created_at: 2000 })
    createWorkspace(w2)
    createWorkspace(w1)
    const result = listWorkspaces()
    expect(result.map((w) => w.id)).toEqual(['lw-1', 'lw-2'])
  })

  it('2.9 each record contains id, name, created_at', () => {
    store.workspaces.clear()
    const w = makeWorkspace({ id: 'lw-fields', name: 'My WS', created_at: 9999 })
    createWorkspace(w)
    const [found] = listWorkspaces()
    expect(found).toMatchObject({ id: 'lw-fields', name: 'My WS', created_at: 9999 })
  })
})

// ===========================================================================
// createWorkspace (2.10-2.11)
// ===========================================================================

describe('createWorkspace', () => {
  it('2.10 inserts a workspace row that appears in listWorkspaces', () => {
    store.workspaces.clear()
    const w = makeWorkspace({ id: 'cw-1' })
    createWorkspace(w)
    expect(listWorkspaces().some((r) => r.id === 'cw-1')).toBe(true)
  })

  it('2.11 creating two workspaces with the same id does not insert a duplicate', () => {
    store.workspaces.clear()
    const w = makeWorkspace({ id: 'cw-dup' })
    createWorkspace(w)
    createWorkspace(w)
    expect(listWorkspaces().filter((r) => r.id === 'cw-dup').length).toBe(1)
  })
})

// ===========================================================================
// deleteWorkspace (2.12-2.13)
// ===========================================================================

describe('deleteWorkspace', () => {
  it('2.12 removes the workspace row so it no longer appears in listWorkspaces', () => {
    store.workspaces.clear()
    const w = makeWorkspace({ id: 'dw-1' })
    createWorkspace(w)
    deleteWorkspace('dw-1')
    expect(listWorkspaces().some((r) => r.id === 'dw-1')).toBe(false)
  })

  it('2.13 is a no-op when the id does not exist', () => {
    expect(() => deleteWorkspace('nonexistent-ws')).not.toThrow()
  })
})

// ===========================================================================
// listActiveTerminals with workspace filter (2.15-2.16)
// ===========================================================================

describe('listActiveTerminals — workspace filter', () => {
  it('2.15 with a workspaceId argument returns only terminals belonging to that workspace', () => {
    upsertTerminal(makeTerminal({ id: 'ws-a-term', workspace_id: 'ws-a' }))
    upsertTerminal(makeTerminal({ id: 'ws-b-term', workspace_id: 'ws-b' }))
    const result = listActiveTerminals('ws-a')
    expect(result.map((r) => r.id)).toContain('ws-a-term')
    expect(result.map((r) => r.id)).not.toContain('ws-b-term')
  })

  it('2.16 terminals from other workspaces are excluded from a scoped query', () => {
    upsertTerminal(makeTerminal({ id: 'scope-1', workspace_id: 'ws-x' }))
    upsertTerminal(makeTerminal({ id: 'scope-2', workspace_id: 'ws-y' }))
    const result = listActiveTerminals('ws-x')
    expect(result.every((r) => r.workspace_id === 'ws-x')).toBe(true)
  })
})

// ===========================================================================
// Canvas text elements
// ===========================================================================

describe('canvas text persistence', () => {
  it('lists text elements scoped to a workspace', () => {
    upsertCanvasText(makeCanvasText({ id: 'text-a', workspace_id: 'ws-a' }))
    upsertCanvasText(makeCanvasText({ id: 'text-b', workspace_id: 'ws-b' }))

    expect(listCanvasTexts('ws-a').map((text) => text.id)).toEqual(['text-a'])
  })

  it('upserts text content and layout fields', () => {
    upsertCanvasText(makeCanvasText({ id: 'text-upsert', text: 'Before', x: 10 }))
    upsertCanvasText(makeCanvasText({ id: 'text-upsert', text: 'After', x: 42 }))

    const [found] = listCanvasTexts('default').filter((text) => text.id === 'text-upsert')
    expect(found).toMatchObject({ text: 'After', x: 42, width: 220, height: 44 })
  })

  it('removes a text element by id', () => {
    upsertCanvasText(makeCanvasText({ id: 'text-gone' }))

    removeCanvasText('text-gone')

    expect(listCanvasTexts('default').some((text) => text.id === 'text-gone')).toBe(false)
  })
})
