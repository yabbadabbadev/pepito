# Decision record: the build stays `tsc`

Date: 2026-08-17. Status: in force. Authority:
`docs/superpowers/specs/2026-08-17-standalone-repo-design.md`, Decision 4.

Load this before proposing SWC, esbuild, tsup, Rollup, Vite library mode or
any other build tool for this package. The current build is one line —
`"build": "tsc -p tsconfig.build.json"` — and it is a decision, not an
absence of one.

## The rationale, verbatim from the spec

> **Build stays `tsc`** — deliberate, recorded in
> `.claude/docs/references/build-tooling.md`: tsc emits the `.d.ts` half of
> the product with the same compiler that type-checks (single source of
> truth); SWC/esbuild are transpile-only (no declarations → second toolchain +
> drift risk) and solve a speed problem a ~15-module lib doesn't have;
> bundlers add tree-shaking risk to a package that registers matchers via
> import side effects; escape hatches if ever needed: tsgo for speed, tsup
> for dual-format JS with tsc kept for types.

Nothing below overrides that paragraph; it only spells out what each clause
means for this repo.

## What each clause means here

**"the `.d.ts` half of the product".** For a package whose public surface is
five custom matchers plus `setupNetwork`, `mount` and the request
descriptors, the types are not a courtesy — they are half of what consumers
install. `package.json` points `types` at `dist/index.d.ts`, and the
`exports` map declares `types` before `default`. `tsconfig.build.json`
extends the same `tsconfig.json` that `npm run typecheck` uses, adding only
`declaration: true`, `rootDir`, `outDir` and `types: []`. So the compiler
that says "this type-checks" is the compiler that writes the `.d.ts`: one
source of truth, no way for the emitted declarations to disagree with the
checked source.

**"transpile-only".** SWC and esbuild do not emit declarations. Adopting
either means keeping `tsc` anyway for `.d.ts`, i.e. two toolchains with two
sets of module-resolution semantics that can drift — for the sake of the
JavaScript half, which is the half nobody has complained about.

**"a speed problem a ~15-module lib doesn't have".** `src/` is 13 modules.
Build time is not on anyone's critical path. Introducing a second toolchain
to optimise it would be paying maintenance for a metric that is not a
problem. If build or type-check time ever does become a real cost, measure it
first and say so with numbers — that is the standing rule in this repo, and
it applies to tooling decisions too.

**"tree-shaking risk ... import side effects".** Importing this package
registers the matchers with `expect.extend`; that registration is an import
side effect, not an exported symbol anyone references. A bundler that
concludes the module is unused will drop it, and the failure mode is not a
build error — it is `expect(...).toHaveBeenRequested is not a function` in a
consumer, far from the change that caused it. Two consequences that must
survive any future build change: **never add `sideEffects: false` to
`package.json`**, and never let a bundler own the emit of this package
without proving the registration survives in an installed consumer.

## Escape hatches, and what would trigger them

Both are named in Decision 4. Neither is in use, and taking one is a decision
to record here, not a silent swap.

**`tsgo` — for speed.** The native port of the TypeScript compiler. It is the
right hatch for the speed axis precisely because it does not split the
toolchain: same compiler semantics, same declaration emit, so the
single-source-of-truth property above is preserved. Trigger: build or
type-check time measured as a real cost. Before adopting it, verify against
the installed version that declaration emit for this project's flags is
supported and that `dist/` output is identical to what `tsc` produces —
verify, do not assume; that is what this repo's rules require of any
dependency.

**`tsup` — for dual-format JS, with `tsc` kept for types.** Today the package
is ESM-only (`"type": "module"`, a single `exports` entry, `main` pointing at
`dist/index.js`). The trigger would be a real consumer that cannot load ESM
and needs a CJS build alongside it. Then tsup emits the JavaScript in both
formats and **`tsc` keeps emitting the declarations** — that split is the
point of the hatch: the tree-shaking and drift risks above are contained to
the JS half, and the types keep coming from the compiler that checks them.
Anything adopted this way must also pass the side-effect check in the
previous section.

## If you change the build

- `npm run build` must keep producing `dist/index.js` and `dist/index.d.ts`
  matching the `exports` map, with no other entry points invented.
- `npm pack --dry-run` must still show only `dist/`, `README.md`,
  `CHANGELOG.md`, `LICENSE` and `package.json`.
- The matcher registration must survive in an installed consumer, not just in
  this repo's own tests, which import from `../src` and therefore cannot catch
  a packaging regression. `npm run pack:local` plus a consumer that vendors
  the tarball is the check that can.
- Update this file in the same PR. A build swap with no decision record here
  is the thing this file exists to prevent.
