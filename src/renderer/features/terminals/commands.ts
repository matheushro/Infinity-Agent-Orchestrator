// The agent registry lives in @shared/agents — a single place for both the
// renderer (modal, types) and the main process (skill installer) to read from.
// This file re-exports under the names the terminals feature has always used.
export { AGENTS as COMMANDS } from '@shared/agents'
export type { AgentKey as CommandKey, AgentDef as CommandDef } from '@shared/agents'
