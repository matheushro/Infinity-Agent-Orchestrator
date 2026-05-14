# IGO

IGO - Infinity Agent Orchestrator.

MVP for a visual local agent/terminal orchestrator built with Electron, React, and TypeScript.

The project provides a navigable canvas where users can create multiple terminals, move and resize each window, choose the shell, and interact with real system processes through `node-pty`.

## Features

- Canvas with a draggable navigable background.
- Creation of multiple local terminals.
- Movable and resizable terminals with `react-rnd`.
- Terminal emulation with `xterm.js`.
- Real shell execution in Electron's main process through `node-pty`.
- Shell selection between the system default, `bash`, and `zsh`.
- Terminal renaming with a double-click on the title.
- Individual terminal closing.
- Local SQLite persistence prepared in the main process.

## Stack

- Electron
- Electron Vite
- React
- TypeScript
- Tailwind CSS
- xterm.js
- node-pty
- better-sqlite3

## Requirements

- Node.js
- npm
- An environment with compilers/build tools for Electron native dependencies, especially `node-pty` and `better-sqlite3`.

On Linux, tools such as `python3`, `make`, and `g++` are usually required.

## Installation

```bash
npm install
```

The project has a `postinstall` script that rebuilds native dependencies for Electron:

```bash
electron-rebuild -f -w node-pty -w better-sqlite3
```

## Development

To start the app in development mode:

```bash
npm run dev
```

## Build

To generate the build:

```bash
npm run build
```

To preview the generated build:

```bash
npm start
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Starts Electron with Vite in development mode. |
| `npm run build` | Compiles main, preload, and renderer with `electron-vite`. |
| `npm start` | Runs the build preview. |
| `npm run postinstall` | Rebuilds native dependencies for the Electron version. |

## Structure

```text
.
├── src
│   ├── main
│   │   └── index.ts          # Electron main process, PTY, IPC, and SQLite
│   ├── preload
│   │   └── index.ts          # Safe bridge between renderer and main process
│   └── renderer
│       ├── App.tsx           # Terminal state and main toolbar
│       ├── main.tsx          # React entry point
│       ├── index.css         # Tailwind and global styles
│       └── components
│           ├── Canvas.tsx        # Navigable canvas
│           └── TerminalNode.tsx  # Terminal window
├── electron.vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## Architecture

The React renderer handles the interface: canvas, terminal windows, visual state, and user interactions.

The preload exposes controlled APIs on `window` through `contextBridge`:

- `ptyApi`: creates, resizes, writes to, closes, and listens to terminal data.
- `dbApi`: lists, saves, and removes terminal records in SQLite.
- `dialogApi`: opens the native folder picker.

Electron's main process centralizes sensitive operations:

- creates pseudo-terminal processes with `node-pty`;
- resolves the requested shell;
- routes input and output between the renderer and PTY;
- manages process termination;
- initializes the local `terminals.db` database in `app.getPath('userData')`.

## MVP Notes

- The current interface creates terminals during the session and allows each one to be moved, resized, renamed, and closed.
- The main process already has initial support for SQLite persistence, folder selection, and startup commands, but part of that flow is not fully connected in the interface yet.
- The project does not have test scripts configured yet.

## License

MIT
