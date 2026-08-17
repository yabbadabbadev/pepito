# pepito

Network test utilities for Vitest browser mode: `setupNetwork`, `mount`,
request descriptors and five async matchers over the traffic MSW observes.
Published as `@yabbadabbadev/pepito` (npm). This repo contains ONLY the
library, its docs and its CI/CD.

Born in the evaluation repo `../vbmmsw` (the browser-mode-vs-jsdom experiment
that produced the GO and the measured findings this package is built on) and
extracted here with a clean history on 2026-08-17. Its real-world consumer
lives in `../vbmmsw-consumer` («La Despensa») — that repo's CI is the
acceptance suite.

## Status

| Phase          | State                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| Migration spec | written: `docs/superpowers/specs/2026-08-17-standalone-repo-design.md` |
| Migration plan | written: `docs/superpowers/plans/2026-08-17-standalone-repo.md`        |
| Execution      | **pending** — run the plan with subagent-driven-development            |

## Non-negotiable rules

- **English everywhere** from this repo on: code comments, TSDoc, test names,
  docs, commit messages — and failure messages, which are product (they were
  Spanish in the source repo; translating them is part of the migration and
  their pinned message tests move with them).
- **Never commit on `main`**: work branch and PR, always.
- **Verify APIs before writing against them.** This stack moves fast; read
  `node_modules/**/*.d.ts` or measure. The package exists because of measured
  findings — don't regress into guessing. A meter that cannot measure must go
  red and carry its evidence.
- **Measured vs assumed stays labeled.** Findings get written down in
  `.claude/docs/references/` (agent-facing) or `docs/` (user-facing) the
  moment they're made.
- **The quality harness is not optional**: strict TS (`strict`,
  `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`), ESLint
  0 warnings, Prettier clean, 90/90 coverage on `src/`, TDD with the red
  visible, TSDoc on everything exported, and the four bans on AI-looking code
  (comments restating code; generic names; premature abstraction; suspicious
  uniformity).
- **No brand references** to any real company, anywhere.

## Commands (once Task 1 of the plan lands)

```bash
npm test                # vitest run, browser mode headless
npm run test:watch
npm run coverage        # enforces 90/90 thresholds
npm run typecheck
npm run build           # tsc -p tsconfig.build.json → dist/
npm run lint            # 0 warnings tolerated
npm run format
npm run setup           # playwright install chromium (one-off)
```

Use the npm scripts, not bare `npx`. Exception: one-off installs
(`npx msw init public --save`, `playwright install`).

## Architecture (one paragraph per boundary)

- `src/msw-events.ts` is the ONLY file that touches `worker.events` (MSW's
  life-cycle API is mid-migration upstream; changes get absorbed in one file).
- `src/traffic-registry.ts` is pure state: entries keyed by `requestId`,
  bodies stored as promises resolved only at assertion time, in-flight
  tracking as a Set, `waitForNetworkIdle` with a hard timeout that throws
  with a dump of what's pending.
- Matchers share ONE decision point between retry (positive) and
  wait-for-calm (negated/counts) — `snapshotAfterIdle` closes the measured
  blind window; never call `waitForNetworkIdle` raw.
- Failure messages are product: composed only in `failure-messages.ts`, built
  on `this.utils` (matcherHint/diff — ANSI survives from browser to
  terminal, measured), pinned by tests.
- Type augmentation targets `@vitest/expect`, not `'vitest'` (measured: the
  `'vitest'` form compiles but silently fails to merge here).
- Import side effects register the matchers — never add `sideEffects: false`.

## Workflow

This repo uses **superpowers**: `brainstorming` before designing anything
new, `writing-plans` before implementing, `subagent-driven-development` to
execute (fresh subagent per task, review between tasks), and
`verification-before-completion` — command plus output, never intention.

For AI-collaboration patterns (context management, steering, anti-patterns),
consult `/ai-patterns` and the distilled notes in
`.claude/docs/references/` once the migration creates them.

## Releasing

`CONTRIBUTING.md` carries the runbook: version bump + CHANGELOG by PR, then
tag `vX.Y.Z` → the publish workflow verifies (tests, typecheck, build,
tag-version guard) and publishes with `--provenance`. Requires the
`NPM_TOKEN` secret on THIS repo (granular automation token). Trusted
publishing (OIDC, no token) is on the ROADMAP once 0.1.0 exists on npm.
