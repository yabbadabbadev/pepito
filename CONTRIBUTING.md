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
consuming repo's own vendor directory — for example `../vbmmsw`'s
`experiments/vendor/` or `../vbmmsw-consumer`'s `vendor/` — and reinstall
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

Publishing runs in CI (`.github/workflows/publish.yml`), not by hand: the
workflow repeats the same verification as the PR (tests, typecheck, build)
against the exact ref being published, and adds `--provenance`, which a
local `npm publish` can't give.

### Preparation (once, from any machine)

1. On npmjs.com, create a granular token: **Read and write**, scoped to
   `@yabbadabbadev/pepito` or the whole scope if more packages are coming,
   and type **automation** — that's the type that skips the interactive
   OTP, without which the CI job would sit blocked waiting for a 2FA no one
   can type in.
2. Save it as a secret:

   ```bash
   gh secret set NPM_TOKEN --repo yabbadabbadev/pepito
   ```

   Or as an organization secret from the GitHub UI if it's going to serve
   more packages in the scope, not just this one.

### Publishing

1. Bump the version in `package.json` and add the matching entry to the
   CHANGELOG, through a normal PR — the usual gates (tests, typecheck,
   coverage, lint) run on their own.
2. After the merge, create and push the tag:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   The workflow fires on the tag, repeats the verification (tests,
   typecheck, build), checks that the tag matches the `package.json`
   version, and publishes with `--provenance`.

Alternative without a tag: trigger the `publish` workflow by hand from the
Actions UI (`workflow_dispatch`) — it publishes whatever's in
`package.json` on the ref you choose, without the tag check.

### Manual (alternative without CI)

Only if Actions is unavailable. From a clean checkout:

```bash
npm ci
npm run setup && npm test && npm run typecheck && npm run build
npm pack --dry-run    # audits the tarball: dist/, README.md, CHANGELOG.md, LICENSE, package.json
npm login             # asks for 2FA/OTP if the account has it enabled
npm publish           # public access is already in publishConfig, no need for --access
npm view @yabbadabbadev/pepito   # post-publish check against the registry, not the local copy
```

### Post-publication

Reference for when there's a real consumer: in `vbmmsw-consumer`, the
dependency moves from `file:vendor/...` (the vendored tgz) to the published
registry version (`"@yabbadabbadev/pepito": "^0.1.0"`), and `vendor/` gets
deleted — it stops being needed once the package resolves from npm. That
change happens in `vbmmsw-consumer`, not here; it's documented in this repo
because it's the step that follows this publication.
