# Standalone repo migration plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this repo into the standalone home of `@yabbadabbadev/pepito`
per `docs/superpowers/specs/2026-08-17-standalone-repo-design.md`: library
imported and re-rooted, everything translated to English (messages included),
own tooling + CI/CD, agent-facing references, and the source repo retired.

**Architecture:** copy-then-transform. The library arrives working (Spanish)
in Task 1 and every later task keeps the suite green. Source of truth for
content: `../vbmmsw/pepito` at its current main. The spec's Decisions section
governs every ambiguity.

## Global Constraints

- English everywhere in THIS repo (comments, TSDoc, test names, docs, commit
  messages, failure messages). The source repo stays untouched until Task 6.
- Quality harness (CLAUDE.md): strict TS flags, ESLint 0 warnings, Prettier
  (no semicolons, single quotes, 80), coverage 90/90 on src/, TDD visible
  where behavior changes (message translation IS behavior: tests first),
  TSDoc on all exports, the four AI-smell bans, no brand references.
- Never commit on main; branch + PR (suggested branch name: `standalone` —
  deliberately WITHOUT a slash: Claude Code worktrees map `feat/x` to a
  `feat+x` directory, and a `+` anywhere in the path hangs Vitest browser
  mode silently and forever — measured; see
  `../vbmmsw/docs/knowledge/rutas-con-mas-browser-mode.md`. If you do use a
  worktree, verify its directory name has no `+`, `%` or spaces BEFORE
  running any test). The repo-owner's git hooks evaluate the SESSION cwd's
  branch — if a hook blocks an operation targeting another repo, move THAT
  cwd repo to a temp branch, never bypass the hook (see `../vbmmsw` memory:
  hooks-git-cwd-bug).
- Timing constants, mechanisms and public API are NOT up for redesign here —
  this is a move + translation, not a refactor. Any real defect found goes to
  the review loop, not silent fixing.

### Task 1: Import the library, re-rooted and green

**Files:** copy from `../vbmmsw/pepito/`: `src/`, `test/`, `public/`,
`package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`,
LICENSE, README/CHANGELOG/CONTRIBUTING/ROADMAP (still Spanish — translated in
Tasks 4-5). Create root tooling the monorepo used to provide: `eslint.config.js`
(adapt from `../vbmmsw/eslint.config.js`: same rules, minus monorepo ignores),
`.prettierrc` equivalent to the source root's, `.nvmrc` (copy), `.gitignore`
(node_modules, dist, coverage, `**/__screenshots__/`, `**/.vitest-attachments/`,
`.eslintcache`, `dist-pack/`).

- [ ] Copy + adjust `package.json`: add `lint`/`lint-fix`/`format`/
      `format:check` scripts (they lived at the monorepo root); everything
      else (name, exports, files, publishConfig, peerDeps) stays.
- [ ] `npm ci` fresh (regenerates lockfile at new root), `npm run setup`,
      `npx msw init public --save` only if `public/` didn't copy cleanly.
- [ ] Verify: full suite green (67 tests at source), `typecheck`, `build`,
      `coverage` ≥90/90, `lint`, `format:check`.
- [ ] Commit: `feat: import the library from the evaluation repo, re-rooted`

### Task 2: CI/CD workflows

**Files:** create `.github/workflows/ci.yml` and
`.github/workflows/publish.yml`. Reference: `../vbmmsw/.github/workflows/{pepito,publicar-pepito}.yml`
(copy the SHA pins verbatim; comments now in English).

- [ ] `ci.yml`: on pull_request (no paths filter — this whole repo is the
      package) + workflow_dispatch: npm ci → playwright install --with-deps
      chromium → lint → format:check → typecheck → coverage (90/90 enforced
      by vitest config).
- [ ] `publish.yml`: tags `v*` + workflow_dispatch; test/typecheck/build; tag
      guard now compares `v$(node -p "require('./package.json').version")`
      (no `pepito-` prefix); `npm publish --provenance` with
      `NODE_AUTH_TOKEN: secrets.NPM_TOKEN`; note in comments the secret must
      be set on THIS repo.
- [ ] Verify: YAML parses; scripts referenced exist. Commit:
      `ci: quality gate and provenance publishing`

### Task 3: Translate the code layer (messages are product — TDD)

**Files:** `src/*.ts` (TSDoc + comments + failure messages),
`test/*.ts(x)` (test names, comments, and the PINNED message assertions).

- [ ] Message tests FIRST: update every pinned wording assertion to the
      intended English (`Expected:`/`Not expected:`, counts «expected 2,
      found 3», unhandled list header, «Observed traffic:», the network-idle
      timeout text «the network did not settle within …ms; in flight:»), run
      RED, then translate `failure-messages.ts` + `traffic-registry.ts`
      timeout text to GREEN. Diff labels (`- Expected`/`+ Received`) come
      from vitest utils and don't change.
- [ ] Then the inert layer: TSDoc (keep @example imports as
      `@yabbadabbadev/pepito`), comments (preserve the measured/reasoned
      qualifiers faithfully — do not flatten nuance in translation), test
      names. Guard: `grep -rniE '[áéíóúñ¿¡]| el | la | que ' src test` → zero
      (then human-read the diff; grep is a floor, not proof).
- [ ] Full suite + coverage + lint. Commit:
      `feat!: english failure messages` + `docs: english TSDoc, comments and test names`

### Task 4: Translate the package docs

**Files:** README.md, CONTRIBUTING.md, CHANGELOG.md, ROADMAP.md.

- [ ] Task-oriented README preserved section-for-section (including the
      sequence recipe, the calm-wait recipe, the cheat sheet, the
      mount↔setupNetwork coupling note). CONTRIBUTING keeps the harness and
      the release runbook (tags are `v*` here; NPM_TOKEN on this repo).
      CHANGELOG 0.1.0 rewritten in English (unpublished). ROADMAP translated;
      the translation row CLOSES (done by this migration), the rest carry over.
- [ ] Commit: `docs: english package documentation`

### Task 5: Agent-facing references + ai-patterns

**Files:** create `.claude/docs/references/measured-foundations.md`,
`.claude/docs/references/build-tooling.md`,
`.claude/docs/references/ai-collaboration.md`; final pass on CLAUDE.md
(status table → executed; command list verified real).

- [ ] `measured-foundations.md`: distill from `../vbmmsw/docs/knowledge/`
      (msw-browser-mode, quiescencia-red-msw, url-navegacion,
      salida-coloreada, augmentacion-tipos, rutas-con-mas,
      regresion-visual): one section per finding, English, labeled
      measured/reasoned, each with a provenance pointer to the original doc.
      This is a distillation for iterating pepito — not a full translation of
      the experiment corpus.
- [ ] `build-tooling.md`: the tsc-over-SWC/bundlers decision record (rationale
      verbatim from the spec's Decision 4, expanded with the escape hatches).
- [ ] `ai-collaboration.md`: **invoke the `/ai-patterns` skill** and distill
      the patterns applicable to iterating this package (context management,
      steering, verification, anti-patterns), each tied to a concrete
      practice already used here (e.g. measure-before-design, meter-goes-red,
      review loops). No skill invocation → no file: do not write it from
      memory.
- [ ] Commit: `docs: agent-facing references for iterating the package`

### Task 6: Retire pepito in vbmmsw (PR in ../vbmmsw)

**Files (in ../vbmmsw):** delete `pepito/`; `experiments/`: vendor the tgz
(`experiments/vendor/yabbadabbadev-pepito-0.1.0.tgz` built from THIS repo via
`npm run pack:local`) and point package.json at it; delete
`.github/workflows/{pepito,publicar-pepito,aceptacion}.yml` (lint.yml stays);
update root CLAUDE.md (estructura, comandos, estado: «pepito vive en
yabbadabbadev/pepito»), and any docs/knowledge references to `pepito/` paths
get a pointer note (do not rewrite historical docs' content).

- [ ] experiments suites green (browser, serial, jsdom) + typecheck with the
      vendored tgz; root lint/format green.
- [ ] PR in vbmmsw (Spanish commit style THERE), merge after checks.
- [ ] Small PR in `../vbmmsw-consumer`: CLAUDE.md/README tgz-refresh recipe
      paths now point at `../pepito` (`npm run pack:local` here). Merge.

### Task 7: Final review and handover

- [ ] Whole-repo review (final code-reviewer, most capable model): spec
      criteria 1-5 audited, Spanish sweep verdict, CI run evidence on a real
      PR in this repo.
- [ ] Update CLAUDE.md status table; leave publishing (NPM_TOKEN + tag) as
      the documented human action.

## Self-review

Spec criteria → tasks: 1→T1/T3 (sweep), 2→T3, 3→T2+T7 (CI on real PR),
4→T6, 5→T7 (pack audit). The `/ai-patterns` mandate → T5. tsc decision →
`build-tooling.md` (T5) + spec Decision 4. Hook-cwd hazard → Global
Constraints.
