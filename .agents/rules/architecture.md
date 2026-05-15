# Rule: Architecture & layering

IAO has four layers. Dependencies flow **one direction only** — never upward, never sideways
across features.

```
shared  ←  main
shared  ←  preload
shared  ←  renderer        (renderer also depends on preload's APIs *by type only*, via @shared)
```

## Layers

- **`src/shared/`** — pure types and constants (IPC channel names, payload/record shapes).
  No runtime logic, no imports from `main`/`preload`/`renderer`. Imported by everyone.
- **`src/main/`** — privileged Node/Electron code: `node-pty`, `better-sqlite3`, dialogs,
  windows. Split into `services/` (logic) and `ipc/` (thin handler wiring).
- **`src/preload/`** — `contextBridge` only. A dumb, secure bridge. No business logic.
- **`src/renderer/`** — React UI. Feature-based. Never imports Electron; reaches main only
  through `window.*` APIs typed in `@shared/types/api`.

## Hard boundaries

- The renderer **must not** `import` from `electron`, `main`, or `preload` runtime code.
  It may only import **types** from `@shared`.
- `main/ipc/*` files contain *no logic* — they translate IPC calls to `services/` calls.
- Heavy logic never lives in React components. It goes in `hooks/` (stateful) or
  `services/` (stateless I/O).
- Cross-cutting types live in `@shared`. Feature-local types stay in the feature.

## Imports

Use path aliases, never deep relative paths:
`@shared/*`, `@main/*`, `@renderer/*` (configured in `tsconfig.json` + `electron.vite.config.ts`).
Within a single feature, relative imports (`../hooks/...`) are fine.

## Naming

- Services / IPC modules: `*.service.ts`, `*.ipc.ts`, `*.api.ts`.
- React components: `PascalCase.tsx`. Hooks: `useXxx.ts`. Plain modules: `camelCase.ts`.
- One main responsibility per file. If a file grows past ~120 lines, split it.
