# pepito standalone repo — migration & translation design

Date: 2026-08-17. Status: approved, pending execution (plan alongside).

## Decisions (made with the owner)

1. **Clean history.** This repo starts from the final state of
   `../vbmmsw/pepito` (v0.1.0, unpublished). The TDD-visible history remains
   in the source repo; this one is English-first from commit one.
2. **Full English translation** is part of the migration, not a follow-up:
   docs (README/CONTRIBUTING/CHANGELOG/ROADMAP), TSDoc, code comments, test
   names, and **failure messages** — which are product; their pinned message
   tests are updated in the same task. 0.1.0 is not on npm yet (verified
   2026-08-17: E404), so no version implication.
3. **vbmmsw retires its copy**: `pepito/` deleted there, `experiments/`
   consumes a vendored tgz (same pattern as the consumer), the `calidad` and
   `publicar-pepito` workflows move here (adapted), the `aceptacion` workflow
   is removed there — the real acceptance is the consumer repo's CI. Its
   CLAUDE.md/docs gain the pointer to this repo.
4. **Build stays `tsc`** — deliberate, recorded in
   `.claude/docs/references/build-tooling.md`: tsc emits the `.d.ts` half of
   the product with the same compiler that type-checks (single source of
   truth); SWC/esbuild are transpile-only (no declarations → second toolchain
   + drift risk) and solve a speed problem a ~15-module lib doesn't have;
   bundlers add tree-shaking risk to a package that registers matchers via
   import side effects; escape hatches if ever needed: tsgo for speed, tsup
   for dual-format JS with tsc kept for types.

## What this repo contains

- The library: `src/`, `test/`, `public/mockServiceWorker.js`, configs —
  copied from `../vbmmsw/pepito` and re-rooted (repo root = package root).
- Own tooling (the source repo's root owned lint/format before): ESLint 9
  flat config, Prettier (no semicolons, single quotes, width 80), `.nvmrc`,
  strict tsconfig + `tsconfig.build.json` (unchanged flags).
- CI/CD: `ci.yml` (lint + format:check + typecheck + coverage 90/90, on PRs)
  and `publish.yml` (tags `v*` + workflow_dispatch; test/typecheck/build +
  tag-version guard + `npm publish --provenance` with `NPM_TOKEN`). SHA-pinned
  actions, same pins as the source repo's workflows.
- Docs: task-oriented README (translated), CONTRIBUTING (harness + release
  runbook), CHANGELOG (0.1.0), ROADMAP (translated; the "translate to
  English" row closes with this migration).
- **Agent-facing references** in `.claude/docs/references/` (English,
  distilled for iterating the package):
  - `measured-foundations.md` — the findings the design stands on, condensed
    from the source repo's docs/knowledge: request:start body window,
    match≠intercepted table, quiescence counter paths + blind window +
    double-observation rationale, `@vitest/expect` augmentation, ANSI
    survival, the `+`-in-path hang (upstream state), storage/origin cleanup
    limits, cross-origin interception. Each item labeled measured/reasoned,
    with a pointer to the original Spanish doc in `../vbmmsw` for provenance.
  - `build-tooling.md` — decision record: tsc over SWC/bundlers (rationale in
    Decisions above).
  - `ai-collaboration.md` — created by loading `/ai-patterns` and distilling
    the patterns that apply to iterating THIS package (context management,
    steering, verification loops, anti-patterns to avoid). The executor MUST
    invoke the skill rather than paraphrase from memory.

## Acceptance criteria

1. Suite green in this repo (all tests, coverage ≥90/90), zero Spanish left
   in code, tests, messages or docs (`grep` sweep for common Spanish
   words/accents as the check, reviewed by a human-quality pass — mechanical
   grep alone is not proof).
2. Failure-message tests pin the ENGLISH wording (retry hint, negated forms,
   counts, traffic dump header).
3. CI green on a real PR in this repo; publish workflow validated statically
   (YAML, guard logic) — actual publish stays a human action.
4. vbmmsw PR merged: `pepito/` gone, experiments green consuming the vendored
   tgz, stale workflows removed, docs pointing here. Consumer repo pointer
   PR: its CLAUDE.md recipe paths updated (`../pepito`).
5. `npm pack --dry-run` audited: dist/, README, CHANGELOG, LICENSE,
   package.json — nothing else, English throughout.

## Out of scope (ROADMAP)

Trusted publishing (OIDC); order-of-identical-calls matcher; the rest of the
inherited ROADMAP rows, re-evaluated post-migration.
