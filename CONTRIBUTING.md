# Contributing to pepito

## Running the tests

The first time, install the browser that browser mode uses:

```bash
npm run setup
```

```bash
npm test               # vitest run, headless, full suite
npm run test:watch     # watch mode
npm run test:verbose   # needed to see console.log output (network.log(), etc.)
npm run coverage       # vitest run --coverage
npm run typecheck      # tsc --noEmit
```

For one file or one specific test, pass arguments to the script instead of
invoking `vitest` directly: `npm test -- test/mount.test.tsx` or
`npm test -- -t 'test name'`.

Before a PR, also run:

```bash
npm run lint
npm run format:check
```

## Regenerating the package for external consumers

`npm run pack:local` builds the tarball that this package's real-world
consumers vendor to test against what npm would install, not against
source. Any change under `src/` makes an already-vendored tarball stale, and
regenerating and re-vendoring it is a manual step done in each consuming
repo:

```bash
mkdir -p dist-pack   # npm pack doesn't create it on its own; without this step it fails with ENOENT
npm run pack:local
```

Copy the resulting `dist-pack/yabbadabbadev-pepito-0.1.0.tgz` into the
consuming repo's own vendor directory — for example `../vbmmsw`'s (private)
`experiments/vendor/` or `../vbmmsw-consumer`'s (private) `vendor/` — and reinstall
there (`npm i`) so its lockfile picks up the new tarball's integrity hash.

`dist-pack/` is gitignored in THIS repo: the tarball is a local build
artifact, not something this repo commits. Each consuming repo commits its
own vendored copy, the same way it would commit any other vendored
dependency.

## The quality harness

This package is meant to go public, so the bar is that an outside human can
contribute to it, not just that it compiles. What a PR has to meet:

- **TDD, and it has to show.** Red, green, refactor, in that order. The PR
  must let the cycle show in the commits — writing the implementation first
  and adding tests after, just to fill out the paperwork, doesn't count. A
  test that has never failed proves nothing.
- **A minimum of 90% coverage on lines and branches** over `src/`, checked
  with `npm run coverage`. If the threshold gets in the way in a specific
  case, it's discussed in the PR; it doesn't get lowered silently.
- **`tsc --noEmit` with no errors**, with `strict`, `noUncheckedIndexedAccess`,
  `noUnusedLocals` and `noUnusedParameters` — they're already enabled in
  `tsconfig.json`, no need to configure them.
- **ESLint with 0 warnings and Prettier clean**, across the whole repo.
- **The matchers' failure messages are part of the product.** A change to
  `failure-messages.ts` or to the text of a `throw` needs its own test that
  checks the message, just like any other output — it isn't incidental to
  the logic that fails.
- **Fixtures for mocked responses follow the house's Mother/Builder
  pattern**: each Mother models the shape of one endpoint's response, with
  named factories for its variants. No spread literals and no
  `structuredClone` with mutation, neither in tests nor in documentation
  examples — that's where people copy from. An incidental payload that
  isn't an entity (`{ ok: true }`) doesn't need a Mother.
- **Four code smells that aren't accepted**: comments that restate the code
  instead of explaining the why, generic names (`data`, `result`,
  `handler`...), just-in-case abstraction with no real use case, and
  suspicious uniformity (empty sections, cloned files with no content of
  their own).
- **TSDoc on everything exported**, with at least one runnable example on
  `setupNetwork`, `mount` and the five matchers.

## What's expected of a PR

- Test first: the PR should read as red → green → refactor, not as an
  implementation with tests tacked on at the end.
- If you change a failure message or add a new one, the test that covers it
  goes in the same PR.
- If the change touches a public API, also update the symbol's TSDoc and,
  if it applies, `README.md` — task-oriented, not a restatement of the
  function's signature.
- Example fixtures use Mothers, not loose literals.
- None of the package's name (`@yabbadabbadev/pepito`) leaks into the
  package's own test imports: they go through a relative path (`../src`),
  so a name change still only costs a `sed`.

## Publishing a version

Publishing follows from **merging the release PR**. There is no manual tag
step and no token: `.github/workflows/release.yml` keeps a release PR open
on `main` (via `release-please`), and merging it is what creates the tag and
triggers the publish job in the same workflow file. Authentication is OIDC
against a trusted publisher registered on npmjs.com — see
`docs/trusted-publishing.md` for why that replaces a stored credential and
what npm matches on.

Commits on `main` must follow [Conventional Commits](https://www.conventionalcommits.org/),
because that's what release-please reads to decide whether a release PR is
needed at all: `feat:` and `fix:` commits produce one; `docs:`, `ci:`,
`chore:` and `refactor:` commits do not touch the release PR.

### The documentation-only release

When a release is wanted and no `feat:` or `fix:` commit is behind it — a
CHANGELOG correction, a docs fix — force it with a `Release-As: X.Y.Z`
footer on a commit:

```
docs: fix a broken link in the README

Release-As: 0.1.1
```

Without that footer, release-please opens no release PR for a `docs:`-only
change, and the pipeline looks broken while it's actually behaving exactly
as documented.

A squash merge can silently drop the footer: GitHub's squash commit message
defaults to the PR title plus a summary of commit subjects, and the
`Release-As:` trailer only survives if it was in the PR body or is added by
hand while squashing. release-please reads `main`'s commits, not the PR's —
if the footer didn't make it into the squash commit, it never saw it. After
merging, verify it landed:

```bash
git log -1 --format=%B origin/main | grep Release-As
```

If that comes back empty, supply the footer through the squash commit body
next time (edit the commit message box GitHub shows before confirming the
squash), rather than assuming the PR body was enough.

### Editing the CHANGELOG

The release PR itself is the editing point: release-please generates
CHANGELOG entries from commit subjects, and prose written by hand almost
always reads better than a concatenation of commit messages. Edit the
CHANGELOG in the release PR, before merging it — once the release exists,
editing the CHANGELOG is a separate follow-up PR, not a rewrite of history.

### Preparation (once, from any machine)

1. Enable Settings → Actions → General → "Allow GitHub Actions to create and
   approve pull requests" on this repository. Without it, release-please's
   `GITHUB_TOKEN` cannot open the release PR at all, and the first sign of
   the problem is silence — no PR appears, and nothing in the workflow run
   says why.
2. Create the `npm-publish` GitHub Environment on this repository, **with a
   required reviewer configured on it**. This is a precondition the workflow
   depends on, not something the workflow enforces: if the environment does
   not exist, GitHub auto-creates it unprotected the first time it's
   referenced, and the publish job then runs with no human gate at all. The
   publish job targets this environment so that, once the reviewer rule is
   actually in place, an actual publish waits for a human to approve it even
   though the tag was created automatically by merging the release PR.
3. On npmjs.com, register a trusted publisher for `@yabbadabbadev/pepito`
   with the four exact values: organization `yabbadabbadev`, repository
   `pepito`, workflow filename `release.yml`, environment `npm-publish`.
   All four fields are case-sensitive.

There is no token to create and no secret to store — `gh secret set
NPM_TOKEN` is no longer part of this repo's setup.

### Emergency publish, until OIDC is proven

`workflow_dispatch` and the manual-publish path are gone along with
`publish.yml`: the only documented way to publish is the automated OIDC
flow above. Until one real release has gone through it successfully, there
is a window with no fallback documented anywhere else, so if OIDC is
rejected (misconfigured trusted publisher, npm-side outage, or similar),
publish by hand from a clean checkout:

```bash
git clone https://github.com/yabbadabbadev/pepito.git
cd pepito
npm ci
npx playwright install --with-deps chromium
npm test
npm run typecheck
npm run build
npm login   # now yields a two-hour session, not a stored token
npm publish
```

Delete the checkout afterward — the point of trusted publishing is that
nothing long-lived is left behind, and a manual publish shouldn't
reintroduce that.

### Setup for a fresh clone

The repository-level git identity needs setting explicitly, since the
global git config on a work machine may carry a corporate address that
shouldn't appear in this repo's commit history:

```bash
git config --local user.email alex@yabbadabba.dev
git config --local user.name "Alex Fuentes"
```

### Post-publication

Reference for when there's a real consumer: in `vbmmsw-consumer` (private), the
dependency moves from `file:vendor/...` (the vendored tgz) to the published
registry version (`"@yabbadabbadev/pepito": "^0.1.0"`), and `vendor/` gets
deleted — it stops being needed once the package resolves from npm. That
change happens in `vbmmsw-consumer`, not here; it's documented in this repo
because it's the step that follows this publication.
