# Skill: Add an IPC channel end-to-end

Use when the renderer needs a new piece of data or action from the main process.
Touches all four layers — do them in order so types stay green.

## Steps

1. **`@shared/types/ipc.ts`** — add the channel name to `IpcChannels` and any
   payload/result `interface`. Naming: `'<domain>:<action>'` (e.g. `'fs:read-file'`).

2. **`@shared/types/api.ts`** — add the method signature to the domain interface
   (`PtyApi` / `DbApi` / `DialogApi`), or create a new interface for a new domain.

3. **`src/main/services/<domain>.service.ts`** — implement the actual logic as an
   exported function. This is the only place that touches Node/Electron/native modules.

4. **`src/main/ipc/<domain>.ipc.ts`** — wire one line inside `registerXxxIpc()`:
   `ipcMain.handle(IpcChannels.xxx, (_e, args) => serviceFn(args))`.
   Use `handle` for request/response, `on` for fire-and-forget.
   (New domain? create the file, export `registerXxxIpc`, add it to `ipc/index.ts`.)

5. **`src/preload/api/<domain>.api.ts`** — add the one-liner that calls
   `ipcRenderer.invoke/send/on` with the `IpcChannels` constant.
   (New domain? create the file and expose it in `src/preload/index.ts`.)

6. **`src/renderer/env.d.ts`** — only if you added a new `window.*` API object.

7. **Renderer** — consume it through a feature **service → hook → component** chain.
   Never call `window.*` directly from a component.

## Checklist

- [ ] No hardcoded channel string anywhere — all via `IpcChannels`.
- [ ] No type duplicated; all cross-boundary types in `@shared`.
- [ ] `ipc/*` file has no logic; `service/*` has all of it.
- [ ] `npm run build` passes.
