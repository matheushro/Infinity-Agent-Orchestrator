// Secure bridge for the terminal/pty domain.
import { ipcRenderer, webUtils } from 'electron'
import {
  IpcChannels,
  type PtyDataPayload,
  type PtyExitPayload
} from '@shared/types/ipc'
import type { PtyApi } from '@shared/types/api'

export const ptyApi: PtyApi = {
  create: (args) => ipcRenderer.invoke(IpcChannels.ptyCreate, args),
  input: (id, data) => ipcRenderer.send(IpcChannels.ptyInput, { id, data }),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  resize: (id, cols, rows) => ipcRenderer.send(IpcChannels.ptyResize, { id, cols, rows }),
  kill: (id) => ipcRenderer.send(IpcChannels.ptyKill, { id }),
  onData: (cb) => {
    const listener = (_e: unknown, payload: PtyDataPayload): void => cb(payload.id, payload.data)
    ipcRenderer.on(IpcChannels.ptyData, listener)
    return () => ipcRenderer.removeListener(IpcChannels.ptyData, listener)
  },
  onExit: (cb) => {
    const listener = (_e: unknown, payload: PtyExitPayload): void => cb(payload.id)
    ipcRenderer.on(IpcChannels.ptyExit, listener)
    return () => ipcRenderer.removeListener(IpcChannels.ptyExit, listener)
  }
}
