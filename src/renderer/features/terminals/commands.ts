// Registry of launchable agents. Add a new agent by adding an entry here.
import type { CommandDef, CommandKey } from './types'

export const COMMANDS: Record<CommandKey, CommandDef> = {
  codex: { key: 'codex', label: 'Codex', cmd: 'codex', icon: '🧠' },
  claude: { key: 'claude', label: 'Claude Code', cmd: 'claude', icon: '✳️' }
}
