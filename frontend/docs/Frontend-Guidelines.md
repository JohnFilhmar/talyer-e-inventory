# Frontend System Guidelines — retired

**This guide is retired. Do not add to it, and do not treat anything it used to
say as current.** It was withdrawn on 2026-09-10 by GAP-052.

## Where its content went

The part that was still true and still enforced, the design system, moved into
the **Design constraints** section of [CLAUDE.md](../../CLAUDE.md): the strict
palette and its button rules, no transitions or animations, the typography and
spacing scales, mobile-first responsive on every page, the `max-w-7xl`
container, and the rule that new UI extends the primitives in
`src/components/ui/` rather than adding base components.

## Why it was retired rather than corrected

It described a system that does not exist, and it had drifted at three
independent points at once:

- A `features/<domain>/{services,hooks,types,components}` architecture with a
  no-cross-feature-imports rule. `src/` has no `features/` directory. The layout
  is flat: `components/<domain>/`, `hooks/`, `lib/services/`. Nine further
  sub-paths in the same block did not exist either.
- Jest and React Testing Library as the unit-test stack, in the present tense.
  Neither was ever installed. The frontend does have a test runner now, Vitest,
  added by GAP-044, which this file never mentioned.
- `NEXT_PUBLIC_API_URL=http://localhost:5000`, without the `/api` suffix the
  backend requires. Every compose file, both CI workflows and the Dockerfile got
  this right; this file did not.

Correcting it in place would have preserved the thing that caused the drift:
two overlapping frontend guides, one of which nobody updates. `CLAUDE.md` is the
single source now.

## The historical record

This file is kept as a stub rather than deleted because the per-phase plans in
this directory link to it, and those are a record of what was planned at the
time. Its original content is in the git history if you need to know what was
once specified: `git log --follow -p frontend/docs/Frontend-Guidelines.md`.
