# .agents — project conventions for AI agents

This folder holds the **rules** (architectural standards) and **skills** (step-by-step
recipes) for working on IGO. It is the single source of truth for "how we build here".

## ⚠️ On-demand loading — read only what you need

**Do not read this whole folder.** Each file is self-contained. Load a file *only when
the task at hand actually matches it*, to avoid wasting context/tokens.

Use this index to decide what (if anything) to open:

| You are about to… | Read |
|---|---|
| Touch any file / decide where code goes | `rules/architecture.md` |
| Work in `src/main/**` (pty, db, dialog, IPC handlers) | `rules/main.md` |
| Work in `src/preload/**` | `rules/preload.md` |
| Work in `src/renderer/**` (UI, features, hooks) | `rules/renderer.md` |
| Add/change a shared type or IPC channel name | `rules/shared.md` |
| Add a new IPC channel end-to-end | `skills/add-ipc-channel.md` |
| Create a new renderer feature | `skills/add-renderer-feature.md` |
| Add a launchable agent (codex/claude/…) | `skills/add-launchable-agent.md` |
| Build a reusable UI component | `skills/add-ui-component.md` |

For a trivial change that clearly fits an existing pattern, you may skip these entirely.
When in doubt about layering, `rules/architecture.md` is the only always-relevant file.
