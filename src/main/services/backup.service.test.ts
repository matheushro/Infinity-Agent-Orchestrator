import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BackupData } from '@shared/types/backup'

// ---- boundary mocks ----

const mockDialog = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
}))

const mockFs = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('electron', () => ({
  dialog: mockDialog,
}))

vi.mock('fs', () => ({ default: mockFs }))

vi.mock('./db.service', () => ({
  listWorkspaces: vi.fn(() => []),
  listActiveTerminals: vi.fn(() => []),
  listCanvasTexts: vi.fn(() => []),
  listNotes: vi.fn(() => []),
  listEdges: vi.fn(() => []),
  listNoteLinks: vi.fn(() => []),
  runInTransaction: vi.fn((fn: () => unknown) => fn()),
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  setWorkspaceEnabled: vi.fn(),
  upsertTerminal: vi.fn(),
  upsertEdge: vi.fn(),
  upsertCanvasText: vi.fn(),
  upsertNote: vi.fn(),
  upsertNoteLink: vi.fn(),
}))

import * as dbService from './db.service'
import { collectBackup, parseBackup, applyBackup, exportToFile, importFromFile } from './backup.service'
import { BACKUP_VERSION } from '@shared/types/backup'

// ---- fixtures ----

const ws1 = { id: 'ws-1', name: 'Main', created_at: 1, enabled: true }
const t1 = {
  id: 't1', title: 'Claude', cwd: '/repo', command: 'claude', shell: 'default',
  prompt: 'You are the reviewer', model: 'opus',
  x: 0, y: 0, width: 400, height: 300, workspace_id: 'ws-1', enabled: true,
}
const t2 = { ...t1, id: 't2', title: 'Codex', command: 'codex', prompt: '', model: '' }
const edge = { id: 'e1', source: 't1', target: 't2' }
const danglingEdge = { id: 'e2', source: 't1', target: 'ghost' }
const text = { id: 'x1', text: 'label', x: 1, y: 2, width: 220, height: 44, workspace_id: 'ws-1' }
const note = {
  id: 'n1', title: 'Plan', content: '# body', theme: 'auto' as const,
  x: 0, y: 0, width: 280, height: 200, workspace_id: 'ws-1', created_at: 5, updated_at: 6,
}
const link = { id: 'l1', note_id: 'n1', terminal_id: 't1' }
const danglingLink = { id: 'l2', note_id: 'n1', terminal_id: 'ghost' }

function makeBackup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: BACKUP_VERSION,
    exportedAt: 123,
    workspaces: [ws1],
    terminals: [t1, t2],
    canvasTexts: [text],
    notes: [note],
    edges: [edge],
    noteLinks: [link],
    ...overrides,
  }
}

beforeEach(() => {
  // clearAllMocks keeps implementations set with mockReturnValue in earlier
  // tests — re-pin the empty defaults so list state never leaks between tests.
  vi.clearAllMocks()
  vi.mocked(dbService.listWorkspaces).mockReturnValue([])
  vi.mocked(dbService.listActiveTerminals).mockReturnValue([])
  vi.mocked(dbService.listCanvasTexts).mockReturnValue([])
  vi.mocked(dbService.listNotes).mockReturnValue([])
  vi.mocked(dbService.listEdges).mockReturnValue([])
  vi.mocked(dbService.listNoteLinks).mockReturnValue([])
  vi.mocked(dbService.runInTransaction).mockImplementation(((fn: () => unknown) =>
    fn()) as typeof dbService.runInTransaction)
})

// ---- collectBackup ----

describe('collectBackup', () => {
  it('snapshots every table keyed by the workspace list', () => {
    vi.mocked(dbService.listWorkspaces).mockReturnValue([ws1])
    vi.mocked(dbService.listActiveTerminals).mockReturnValue([t1, t2])
    vi.mocked(dbService.listCanvasTexts).mockReturnValue([text])
    vi.mocked(dbService.listNotes).mockReturnValue([note])
    vi.mocked(dbService.listEdges).mockReturnValue([edge])
    vi.mocked(dbService.listNoteLinks).mockReturnValue([link])

    const data = collectBackup()

    expect(data.version).toBe(BACKUP_VERSION)
    expect(data.workspaces).toEqual([ws1])
    expect(data.terminals).toEqual([t1, t2])
    expect(data.canvasTexts).toEqual([text])
    expect(data.notes).toEqual([note])
    expect(data.edges).toEqual([edge])
    expect(data.noteLinks).toEqual([link])
    expect(dbService.listCanvasTexts).toHaveBeenCalledWith('ws-1')
    expect(dbService.listNotes).toHaveBeenCalledWith('ws-1')
  })

  it('drops edges and note links whose endpoints are not exported', () => {
    vi.mocked(dbService.listWorkspaces).mockReturnValue([ws1])
    vi.mocked(dbService.listActiveTerminals).mockReturnValue([t1, t2])
    vi.mocked(dbService.listNotes).mockReturnValue([note])
    vi.mocked(dbService.listEdges).mockReturnValue([edge, danglingEdge])
    vi.mocked(dbService.listNoteLinks).mockReturnValue([link, danglingLink])

    const data = collectBackup()

    expect(data.edges).toEqual([edge])
    expect(data.noteLinks).toEqual([link])
  })
})

// ---- parseBackup ----

describe('parseBackup', () => {
  it('round-trips a valid backup', () => {
    const data = makeBackup()
    expect(parseBackup(JSON.stringify(data))).toEqual(data)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseBackup('not json {')).toThrow(/not valid JSON/)
  })

  it('rejects an unsupported version', () => {
    expect(() => parseBackup(JSON.stringify({ ...makeBackup(), version: 99 }))).toThrow(
      /Unsupported backup version: 99/,
    )
  })

  it('rejects a file missing one of the record arrays', () => {
    const data = makeBackup() as Record<string, unknown>
    delete data.notes
    expect(() => parseBackup(JSON.stringify(data))).toThrow(/missing "notes"/)
  })

  it('rejects entries without a string id', () => {
    const data = makeBackup({ terminals: [{ ...t1, id: 7 as unknown as string }] })
    expect(() => parseBackup(JSON.stringify(data))).toThrow(/"terminals" entry without an id/)
  })
})

// ---- applyBackup ----

describe('applyBackup', () => {
  it('creates missing workspaces and upserts every record inside a transaction', () => {
    vi.mocked(dbService.listWorkspaces).mockReturnValue([])

    const counts = applyBackup(makeBackup())

    expect(dbService.runInTransaction).toHaveBeenCalledOnce()
    expect(dbService.createWorkspace).toHaveBeenCalledWith(ws1)
    expect(dbService.renameWorkspace).not.toHaveBeenCalled()
    expect(dbService.upsertTerminal).toHaveBeenCalledWith(t1)
    expect(dbService.upsertTerminal).toHaveBeenCalledWith(t2)
    expect(dbService.upsertEdge).toHaveBeenCalledWith(edge)
    expect(dbService.upsertCanvasText).toHaveBeenCalledWith(text)
    expect(dbService.upsertNote).toHaveBeenCalledWith(note)
    expect(dbService.upsertNoteLink).toHaveBeenCalledWith(link)
    expect(counts).toEqual({
      workspaces: 1,
      terminals: 2,
      canvasTexts: 1,
      notes: 1,
      edges: 1,
      noteLinks: 1,
    })
  })

  it('updates a workspace that already exists instead of recreating it', () => {
    vi.mocked(dbService.listWorkspaces).mockReturnValue([{ ...ws1, name: 'Old name' }])

    applyBackup(makeBackup({ workspaces: [{ ...ws1, name: 'Restored', enabled: false }] }))

    expect(dbService.createWorkspace).not.toHaveBeenCalled()
    expect(dbService.renameWorkspace).toHaveBeenCalledWith('ws-1', 'Restored')
    expect(dbService.setWorkspaceEnabled).toHaveBeenCalledWith('ws-1', false)
  })

  it('skips records pointing at workspaces/terminals the file does not carry', () => {
    vi.mocked(dbService.listWorkspaces).mockReturnValue([])
    const orphanTerminal = { ...t2, id: 't-orphan', workspace_id: 'ws-ghost' }

    const counts = applyBackup(
      makeBackup({
        terminals: [t1, orphanTerminal],
        edges: [{ id: 'e-orphan', source: 't1', target: 't-orphan' }],
        canvasTexts: [{ ...text, id: 'x-orphan', workspace_id: 'ws-ghost' }],
        notes: [{ ...note, id: 'n-orphan', workspace_id: 'ws-ghost' }],
        noteLinks: [{ id: 'l-orphan', note_id: 'n-orphan', terminal_id: 't1' }],
      }),
    )

    expect(dbService.upsertTerminal).toHaveBeenCalledTimes(1)
    expect(dbService.upsertTerminal).toHaveBeenCalledWith(t1)
    expect(dbService.upsertEdge).not.toHaveBeenCalled()
    expect(dbService.upsertCanvasText).not.toHaveBeenCalled()
    expect(dbService.upsertNote).not.toHaveBeenCalled()
    expect(dbService.upsertNoteLink).not.toHaveBeenCalled()
    expect(counts).toEqual({
      workspaces: 1,
      terminals: 1,
      canvasTexts: 0,
      notes: 0,
      edges: 0,
      noteLinks: 0,
    })
  })
})

// ---- exportToFile ----

describe('exportToFile', () => {
  it('returns canceled and writes nothing when the save dialog is dismissed', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })

    const result = await exportToFile()

    expect(result).toEqual({ canceled: true })
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(0)
  })

  it('writes the snapshot as JSON to the chosen path and reports counts', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/iao.json' })
    vi.mocked(dbService.listWorkspaces).mockReturnValue([ws1])
    vi.mocked(dbService.listActiveTerminals).mockReturnValue([t1])

    const result = await exportToFile()

    expect(mockFs.writeFileSync).toHaveBeenCalledOnce()
    const [path, json] = vi.mocked(mockFs.writeFileSync).mock.calls[0]
    expect(path).toBe('/tmp/iao.json')
    const written = JSON.parse(json as string) as BackupData
    expect(written.version).toBe(BACKUP_VERSION)
    expect(written.terminals).toEqual([t1])
    expect(result).toEqual({
      canceled: false,
      path: '/tmp/iao.json',
      counts: { workspaces: 1, terminals: 1, canvasTexts: 0, notes: 0, edges: 0, noteLinks: 0 },
    })
  })

  it('passes a .json default filename to the save dialog', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: true })

    await exportToFile()

    const options = mockDialog.showSaveDialog.mock.calls[0][0] as { defaultPath: string }
    expect(options.defaultPath).toMatch(/iao-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

// ---- importFromFile ----

describe('importFromFile', () => {
  it('returns canceled and reads nothing when the open dialog is dismissed', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    const result = await importFromFile()

    expect(result).toEqual({ canceled: true })
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(0)
  })

  it('parses the chosen file, merges it, and reports counts', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/iao.json'] })
    mockFs.readFileSync.mockReturnValue(JSON.stringify(makeBackup()))
    vi.mocked(dbService.listWorkspaces).mockReturnValue([])

    const result = await importFromFile()

    expect(mockFs.readFileSync).toHaveBeenCalledWith('/tmp/iao.json', 'utf8')
    expect(dbService.upsertTerminal).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      canceled: false,
      path: '/tmp/iao.json',
      counts: { workspaces: 1, terminals: 2, canvasTexts: 1, notes: 1, edges: 1, noteLinks: 1 },
    })
  })

  it('rejects (and merges nothing) when the file is not a valid backup', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/bad.json'] })
    mockFs.readFileSync.mockReturnValue('{"hello": "world"}')

    await expect(importFromFile()).rejects.toThrow(/Unsupported backup version/)
    expect(dbService.upsertTerminal).not.toHaveBeenCalled()
    expect(dbService.createWorkspace).not.toHaveBeenCalled()
  })
})
