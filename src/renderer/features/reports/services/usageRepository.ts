// Data access for the reports feature. Talks only to the preload `usageApi`
// bridge — parsing and aggregation happen in the main process.
import type { UsageAgent, UsageReport } from '@shared/types/usage'

export const usageRepository = {
  /** Days with logs for the agent, newest first. */
  days(agent: UsageAgent): Promise<string[]> {
    return window.usageApi.days(agent)
  },

  /** One day's report; `onlyIao` keeps just the prompts sent from a terminal. */
  report(agent: UsageAgent, day: string, onlyIao = false): Promise<UsageReport> {
    return window.usageApi.report({ agent, day, onlyIao })
  },
}
