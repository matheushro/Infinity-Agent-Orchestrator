/// <reference types="vite/client" />
import type { PtyApi, DbApi, DialogApi, WorkspaceApi, WindowApi } from '@shared/types/api'

declare global {
  interface Window {
    ptyApi: PtyApi
    dbApi: DbApi
    dialogApi: DialogApi
    workspaceApi: WorkspaceApi
    windowApi: WindowApi
  }
}

export {}
