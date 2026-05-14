// Secure bridge for the persistence domain.
import { ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { DbApi } from '@shared/types/api'

export const dbApi: DbApi = {
  listActive: () => ipcRenderer.invoke(IpcChannels.dbListActive),
  upsert: (record) => ipcRenderer.invoke(IpcChannels.dbUpsert, record),
  remove: (id) => ipcRenderer.invoke(IpcChannels.dbRemove, id)
}
