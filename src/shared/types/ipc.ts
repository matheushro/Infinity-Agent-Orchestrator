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
  dbReorderTerminals: 'db:reorder-terminals',
  edgesList: 'edges:list',
  edgesUpsert: 'edges:upsert',
  edgesRemove: 'edges:remove',
  canvasTextsList: 'canvas-texts:list',
  canvasTextsUpsert: 'canvas-texts:upsert',
  canvasTextsRemove: 'canvas-texts:remove',
  notesList: 'notes:list',
  notesUpsert: 'notes:upsert',
  notesRemove: 'notes:remove',
  notesChanged: 'notes:changed',
  noteLinksList: 'note-links:list',
  noteLinksUpsert: 'note-links:upsert',
  noteLinksRemove: 'note-links:remove',
  modelsList: 'models:list',
  modelsUpsert: 'models:upsert',
  modelsRemove: 'models:remove',
  dialogSelectFolder: 'dialog:select-folder',
  backupExport: 'backup:export',
  backupImport: 'backup:import',
  workspacesList: 'workspaces:list',
  workspacesCreate: 'workspaces:create',
  workspacesDelete: 'workspaces:delete',
  workspacesRename: 'workspaces:rename',
  workspacesDuplicate: 'workspaces:duplicate',
  workspacesReorder: 'workspaces:reorder',
  workspacesSetEnabled: 'workspaces:set-enabled',
  windowIsFullScreen: 'window:is-full-screen',
  windowSetFullScreen: 'window:set-full-screen',
  windowFullScreenChanged: 'window:full-screen-changed',
  windowOpenInVSCode: 'window:open-in-vscode',
  windowOpenExternal: 'window:open-external',
  usageDays: 'usage:days',
  usageReport: 'usage:report',
} as const

export interface PtyCreateArgs {
  id: string
  shell?: string
  cols: number
  rows: number
  cwd?: string
  command?: string
  // Per-terminal prompt delivered via the agent's context file in a private,
  // gitignored role subdirectory the agent is launched in (see
  // promptFile.service). Empty/omitted means no prompt. Ignored for a plain
  // terminal (no command).
  prompt?: string
  // Model to pin this terminal to, injected as the agent's model env var (see
  // `@shared/agents` `modelEnv`). Empty/omitted leaves the agent on its own
  // default. Ignored for agents without a model env var or a plain terminal.
  model?: string
  // Reasoning-effort level this terminal launches with, appended to the agent's
  // launch command as its effort flag (see `@shared/agents` `effortArg`).
  // Empty/omitted leaves the agent on its own default. Ignored for agents
  // without an effort flag or a plain terminal.
  effort?: string
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
