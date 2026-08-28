// IPC handlers for the usage-report domain.
import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { UsageAgent, UsageQuery } from '@shared/types/usage'
import * as usageService from '../services/usage.service'

export function registerUsageIpc(): void {
  ipcMain.handle(IpcChannels.usageDays, (_event, agent: UsageAgent, root?: string) =>
    usageService.listUsageDays(agent, root),
  )
  ipcMain.handle(IpcChannels.usageReport, (_event, query: UsageQuery) =>
    usageService.getUsageReport(query),
  )
}
