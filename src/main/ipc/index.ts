// Single entry point that registers every IPC domain.
import { app, ipcMain } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import { registerPtyIpc } from './pty.ipc'
import { registerDbIpc } from './db.ipc'
import { registerDialogIpc } from './dialog.ipc'

const HANDLED_CHANNELS = [
  IpcChannels.ptyCreate,
  IpcChannels.dbListActive,
  IpcChannels.dbUpsert,
  IpcChannels.dbRemove,
  IpcChannels.edgesList,
  IpcChannels.edgesUpsert,
  IpcChannels.edgesRemove,
  IpcChannels.dialogSelectFolder
]

const LISTENER_CHANNELS = [
  IpcChannels.ptyInput,
  IpcChannels.ptyResize,
  IpcChannels.ptyKill
]

export function unregisterIpcHandlers(): void {
  for (const channel of HANDLED_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  for (const channel of LISTENER_CHANNELS) {
    ipcMain.removeAllListeners(channel)
  }
}

export function registerIpcHandlers(): void {
  registerPtyIpc()
  registerDbIpc()
  registerDialogIpc()
  app.once('before-quit', unregisterIpcHandlers)
}
