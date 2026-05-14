/// <reference types="vite/client" />
import type { PtyApi, DbApi, DialogApi } from '../preload/index'

declare global {
  interface Window {
    ptyApi: PtyApi
    dbApi: DbApi
    dialogApi: DialogApi
  }
}

export {}
