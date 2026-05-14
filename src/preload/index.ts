import { contextBridge, ipcRenderer } from 'electron'

export interface PtyApi {
  create(args: {
    id: string
    shell?: string
    cols: number
    rows: number
    cwd?: string
    command?: string
  }): Promise<{
    id: string
    shell: string
  }>
  input(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  onData(cb: (id: string, data: string) => void): () => void
  onExit(cb: (id: string) => void): () => void
}

export interface TerminalRecord {
  id: string
  title: string
  cwd: string
  command: string
  shell: string
  x: number
  y: number
  width: number
  height: number
}

export interface DbApi {
  listActive(): Promise<TerminalRecord[]>
  upsert(record: TerminalRecord): Promise<void>
  remove(id: string): Promise<void>
}

export interface DialogApi {
  selectFolder(): Promise<string | null>
}

const api: PtyApi = {
  create: (args) => ipcRenderer.invoke('pty:create', args),
  input: (id, data) => ipcRenderer.send('pty:input', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
  kill: (id) => ipcRenderer.send('pty:kill', { id }),
  onData: (cb) => {
    const listener = (_e: unknown, payload: { id: string; data: string }) =>
      cb(payload.id, payload.data)
    ipcRenderer.on('pty:data', listener)
    return () => ipcRenderer.removeListener('pty:data', listener)
  },
  onExit: (cb) => {
    const listener = (_e: unknown, payload: { id: string }) => cb(payload.id)
    ipcRenderer.on('pty:exit', listener)
    return () => ipcRenderer.removeListener('pty:exit', listener)
  }
}

const dbApi: DbApi = {
  listActive: () => ipcRenderer.invoke('db:list-active'),
  upsert: (record) => ipcRenderer.invoke('db:upsert', record),
  remove: (id) => ipcRenderer.invoke('db:remove', id)
}

const dialogApi: DialogApi = {
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder')
}

contextBridge.exposeInMainWorld('ptyApi', api)
contextBridge.exposeInMainWorld('dbApi', dbApi)
contextBridge.exposeInMainWorld('dialogApi', dialogApi)
