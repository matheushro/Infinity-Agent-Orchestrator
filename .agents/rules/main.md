# Rule: Main process (`src/main/`)

The main process owns everything privileged: OS processes, the filesystem, the SQLite DB,
native dialogs, and windows. Nothing else may do these things.

## Structure

- `index.ts` — bootstrap only. Wires `initDb()`, `registerIpcHandlers()`, `createWindow()`,
  and app lifecycle. Keep it thin; no domain logic here.
- `window.ts` — `BrowserWindow` creation.
- `services/*.service.ts` — the actual logic. Owns native modules and in-memory state
  (e.g. the `ptys` Map in `pty.service.ts`). **Knows nothing about IPC** — callers pass
  callbacks for I/O.
- `ipc/*.ipc.ts` — one file per domain. Each exports `registerXxxIpc()` that maps
  `IpcChannels.*` to `services/` calls. **No logic** beyond payload destructuring.
- `ipc/index.ts` — aggregates all `registerXxxIpc()` into `registerIpcHandlers()`.

## Rules

- Native modules (`node-pty`, `better-sqlite3`) stay externalized — already handled by
  `externalizeDepsPlugin()`. Don't import them outside `services/`.
- Channel names come from `@shared/types/ipc` (`IpcChannels`). Never hardcode strings.
- Payload/result types come from `@shared/types/*`. Never redefine them here.
- `invoke` handlers (`ipcMain.handle`) for request/response; `on` (`ipcMain.on`) for
  fire-and-forget. Match the existing split (`pty:create` = handle, `pty:input` = on).
- Clean up resources on lifecycle events (`killAllPtys()` on `window-all-closed`).

## Adding a handler

Put logic in the relevant `*.service.ts`, expose a function, then wire one line in the
matching `*.ipc.ts`. If it's a brand-new channel, follow `skills/add-ipc-channel.md`.
