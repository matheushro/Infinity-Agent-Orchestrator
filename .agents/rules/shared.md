# Rule: Shared (`src/shared/`)

`shared` is the contract layer. Pure types and constants, imported by all three other
layers. It is the single source of truth that keeps main, preload and renderer in sync.

## Structure

- `types/ipc.ts` — `IpcChannels` (all channel-name constants) + IPC payload/result types.
- `types/terminal.ts` — domain/persistence shapes (`TerminalRecord`, `ShellType`).
- `types/api.ts` — the `window.*` bridge contracts (`PtyApi`, `DbApi`, `DialogApi`).
- `types/index.ts` — barrel re-exporting the above.

## Rules

- **No runtime logic.** Only `type`, `interface`, and `as const` constant objects.
- **No imports** from `main`, `preload`, or `renderer`. `shared` sits at the bottom.
- Every IPC channel name lives in `IpcChannels` — never hardcode `'pty:create'` anywhere.
- Any type crossing a process boundary (IPC payload, persisted record, bridge API) is
  defined here exactly once. Never duplicate it in main/preload/renderer.
- Keep `shared` minimal — if a type is only used inside one feature, it belongs in that
  feature's `types.ts`, not here.
