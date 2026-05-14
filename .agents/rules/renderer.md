# Rule: Renderer (`src/renderer/`)

React UI, feature-based. The renderer never touches Electron — it reaches main only
through `window.*` APIs (typed in `@shared/types/api`).

## Structure

- `app/` — the application shell. `App.tsx` composes features and holds only view-level
  UI state (modal open, selected shell/theme). **No domain logic.** `app/components/` is
  app-level chrome (e.g. `Toolbar`).
- `features/<name>/` — one folder per domain. Self-contained:
  - `components/` — feature-specific React components.
  - `hooks/` — feature-specific stateful logic (this is where logic extracted from
    components/`App` lives, e.g. `useTerminals`, `useTerminalSession`).
  - `services/` — stateless I/O for the feature; talks only to `window.*` bridge APIs
    (e.g. `terminalRepository`). Maps wire records ↔ in-memory models.
  - `types.ts` — feature-local types. `commands.ts`, etc. as needed.
- `components/ui/` — the **reusable, dumb UI kit** (`Button`, `Select`, `Modal`).
  No feature knowledge, no business logic. Export via `components/ui/index.ts`.
- `hooks/` — generic, cross-feature hooks (e.g. `useLocalStorage`).
- `lib/` — generic pure utilities (e.g. `id.ts`).
- `styles/` — global CSS.

## Rules

- **Components are thin.** No persistence calls, no IPC, no heavy computation inside JSX
  components. Push it into a hook or a service.
- A component that needs main-process data uses a feature **hook**, which uses a feature
  **service**, which calls `window.*`. Don't skip layers from a component.
- Feature-specific code stays inside its feature. If two features need it, promote it to
  `components/ui`, `hooks/`, or `lib/`.
- Reusable UI (`components/ui`) must not import from `features/`.
- Use path aliases (`@renderer/*`, `@shared/*`); relative imports only within one feature.
- Tailwind for styling. Keep class lists readable; extract repeated patterns into a
  `components/ui` component rather than copy-pasting.
- Strong typing: no `any`. Feature models in `types.ts`, shared/wire shapes from `@shared`.

## Adding something

- New domain → `skills/add-renderer-feature.md`.
- New reusable component → `skills/add-ui-component.md`.
