// Central registry of launchable agents. To add a new agent, add one entry here —
// no other file needs changing (the modal, types, and skill installer all derive from this).
export interface AgentDef {
  key: string
  label: string
  cmd: string
  icon: string
  /** Path relative to os.homedir() where the IAO SKILL.md should be installed. */
  skillDir?: string
}

export const AGENTS = {
  codex: {
    key: 'codex',
    label: 'Codex',
    cmd: 'codex',
    icon: '🧠',
    skillDir: '.codex/skills/iao',
  },
  claude: {
    key: 'claude',
    label: 'Claude Code',
    cmd: 'claude',
    icon: '✳️',
    skillDir: '.claude/skills/iao',
  },
  gemini: {
    key: 'gemini',
    label: 'Gemini',
    cmd: 'gemini',
    icon: '✦',
    skillDir: '.gemini/skills/iao',
  },
  copilot: {
    key: 'copilot',
    label: 'GitHub Copilot',
    cmd: 'copilot',
    icon: '🐙',
    skillDir: '.copilot/skills/iao',
  },
} satisfies Record<string, AgentDef>

export type AgentKey = keyof typeof AGENTS
