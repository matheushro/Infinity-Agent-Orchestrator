/// <reference types="vite/client" />
import type { PtyApi, DbApi, DialogApi, BackupApi, WorkspaceApi, WindowApi, UsageApi } from '@shared/types/api'

declare global {
  interface Window {
    ptyApi: PtyApi
    dbApi: DbApi
    dialogApi: DialogApi
    backupApi: BackupApi
    workspaceApi: WorkspaceApi
    windowApi: WindowApi
    usageApi: UsageApi
  }
}

export {}
