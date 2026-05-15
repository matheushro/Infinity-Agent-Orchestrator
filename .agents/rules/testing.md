# Rule: Testing

Every change ships with tests. New behaviour gets new tests; a bug fix gets a regression
test that fails before the fix. A change is not done until `npm test` and `npm run build`
both pass.

## Stack

- **Vitest** is the runner — it reuses the `electron-vite` / Vite config and the
  `@shared` / `@main` / `@renderer` path aliases, so no separate test config to maintain.
- **`@testing-library/react`** + **jsdom** for renderer hooks and components.
- Main-process and `lib/` code is plain Node — test it directly, no DOM.

## Where tests live

Co-locate: `foo.service.ts` → `foo.service.test.ts`, `useTerminals.ts` →
`useTerminals.test.ts`, sitting next to the file under test. No central `tests/` tree —
tests follow the same layer/feature structure as the code.

## What to test (follows the architecture layers)

- **`src/shared/`** — usually nothing; pure types. Test only non-trivial constants/helpers.
- **`src/main/services/`** — the priority. Pure-ish logic with native modules mocked
  (`node-pty`, `better-sqlite3`, `electron`). Test pty lifecycle, shell resolution, DB
  upsert/list behaviour.
- **`src/main/ipc/` & `src/preload/`** — thin wiring; don't unit-test the one-liners.
- **`src/renderer/features/*/hooks/` & `services/`** — this is where renderer logic lives,
  so this is what you test. Mock the `window.*` bridge APIs.
- **`src/renderer/components/`** — test behaviour (what the user sees/does), not markup.
  Thin components may need no test.

## How to test

- **Mock at the boundary.** Never spawn a real pty, open a real SQLite file, or hit the
  filesystem. Mock `node-pty` / `better-sqlite3` / `electron` in main; stub `window.ptyApi`
  / `window.dbApi` / `window.dialogApi` with `vi.fn()` in the renderer.
- Use `vi.useFakeTimers()` for time-dependent code (e.g. the 250ms `pty:create` delay).
- Assert on behaviour and contracts, not implementation details.
- Keep tests in the same layer as their subject — a renderer test never imports `main`.

## Commands

- `npm test` — run the suite once (CI / verification step).
- `npm run test:watch` — watch mode while developing.

`npm test` joins `npm run build` as the standard verification step for every change.

## Adding tests

Follow `skills/add-tests.md` for the step-by-step recipe.
</content>
