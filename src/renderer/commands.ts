// Commands supported when opening a terminal. `cmd` is what actually runs in the pty.
export type CommandKey = 'codex' | 'claude'

export interface CommandDef {
  key: CommandKey
  label: string
  cmd: string
  icon: string
}

export const COMMANDS: Record<CommandKey, CommandDef> = {
  codex: { key: 'codex', label: 'Codex', cmd: 'codex', icon: '🧠' },
  claude: { key: 'claude', label: 'Claude Code', cmd: 'claude', icon: '✳️' }
}
