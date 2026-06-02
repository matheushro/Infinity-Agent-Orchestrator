// Secure bridge for top-level window controls (fullscreen toggle, etc.).
import { ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { WindowApi } from '@shared/types/api'

export const windowApi: WindowApi = {
  isFullScreen: () => ipcRenderer.invoke(IpcChannels.windowIsFullScreen),
  setFullScreen: (value: boolean) =>
    ipcRenderer.invoke(IpcChannels.windowSetFullScreen, value),
  openInVSCode: (folder: string) =>
    ipcRenderer.invoke(IpcChannels.windowOpenInVSCode, folder),
  onFullScreenChange(cb) {
    const handler = (_event: IpcRendererEvent, value: boolean): void => cb(Boolean(value))
    ipcRenderer.on(IpcChannels.windowFullScreenChanged, handler)
    return () => ipcRenderer.removeListener(IpcChannels.windowFullScreenChanged, handler)
  },
}
