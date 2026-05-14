# Skill: Add a new renderer feature

Use when adding a new domain to the UI (something beyond terminals — e.g. notes, agents
panel, file browser). Keep it self-contained so the app stays plugin-ready.

## Scaffold

Create `src/renderer/features/<name>/`:

```
features/<name>/
  components/        # feature-specific React components (PascalCase.tsx)
  hooks/             # feature-specific stateful logic (useXxx.ts)
  services/          # stateless I/O, talks only to window.* bridge APIs
  types.ts           # feature-local types
  index.ts           # barrel: public surface of the feature
```

Only create the folders you actually need now — don't scaffold empty dirs.

## Rules

- The feature owns its state in a **hook** (like `useTerminals`). `App.tsx` consumes the
  hook; it does not hold the feature's domain state.
- Data access goes through a **service** in the feature (like `terminalRepository`) that
  maps wire shapes (`@shared`) ↔ feature models (`types.ts`) and calls only `window.*`.
- Components stay thin — layout/markup only. Heavy logic → hook or service.
- Cross-boundary types (IPC/persistence) go in `@shared`; feature-only types in `types.ts`.
- If the feature needs main-process support, add the IPC via `skills/add-ipc-channel.md`.
- Reuse `components/ui` for buttons/inputs/modals — don't re-style primitives.

## Wire it in

- `App.tsx` composes the feature (renders its component / calls its hook). `App.tsx` holds
  only view-level UI state, never the feature's domain state.
- Export the feature's public surface from `index.ts`; import via `@renderer/features/...`.

## Checklist

- [ ] No Electron import; main reached only via `window.*`.
- [ ] Logic in hooks/services, not components.
- [ ] Feature is self-contained — nothing leaks into other features.
- [ ] `npm run build` passes.
