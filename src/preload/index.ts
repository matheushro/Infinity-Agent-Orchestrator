// Preload: the only renderer <-> main channel. Context isolation is on and
// node integration off, so this file is purely a bridge — no business logic.
// Each domain API lives in ./api; their types are defined in @shared/types.
import { contextBridge } from 'electron'
import { ptyApi } from './api/pty.api'
import { dbApi } from './api/db.api'
import { dialogApi } from './api/dialog.api'
import { workspaceApi } from './api/workspace.api'

contextBridge.exposeInMainWorld('ptyApi', ptyApi)
contextBridge.exposeInMainWorld('dbApi', dbApi)
contextBridge.exposeInMainWorld('dialogApi', dialogApi)
contextBridge.exposeInMainWorld('workspaceApi', workspaceApi)
