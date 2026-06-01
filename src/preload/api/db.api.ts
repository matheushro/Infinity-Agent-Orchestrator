// Secure bridge for the persistence domain.
import { ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { DbApi } from '@shared/types/api'

export const dbApi: DbApi = {
  listActive: (workspaceId?: string) => ipcRenderer.invoke(IpcChannels.dbListActive, workspaceId),
  upsert: (record) => ipcRenderer.invoke(IpcChannels.dbUpsert, record),
  remove: (id) => ipcRenderer.invoke(IpcChannels.dbRemove, id),
  listEdges: () => ipcRenderer.invoke(IpcChannels.edgesList),
  upsertEdge: (record) => ipcRenderer.invoke(IpcChannels.edgesUpsert, record),
  removeEdge: (id) => ipcRenderer.invoke(IpcChannels.edgesRemove, id),
  listCanvasTexts: (workspaceId) => ipcRenderer.invoke(IpcChannels.canvasTextsList, workspaceId),
  upsertCanvasText: (record) => ipcRenderer.invoke(IpcChannels.canvasTextsUpsert, record),
  removeCanvasText: (id) => ipcRenderer.invoke(IpcChannels.canvasTextsRemove, id),
  listNotes: (workspaceId) => ipcRenderer.invoke(IpcChannels.notesList, workspaceId),
  upsertNote: (record) => ipcRenderer.invoke(IpcChannels.notesUpsert, record),
  removeNote: (id) => ipcRenderer.invoke(IpcChannels.notesRemove, id),
  listNoteLinks: () => ipcRenderer.invoke(IpcChannels.noteLinksList),
  upsertNoteLink: (record) => ipcRenderer.invoke(IpcChannels.noteLinksUpsert, record),
  removeNoteLink: (id) => ipcRenderer.invoke(IpcChannels.noteLinksRemove, id),
  onNotesChanged(cb) {
    const handler = (_event: IpcRendererEvent): void => cb()
    ipcRenderer.on(IpcChannels.notesChanged, handler)
    return () => ipcRenderer.removeListener(IpcChannels.notesChanged, handler)
  },
}
