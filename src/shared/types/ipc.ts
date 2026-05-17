// IPC contract shared by main and preload. Channels are centralized here so
// both sides stay in sync and renderer code never hardcodes channel strings.

export const IpcChannels = {
  ptyCreate: 'pty:create',
  ptyInput: 'pty:input',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  dbListActive: 'db:list-active',
  dbUpsert: 'db:upsert',
  dbRemove: 'db:remove',
  edgesList: 'edges:list',
  edgesUpsert: 'edges:upsert',
  edgesRemove: 'edges:remove',
  canvasTextsList: 'canvas-texts:list',
  canvasTextsUpsert: 'canvas-texts:upsert',
  canvasTextsRemove: 'canvas-texts:remove',
  dialogSelectFolder: 'dialog:select-folder',
  workspacesList: 'workspaces:list',
  workspacesCreate: 'workspaces:create',
  workspacesDelete: 'workspaces:delete',
  workspacesRename: 'workspaces:rename',
  workspacesDuplicate: 'workspaces:duplicate',
  windowIsFullScreen: 'window:is-full-screen',
  windowSetFullScreen: 'window:set-full-screen',
  windowFullScreenChanged: 'window:full-screen-changed',
} as const

export interface PtyCreateArgs {
  id: string
  shell?: string
  cols: number
  rows: number
  cwd?: string
  command?: string
  // Persistence id of the terminal node this pty belongs to. The iao bridge
  // uses it to map a pty session to the user-visible terminal (title, edges).
  nodeId?: string
}

export interface PtyCreateResult {
  id: string
  shell: string
}

export interface PtyInputPayload {
  id: string
  data: string
}

export interface PtyResizePayload {
  id: string
  cols: number
  rows: number
}

export interface PtyKillPayload {
  id: string
}

export interface PtyDataPayload {
  id: string
  data: string
}

export interface PtyExitPayload {
  id: string
}
