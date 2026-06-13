/** Persisted shape of a workspace (SQLite row). */
export interface WorkspaceRecord {
  id: string
  name: string
  created_at: number
  /**
   * Power state. When `false` the workspace is deactivated: its canvas is not
   * mounted, so none of its terminals run a pty and none of its notes are kept
   * in memory — saving RAM/CPU for workspaces the user isn't using. Persisted
   * as INTEGER 0/1 in SQLite.
   */
  enabled: boolean
}
