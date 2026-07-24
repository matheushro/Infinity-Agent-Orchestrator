// The user-owned model catalog: which model strings each agent offers in the
// terminal pickers. Seeded from `@shared/agents` on first run and grown by the
// user — typing an unknown model in a terminal registers it here, and the
// Settings → Models screen edits it directly.

/** One registered model string for one agent. Unique per (agent, value). */
export interface ModelRecord {
  id: string
  /**
   * Agent this model belongs to — an `AgentKey` from `@shared/agents`. Typed as
   * a plain string because rows outlive the registry: a catalog entry for an
   * agent that was later removed must still read back without a cast.
   */
  agent: string
  /**
   * Exact string handed to the agent — the value of its `modelEnv` var, or the
   * argument to its `modelArg` flag. Compared case-insensitively for
   * uniqueness, so `Opus` and `opus` are the same entry.
   */
  value: string
  /** Label shown in the picker. Falls back to `value` for user-added entries. */
  label: string
}
