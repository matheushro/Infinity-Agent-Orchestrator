// Secure bridge for the usage-report domain.
import { ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/types/ipc'
import type { UsageApi } from '@shared/types/api'

export const usageApi: UsageApi = {
  days: (agent, root) => ipcRenderer.invoke(IpcChannels.usageDays, agent, root),
  report: (query) => ipcRenderer.invoke(IpcChannels.usageReport, query),
}
