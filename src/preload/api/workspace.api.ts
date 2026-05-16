// Secure bridge for the workspace domain.
import { ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { WorkspaceApi } from '@shared/types/api'

export const workspaceApi: WorkspaceApi = {
  list: () => ipcRenderer.invoke(IpcChannels.workspacesList),
  create: (record) => ipcRenderer.invoke(IpcChannels.workspacesCreate, record),
  delete: (id) => ipcRenderer.invoke(IpcChannels.workspacesDelete, id),
}
