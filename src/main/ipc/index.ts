// Single entry point that registers every IPC domain.
import { registerPtyIpc } from './pty.ipc'
import { registerDbIpc } from './db.ipc'
import { registerDialogIpc } from './dialog.ipc'

export function registerIpcHandlers(): void {
  registerPtyIpc()
  registerDbIpc()
  registerDialogIpc()
}
