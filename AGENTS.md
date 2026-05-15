# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project conventions — read on demand

Architectural standards and step-by-step recipes live in **`.agents/`** (`rules/` and `skills/`).

**Do not preload the `.agents/` folder.** To save context/tokens, read a file there *only
when the task in front of you actually matches it*. Start from `.agents/README.md` — it is a
small index that maps "what you're about to do" to the single file you should open. For
trivial changes that clearly follow an existing pattern, you may skip it entirely.
`.agents/rules/architecture.md` is the only file relevant to almost any change.

## Overview

IAO (Infinity Agent Orchestrator) is an Electron desktop app: a navigable infinite canvas where users spawn multiple movable/resizable terminal windows, each running a real shell via `node-pty`. Terminals are meant to launch coding agents (`codex`, `claude`) in a chosen folder.

## Commands

- `npm run dev` — start Electron + Vite in development (hot reload).
- `npm run build` — compile main, preload, and renderer with `electron-vite`.
- `npm start` — preview the production build.
- `npm test` — run the Vitest suite once (verification step for every change).
- `npm run test:watch` — Vitest in watch mode while developing.
- `npm install` runs a `postinstall` that rebuilds native deps: `electron-rebuild -f -w node-pty -w better-sqlite3`. On Linux this needs `python3`, `make`, `g++`. Run it manually after Electron version bumps.

No linter is configured. **`npm test` and `npm run build` together are the verification
step** — every change must leave both green.

## Testing — required on every change

Tests are mandatory: any change to behaviour ships with tests, and a bug fix ships with a
regression test that fails before the fix. The runner is **Vitest** (reuses the Vite config
and `@shared`/`@main`/`@renderer` aliases), with `@testing-library/react` + jsdom for
renderer hooks/components. Tests are **co-located** as `<file>.test.ts(x)` next to the unit.
Test logic where it lives — `main/services/*`, renderer feature `hooks/` and `services/`,
`lib/` — and mock at the boundary (`node-pty`, `better-sqlite3`, `electron`, `window.*`),
never spawning a real pty or DB. Full standards: `.agents/rules/testing.md`; step-by-step:
`.agents/skills/add-tests.md`.

## Architecture

Four layers; dependencies flow one direction only — see `.agents/rules/architecture.md` for the
full rules. Three `electron-vite` build targets (`electron.vite.config.ts`), path aliases
`@shared` / `@main` / `@renderer`.

- **`src/shared/`** — pure types & constants only. `types/ipc.ts` (`IpcChannels` + IPC
  payloads), `types/terminal.ts` (`TerminalRecord`, `ShellType`), `types/api.ts` (the
  `window.*` bridge contracts). The single source of truth across all processes.
- **`src/main/`** — privileged Node/Electron code. `index.ts` is a thin bootstrap;
  `window.ts` makes the `BrowserWindow`; `services/*.service.ts` hold the logic (pty
  lifecycle + shell resolution, SQLite); `ipc/*.ipc.ts` are thin handlers per domain wired
  by `ipc/index.ts`. `node-pty` / `better-sqlite3` are externalized native modules.
- **`src/preload/`** — `contextBridge` only. `index.ts` exposes the APIs; `api/*.api.ts`
  are one-liner bridges per domain. Context isolation on, node integration off.
- **`src/renderer/`** — React, feature-based. `app/` is the shell (`App.tsx` composes
  features, holds only view-level UI state). `features/<name>/` are self-contained
  (`components/`, `hooks/`, `services/`, `types.ts`) — `terminals` and `canvas` today.
  `components/ui/` is the reusable dumb UI kit; `hooks/` generic hooks; `lib/` pure utils;
  `styles/` global CSS.

### Two distinct id concepts (important)

`node.id` is the **persistence/layout** id stored in SQLite. It is NOT used as the PTY id.
`useTerminalSession` generates a fresh `crypto.randomUUID()` per xterm mount for the PTY
session — because React StrictMode mounts effects twice, reusing `node.id` would let the
first (dead) PTY's `pty:exit` leak into the remounted terminal.

### IPC contract

Channel names are centralized in `IpcChannels` (`@shared/types/ipc`). `pty:create` (invoke)
spawns the shell, then writes the agent command (`codex`/`claude`, from
`features/terminals/commands.ts`) into it after a 250ms delay. `pty:input`/`pty:resize`/
`pty:kill` are fire-and-forget sends. `pty:data`/`pty:exit` are main→renderer events.
`db:upsert` is called on every node create/move/resize/rename; `db:list-active` restores
terminals on app startup.

### State flow

`useTerminals` (in the terminals feature) is the single source of truth for nodes;
`App.tsx` just consumes it. `createTerminal`/`updateNode`/`removeNode` mutate React state
and persist through `terminalRepository` → `window.dbApi`. On startup `useTerminals`
rehydrates from `db:list-active`. Canvas pan/zoom (`usePanZoom`) is local and not
persisted; theme is persisted in `localStorage` via `useLocalStorage`.

## Notes

- Adding a launchable agent: add an entry to `COMMANDS` in
  `src/renderer/features/terminals/commands.ts` (see `.agents/skills/add-launchable-agent.md`).
- Adding an IPC channel: follow `.agents/skills/add-ipc-channel.md` — every cross-boundary
  type goes in `@shared` exactly once; never hardcode channel strings.
- Adding/updating tests: follow `.agents/skills/add-tests.md`. This applies to *every*
  change, not just new features.
