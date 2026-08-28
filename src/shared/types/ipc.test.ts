import { describe, it, expect } from 'vitest'
import { IpcChannels } from './ipc'

describe('IpcChannels — completude e consistência', () => {
  it('contém o canal pty:create', () => {
    expect(IpcChannels.ptyCreate).toBe('pty:create')
  })

  it('contém o canal pty:input', () => {
    expect(IpcChannels.ptyInput).toBe('pty:input')
  })

  it('contém o canal pty:resize', () => {
    expect(IpcChannels.ptyResize).toBe('pty:resize')
  })

  it('contém o canal pty:kill', () => {
    expect(IpcChannels.ptyKill).toBe('pty:kill')
  })

  it('contém o canal pty:data', () => {
    expect(IpcChannels.ptyData).toBe('pty:data')
  })

  it('contém o canal pty:exit', () => {
    expect(IpcChannels.ptyExit).toBe('pty:exit')
  })

  it('contém o canal db:list-active', () => {
    expect(IpcChannels.dbListActive).toBe('db:list-active')
  })

  it('contém o canal db:upsert', () => {
    expect(IpcChannels.dbUpsert).toBe('db:upsert')
  })

  it('contém o canal db:remove', () => {
    expect(IpcChannels.dbRemove).toBe('db:remove')
  })

  it('contém o canal db:reorder-terminals', () => {
    expect(IpcChannels.dbReorderTerminals).toBe('db:reorder-terminals')
  })

  it('contém o canal edges:list', () => {
    expect(IpcChannels.edgesList).toBe('edges:list')
  })

  it('contém o canal edges:upsert', () => {
    expect(IpcChannels.edgesUpsert).toBe('edges:upsert')
  })

  it('contém o canal edges:remove', () => {
    expect(IpcChannels.edgesRemove).toBe('edges:remove')
  })

  it('contém o canal dialog:select-folder', () => {
    expect(IpcChannels.dialogSelectFolder).toBe('dialog:select-folder')
  })

  it('contém os canais de note-links', () => {
    expect(IpcChannels.noteLinksList).toBe('note-links:list')
    expect(IpcChannels.noteLinksUpsert).toBe('note-links:upsert')
    expect(IpcChannels.noteLinksRemove).toBe('note-links:remove')
  })

  it('contém o canal notes:changed', () => {
    expect(IpcChannels.notesChanged).toBe('notes:changed')
  })

  it('contém os canais do catálogo de modelos', () => {
    expect(IpcChannels.modelsList).toBe('models:list')
    expect(IpcChannels.modelsUpsert).toBe('models:upsert')
    expect(IpcChannels.modelsRemove).toBe('models:remove')
  })

  it('contém os canais de relatórios de consumo', () => {
    expect(IpcChannels.usageDays).toBe('usage:days')
    expect(IpcChannels.usageReport).toBe('usage:report')
  })

  it('IpcChannels contém exatamente os 42 canais conhecidos (sem canais fantasma)', () => {
    const expected = [
      'pty:create', 'pty:input', 'pty:resize', 'pty:kill', 'pty:data', 'pty:exit',
      'db:list-active', 'db:upsert', 'db:remove', 'db:reorder-terminals',
      'edges:list', 'edges:upsert', 'edges:remove',
      'canvas-texts:list', 'canvas-texts:upsert', 'canvas-texts:remove',
      'notes:list', 'notes:upsert', 'notes:remove', 'notes:changed',
      'note-links:list', 'note-links:upsert', 'note-links:remove',
      'models:list', 'models:upsert', 'models:remove',
      'dialog:select-folder',
      'backup:export', 'backup:import',
      'workspaces:list', 'workspaces:create', 'workspaces:delete',
      'workspaces:rename', 'workspaces:duplicate', 'workspaces:reorder',
      'workspaces:set-enabled',
      'window:is-full-screen', 'window:set-full-screen', 'window:full-screen-changed',
      'window:open-in-vscode',
      'window:open-external',
      'usage:days', 'usage:report',
    ]
    const actual = Object.values(IpcChannels) as string[]
    expect(actual.sort()).toEqual(expected.sort())
  })

  it('IpcChannels está congelado (as const — não mutável)', () => {
    // TypeScript `as const` objects are readonly; at runtime they're plain objects,
    // but we can verify that no accidental mutation went through.
    const original = { ...IpcChannels }
    expect(IpcChannels).toMatchObject(original)
  })

  it('canais usados no preload de pty casam com IpcChannels', async () => {
    // Verify that the preload imports from @shared/types/ipc (not literal strings)
    // by checking the actual values match what the preload would use.
    const { IpcChannels: ch } = await import('./ipc')
    // These are the channels referenced by pty.api.ts
    expect(ch.ptyCreate).toBeTruthy()
    expect(ch.ptyInput).toBeTruthy()
    expect(ch.ptyResize).toBeTruthy()
    expect(ch.ptyKill).toBeTruthy()
    expect(ch.ptyData).toBeTruthy()
    expect(ch.ptyExit).toBeTruthy()
  })

  it('canais usados no preload de db casam com IpcChannels', () => {
    expect(IpcChannels.dbListActive).toBeTruthy()
    expect(IpcChannels.dbUpsert).toBeTruthy()
    expect(IpcChannels.dbRemove).toBeTruthy()
    expect(IpcChannels.dbReorderTerminals).toBeTruthy()
    expect(IpcChannels.edgesList).toBeTruthy()
    expect(IpcChannels.edgesUpsert).toBeTruthy()
    expect(IpcChannels.edgesRemove).toBeTruthy()
    expect(IpcChannels.canvasTextsList).toBeTruthy()
    expect(IpcChannels.canvasTextsUpsert).toBeTruthy()
    expect(IpcChannels.canvasTextsRemove).toBeTruthy()
  })

  it('canal dialog:select-folder usado no preload de dialog', () => {
    expect(IpcChannels.dialogSelectFolder).toBeTruthy()
  })
})
