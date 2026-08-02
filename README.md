# IAO 📅 2026-07-27

**IAO — Infinity Agent Orchestrator.**

A desktop app (Electron + React + TypeScript) that gives you an infinite canvas where each
window is a **real terminal** running a **coding agent** — Claude Code, Codex, Gemini,
Copilot, OpenCode, Cursor, or a plain shell. Connect the terminals with edges and the agents
can talk to each other; drop markdown notes on the canvas and they can read and write those
too.

---

## Objective

Working with coding agents today means juggling terminal tabs: one agent per tab, no shared
context, no way for them to hand work to each other, and nothing left on screen showing how
the pieces fit together.

IAO's objective is to turn that into a **spatial, persistent, multi-agent workspace**:

- **See the whole system at once.** A pannable/zoomable canvas with movable, resizable
  terminals, a minimap, and free-floating text — the layout *is* the mental model.
- **Every window is a real process.** Terminals are actual PTYs (`node-pty`) running in a
  chosen folder, not a chat simulation. The agent you launch is the agent you'd run by hand.
- **Let agents collaborate.** Terminals linked by an edge become *connected agents*: they can
  list each other, send prompts and wait for the answer, and inspect what a peer is currently
  doing — via the `iao` CLI that IAO installs as a skill inside each agent.
- **Shared memory on the canvas.** Markdown notes are linked to terminals and shared between
  them, so agents have a common scratchpad that outlives any single session.
- **Nothing is lost.** Workspaces, terminals, notes, links, layout, prompts, and pinned models
  are persisted in local SQLite and restored on startup — plus full backup/restore.
- **Per-terminal control.** Each terminal has its own role prompt and its own pinned model,
  isolated to that process, so two agents on the canvas never fight over one global config.

Everything runs **locally**. IAO orchestrates the CLIs you already have installed; it does not
proxy your prompts through any service of its own.

---

## Features

- Infinite canvas: pan, zoom, minimap, free-floating text labels, drag-to-create.
- Multiple **workspaces**, each with its own set of terminals, notes, and layout.
- Movable/resizable terminal windows (`react-rnd`) with real terminal emulation (`xterm.js`).
- Launchable agents: **Codex, Claude Code, Gemini, GitHub Copilot, OpenCode, Cursor CLI**, or a
  plain terminal — each launched in a folder you pick.
- **Per-terminal model pinning** (via the agent's model env var or `--model` flag) and a model
  manager for custom entries.
- **Per-terminal role prompts**, delivered through the file the agent reads natively
  (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, …) instead of being typed into the REPL.
- **Agent-to-agent messaging** over edges — `iao agents` / `iao send` / `iao inspect`.
- **Markdown notes** as canvas nodes, linkable to terminals and shareable between agents
  (`iao note read|write|edit|link|…`). They use an Obsidian-style **Live Preview** editor: the
  Markdown renders as you type and the raw syntax only shows up under the cursor.
- Shell selection (system default, `bash`, `zsh`), rename, duplicate, reorder, enable/disable.
- Sidebar with all terminals and notes; open a terminal's folder in VS Code.
- Light/dark theme, full-screen mode.
- Local SQLite persistence + **backup export/import**.

## Stack

Electron · electron-vite · React 18 · TypeScript · Tailwind CSS · xterm.js · node-pty ·
better-sqlite3 · Vitest

---

## How to install / use

### Requirements

- **Node.js** and **npm**.
- Build tools for Electron's native modules (`node-pty`, `better-sqlite3`).
  On Linux: `python3`, `make`, `g++`. On macOS: Xcode Command Line Tools.
  On Windows: the Visual Studio C++ build tools.
- The agent CLIs you want to launch (`claude`, `codex`, `gemini`, …) must be installed and on
  your `PATH`. IAO runs them; it does not bundle them.

### Install

```bash
git clone https://github.com/matheushro/Infinity-Agent-Orchestrator.git
cd Infinity-Agent-Orchestrator
npm install
```

`npm install` runs a `postinstall` that rebuilds the native modules for your Electron version:

```bash
electron-rebuild -f -w node-pty,better-sqlite3
```

Re-run `npm install` (or that command) manually after bumping Electron.

### Run

```bash
npm run dev     # Electron + Vite with hot reload
npm run build   # compile main, preload and renderer
npm start       # preview the production build
```

### Package a desktop installer

```bash
npm run dist          # current platform
npm run dist:linux    # .deb
npm run dist:win      # NSIS installer
npm run dist:mac      # .dmg
```

### Using the canvas

1. **Create a workspace** (or use the default one) from the sidebar.
2. **Create a terminal** — drag on empty canvas, or use the toolbar. In the modal pick the
   **agent**, the **folder** it should run in, optionally a **model** and a **role prompt**.
   The agent starts in that folder automatically.
3. **Move / resize / rename** windows freely; the layout is saved as you go.
4. **Connect two terminals** by dragging an edge between them. They are now *connected agents*
   and can reach each other:

   ```bash
   iao agents                          # list connected agents
   iao send "Backend" "run the tests"  # send a prompt, wait for the answer
   iao inspect "Backend"               # read what that agent is doing right now
   ```

   IAO installs the `iao` skill into each agent's skills directory, so the agent discovers
   these commands on its own — you don't have to explain them.
5. **Add notes** as shared markdown memory, link them to terminals, and let agents read/write
   them with `iao note …`.
6. **Back up** the whole thing (workspaces, terminals, notes, links, layout) from settings —
   export to a file, import it on another machine.

### Tests

```bash
npm test        # run the suite once
npm run test:watch
```

`npm test` **and** `npm run build` are the verification step — every change must leave both
green. There is no linter configured.

---

## How to create a PR

Contributions go through a pull request against `main` on
[matheushro/Infinity-Agent-Orchestrator](https://github.com/matheushro/Infinity-Agent-Orchestrator).

### 1. Fork and branch

```bash
# external contributors: fork on GitHub first, then clone your fork
git checkout main
git pull
git checkout -b feat/short-description
```

Branch naming follows the change type: `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `test/…`.

### 2. Follow the project conventions

The architectural rules and step-by-step recipes live in **`.agents/`** — start from
[`.agents/README.md`](.agents/README.md), which maps "what you're about to do" to the one file
you should read. Highlights:

- Four layers, dependencies flow one way: `shared → main / preload / renderer`. Cross-boundary
  types live in `src/shared/` exactly once.
- Never hardcode an IPC channel string — add it to `IpcChannels` in `@shared/types/ipc`.
- Business logic goes in `main/services/*` or a renderer feature's `hooks/` / `services/`,
  never in a component or an IPC handler.
- Adding a launchable agent is a single entry in `src/shared/agents.ts`.

### 3. Tests are mandatory

Every behaviour change ships with tests; every bug fix ships with a **regression test that
fails before the fix**. Tests are co-located as `<file>.test.ts(x)` next to the unit, run on
Vitest, and mock at the boundary (`node-pty`, `better-sqlite3`, `electron`, `window.*`) — never
spawn a real PTY or database. See [`.agents/rules/testing.md`](.agents/rules/testing.md).

### 4. Verify before pushing

```bash
npm test
npm run build
```

Both must pass. A PR with a red suite or a broken build will not be merged.

### 5. Commit

Use [Conventional Commits](https://www.conventionalcommits.org/), matching the existing
history:

```bash
git commit -m "feat: add per-terminal model pinning"
git commit -m "fix: keep pty alive when the renderer remounts"
```

Keep commits focused — one logical change each.

### 6. Open the PR

```bash
git push -u origin feat/short-description
gh pr create --base main --fill    # or open it from the GitHub UI
```

In the PR description include:

- **What** changed and **why** (link the issue with `Closes #123` when there is one).
- **How you tested it** — which tests you added, and any manual verification on the canvas.
- **Screenshots or a short clip** for anything visual (canvas, modals, sidebar).
- Any migration or backup/restore impact, if you touched the SQLite schema.

Then wait for review, push follow-up commits to the same branch, and squash-merge once
approved.

---

## Project structure

```text
src/
├── shared/          # pure types & constants shared by every process
│   ├── agents.ts        # registry of launchable agents (codex, claude, …)
│   └── types/           # ipc.ts, terminal.ts, api.ts
├── main/            # privileged Electron/Node code
│   ├── index.ts         # thin bootstrap
│   ├── window.ts        # BrowserWindow
│   ├── services/        # pty, db, iao (agent RPC), backup, skills, prompts, window
│   └── ipc/             # one thin handler file per domain
├── preload/         # contextBridge only — one bridge per domain
└── renderer/        # React, feature-based
    ├── app/             # shell: App.tsx, Sidebar, Topbar, modals
    ├── features/        # terminals · canvas · notes · workspaces
    ├── components/ui/   # reusable dumb UI kit
    ├── hooks/ lib/      # generic hooks, pure utils
    └── styles/
```

Two id concepts worth knowing: `node.id` is the **persistence/layout** id in SQLite, while each
xterm mount generates a fresh UUID for its **PTY session** — so a React StrictMode remount can
never let a dead PTY's `exit` event leak into the live terminal.

## License

[MIT](LICENSE) © Matheus Oliveira
