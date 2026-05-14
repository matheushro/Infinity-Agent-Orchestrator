/// <reference types="vite/client" />
import type { PtyApi, DbApi, DialogApi } from '@shared/types/api'

declare global {
  interface Window {
    ptyApi: PtyApi
    dbApi: DbApi
    dialogApi: DialogApi
  }
}

export {}
