// IPC handlers for the terminal/pty domain. Thin adapter: translates IPC
// messages into pty.service calls and forwards pty output back to the renderer.
import { ipcMain } from 'electron'
import {
  IpcChannels,
  type PtyCreateArgs,
  type PtyInputPayload,
  type PtyResizePayload,
  type PtyKillPayload
} from '@shared/types/ipc'
import * as ptyService from '../services/pty.service'

export function registerPtyIpc(): void {
  ipcMain.handle(IpcChannels.ptyCreate, (event, args: PtyCreateArgs) => {
    // The pty can outlive the window: guard every send against a destroyed
    // webContents, otherwise node-pty's onData/onExit crash the main process.
    const safeSend = (channel: string, payload: unknown): void => {
      if (event.sender.isDestroyed()) return
      event.sender.send(channel, payload)
    }

    return ptyService.createPty(args, {
      onData: (payload) => safeSend(IpcChannels.ptyData, payload),
      onExit: (payload) => safeSend(IpcChannels.ptyExit, payload)
    })
  })

  ipcMain.on(IpcChannels.ptyInput, (_event, { id, data }: PtyInputPayload) => {
    ptyService.writeToPty(id, data)
  })

  ipcMain.on(IpcChannels.ptyResize, (_event, { id, cols, rows }: PtyResizePayload) => {
    ptyService.resizePty(id, cols, rows)
  })

  ipcMain.on(IpcChannels.ptyKill, (_event, { id }: PtyKillPayload) => {
    ptyService.killPty(id)
  })

  ipcMain.on(IpcChannels.ptyReinjectPrompt, (_event, { id }) => {
    ptyService.reinjectPrompt(id)
  })
}
