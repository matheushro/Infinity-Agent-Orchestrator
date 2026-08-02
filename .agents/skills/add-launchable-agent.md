# Skill: Add a launchable agent

Use to add a new command users can launch in a terminal (alongside `codex` / `claude`).

## Steps

1. Open `src/renderer/features/terminals/commands.ts`.
2. Add an entry to `COMMANDS`:
   ```ts
   gemini: { key: 'gemini', label: 'Gemini', cmd: 'gemini', icon: '✦' }
   ```
   - `key` — stable identifier, also added to the `CommandKey` union.
   - `cmd` — the exact string written into the pty after the shell starts.
   - `label` / `icon` — shown in `TerminalSettingsModal`.
3. That's it. `TerminalSettingsModal` renders all `COMMANDS` automatically, `useTerminals`
   uses `COMMANDS[command].label` for default titles, and `useTerminalSession` writes
   `COMMANDS[command].cmd` into the pty.

## Notes

- No main-process or IPC change is needed — the command is just shell input.
- The binary must be on the user's `PATH`; the pty inherits `process.env`.
- Keep `CommandKey` and `COMMANDS` keys in sync (TypeScript will enforce it).
- Add/extend a `commands.test.ts` assertion for the new entry (shape + key in union),
  per `skills/add-tests.md`. Run `npm test` and `npm run build`.
