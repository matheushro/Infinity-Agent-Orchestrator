# Skill: Add / update tests for a change

Use this **on every change** — new feature, IPC channel, component, or bug fix. See
`rules/testing.md` for the standards; this is the step-by-step.

## Steps

1. **Locate the unit.** Find the file holding the logic you changed (a `*.service.ts`,
   a `useXxx.ts` hook, a feature service, a `lib/` util). Logic lives in hooks/services —
   that is what you test, not components or `ipc/*` wiring.

2. **Create / open the test file** next to it: `<file>.test.ts(x)`.

3. **Mock the boundary, not the unit:**
   - Main services → `vi.mock('node-pty')`, `vi.mock('better-sqlite3')`, `vi.mock('electron')`.
   - Renderer hooks/services → stub `window.ptyApi` / `window.dbApi` / `window.dialogApi`
     with `vi.fn()`s.
   - Use `vi.useFakeTimers()` for anything time-based (e.g. the 250ms `pty:create` delay).

4. **Write behaviour assertions:**
   - Bug fix → first write a test that **fails** reproducing the bug, then fix.
   - New logic → cover the happy path + each branch (error, empty, edge ids).
   - Renderer hooks → `renderHook` from `@testing-library/react`; components → render and
     assert behaviour, not DOM structure.

5. **Run `npm test`** — it must be green. Then `npm run build` as before.

## Checklist

- [ ] Test file co-located as `<file>.test.ts(x)`.
- [ ] Native modules / `window.*` mocked at the boundary; no real pty, DB, or network.
- [ ] Bug fixes have a regression test that failed before the fix.
- [ ] New branches/paths covered; assertions are on behaviour.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
</content>
</invoke>
