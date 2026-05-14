# Skill: Add a reusable UI component

Use when a UI primitive (button, input, modal, tooltip, etc.) is needed by more than one
place, or you're about to copy-paste Tailwind class lists.

## Where

`src/renderer/components/ui/<Component>.tsx` — the shared, dumb UI kit.

If it's only used by one feature, it does **not** belong here — put it in that feature's
`components/` instead.

## Rules

- **Dumb and generic.** No feature knowledge, no business logic, no `window.*`, no
  persistence. Props in, markup out.
- Must not import from `src/renderer/features/**`.
- Strongly typed props interface; extend the native element props when wrapping one
  (e.g. `ButtonHTMLAttributes<HTMLButtonElement>`) so it stays composable.
- Tailwind for styling. Expose variants via a `variant`/`size` prop rather than forcing
  callers to pass class names; allow `className` to be merged for one-offs.
- Keep it small; one component per file, `PascalCase.tsx`.

## Wire it in

Add the export to `src/renderer/components/ui/index.ts` (the barrel). Consumers import
`{ Button } from '@renderer/components/ui'`.

## Checklist

- [ ] Zero feature/Electron imports.
- [ ] Typed props, native props extended where relevant.
- [ ] Exported from `components/ui/index.ts`.
- [ ] `npm run build` passes.
