# Rule: Preload (`src/preload/`)

The preload is the **only** channel between renderer and main. Context isolation is on,
node integration is off. It is a thin, secure bridge — nothing more.

## Structure

- `index.ts` — calls `contextBridge.exposeInMainWorld()` for each API object. No logic.
- `api/*.api.ts` — one file per domain (`pty.api.ts`, `db.api.ts`, `dialog.api.ts`).
  Each exports an object implementing the matching interface from `@shared/types/api`.

## Rules

- **No business logic.** An `*.api.ts` method is a one-liner: `ipcRenderer.invoke/send/on`.
  Transformation, validation, or branching belong in a service (main or renderer).
- Every exposed object must satisfy its `@shared/types/api` interface
  (`export const ptyApi: PtyApi = { ... }`). The interface is the contract.
- Channel names come from `@shared/types/ipc` (`IpcChannels`).
- Event subscriptions (`onData`, `onExit`) must return an unsubscribe function that calls
  `ipcRenderer.removeListener` — the renderer relies on this for cleanup.
- When you add an API, also add it to the `Window` interface in `src/renderer/env.d.ts`.

## Adding an API method

Add the signature to the interface in `@shared/types/api`, implement the one-liner in the
matching `*.api.ts`. For a new channel, follow `skills/add-ipc-channel.md`.
