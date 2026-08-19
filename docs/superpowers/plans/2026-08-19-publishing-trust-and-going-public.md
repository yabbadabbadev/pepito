# Publishing trust and going public — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expiring npm token with trusted publishing, automate the
CHANGELOG with release-please, and take this repository public behind an
audited gate so provenance attestations start being generated.

**Architecture:** Two phases, deliberately decoupled. Phase 1 restructures the
release pipeline into a single `release.yml` (release-please plus an
OIDC-authenticated publish job) and retires the token — all while the
repository stays private, because OIDC authenticates from private repos and
only provenance needs a public one. Phase 2 audits the repository against
nine dimensions, rewrites commit authorship, publishes that rewritten history
as a **fresh repository**, makes it public, and only then runs the phase 1
cutover once against the final repository.

**Revised 2026-08-19.** Phase 1's code is merged and live; phase 1's cutover
(Task 4) was never executed. Phase 2's original remediation — rewrite `main`,
force-push here, flip this repository public — is invalidated by a measured
finding: GitHub retains `refs/pull/1/head` through `refs/pull/4/head`, they
carry the corporate authorship, and they cannot be rewritten from the client.
See the spec's Findings section and the revised execution order below before
running anything numbered 4 or higher.

**Tech Stack:** GitHub Actions, `googleapis/release-please-action` v5, npm
trusted publishing (OIDC), `gitleaks`, `git-filter-repo`, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-08-18-publishing-trust-and-going-public-design.md`

## Global Constraints

- **English everywhere**: comments, TSDoc, test names, docs, commit messages,
  failure messages. No exceptions.
- **Never commit on `main`**: work branch and PR, always. A `PreToolUse` hook
  blocks it; do not attempt to bypass the hook.
- **GitHub Actions pinned by commit SHA**, with the human-readable version in
  a trailing comment. Existing pins to reuse verbatim:
  `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`,
  `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`,
  `googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0`.
- **Prettier clean**: `npm run format:check` is what CI runs. Every task that
  touches a `.md`, `.json` or `.yml` file ends with it green.
- **ESLint 0 warnings**, strict TS, 90/90 coverage on `src/` — unchanged by
  this plan, which touches no source file, but the gates still run.
- **No brand references** to any real company, anywhere — including in the
  audit report, which must state commands and verdicts rather than reproduce
  the strings it found.
- **Verification is command plus output**, never intention. A step that cannot
  be verified says so.
- **npm floor**: trusted publishing requires npm >= 11.5.1 and Node >= 22.14.0.
  This repo pins Node 24.18.0 in `.nvmrc`.
- **Trusted publisher binding**: organization `yabbadabbadev`, repository
  `pepito`, workflow filename `release.yml`, environment `npm-publish`,
  allowed action `npm publish`. All fields case-sensitive.

## File structure

| File                                          | Responsibility                                           | Task     |
| --------------------------------------------- | -------------------------------------------------------- | -------- |
| `release-please-config.json`                  | How release-please versions this package                 | 1        |
| `.release-please-manifest.json`               | The version release-please believes is current           | 1        |
| `.github/workflows/release.yml`               | The entire release path: release PR, tag, OIDC publish   | 2        |
| `.github/workflows/publish.yml`               | **Deleted** — superseded by `release.yml`                | 2        |
| `docs/trusted-publishing.md`                  | Teaching document: why OIDC removes the secret           | 3        |
| `.claude/docs/references/publishing-trust.md` | Agent-facing findings, labeled                           | 3        |
| `CONTRIBUTING.md`                             | Release runbook rewritten around release-please and OIDC | 3        |
| `CLAUDE.md`, `ROADMAP.md`                     | Status, Releasing, closed and dropped deferrals          | 3, 8     |
| `docs/security-audit-2026-08-19.md`           | Audit report, nine dimensions, redacted                  | 5, 5R, 7 |
| `SECURITY.md`                                 | Vulnerability reporting policy                           | 7        |

A note on testing in this plan: no task touches `src/`, so there is no
red-green cycle to run. The equivalent discipline here is that **every task
states the command that proves it and the output that counts as proof**, and
the two tasks whose deliverable is a live pipeline (4 and 8) are proven by a
real publish, not by reading YAML. The two tasks whose deliverable is a
repository (6 and 6B) are proven by the tree SHA reproducing from a fresh
clone, not by reading the push output.

---

### Task 1: release-please scaffolding

**Files:**

- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`

**Interfaces:**

- Consumes: nothing.
- Produces: the tag format `v0.1.1` (no component prefix, matching the
  existing `v0.1.0`) and the `CHANGELOG.md` path, both relied on by Task 2's
  workflow and by Task 4's trusted publisher configuration.

- [ ] **Step 1: Create the work branch**

```bash
git switch -c chore/release-please-and-trusted-publishing
```

- [ ] **Step 2: Write the release-please config**

`release-please-config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-path": "CHANGELOG.md",
      "include-component-in-tag": false,
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": false
    }
  }
}
```

`include-component-in-tag: false` is what keeps the tag at `v0.1.1` instead of
`pepito-v0.1.1`, so the new tags stay consistent with the published `v0.1.0`.
`bump-minor-pre-major` keeps a `feat:` on a 0.x version at a minor bump rather
than letting it jump to 1.0.0.

- [ ] **Step 3: Seed the manifest with the already-published version**

`.release-please-manifest.json`:

```json
{
  ".": "0.1.0"
}
```

Without this seed release-please has no idea a `0.1.0` exists and would
propose a first release from scratch.

- [ ] **Step 4: Verify both files are valid JSON and Prettier-clean**

```bash
node -e "require('./release-please-config.json'); require('./.release-please-manifest.json'); console.log('both parse')"
npm run format:check
```

Expected: `both parse`, then `All matched files use Prettier code style!`. If
Prettier complains, run `npm run format` and re-check.

- [ ] **Step 5: Commit**

```bash
git add release-please-config.json .release-please-manifest.json
git commit -m "ci: add release-please configuration

Seeds the manifest with the published 0.1.0 so the first run computes the
next version instead of proposing a first release, and pins the tag format
to vX.Y.Z to stay consistent with the existing v0.1.0 tag."
```

---

### Task 2: The release workflow, replacing the publish workflow

**Files:**

- Create: `.github/workflows/release.yml`
- Delete: `.github/workflows/publish.yml`

**Interfaces:**

- Consumes: `release-please-config.json` and `.release-please-manifest.json`
  from Task 1.
- Produces: a workflow whose **filename is `release.yml`** and whose publish
  job runs under the **environment `npm-publish`** — both are the exact
  strings Task 4 enters into the npm trusted publisher form, and a mismatch in
  either is a rejected publish.

- [ ] **Step 1: Write the release workflow**

`.github/workflows/release.yml`:

```yaml
name: release

# Owns the whole release path. release-please keeps a release PR on main
# carrying the version bump and the CHANGELOG entry; merging that PR is what
# creates the tag and triggers the publish job below.
#
# Publishing lives in THIS file on purpose. A tag created with GITHUB_TOKEN
# does not trigger other workflows, so a separate tag-triggered workflow
# would need a Personal Access Token — precisely the long-lived secret this
# pipeline exists in order not to have.
on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      # Wider than this repo's default on purpose, and scoped to this job
      # alone: release-please opens and updates the release PR, and creates
      # the tag and the GitHub release when that PR is merged.
      contents: write
      pull-requests: write
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
    steps:
      - uses: googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0
        id: release

  publish:
    needs: release
    # Only the push that merged the release PR gets this far; every other
    # push to main ends at the release job.
    if: needs.release.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    # Required reviewer on this environment: a publish waits for a human
    # even though the tag was created automatically.
    environment: npm-publish
    permissions:
      contents: read
      # OIDC: the runner asks GitHub for a short-lived identity token that
      # npm validates against the trusted publisher configured on the
      # registry (yabbadabbadev/pepito, release.yml, npm-publish). This
      # replaces NODE_AUTH_TOKEN entirely.
      id-token: write

    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          # The tag release-please just created, not the branch tip: what
          # gets published is exactly what the tag names.
          ref: ${{ needs.release.outputs.tag_name }}

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
          # Still required. Without registry-url, setup-node writes no
          # registry line into the runner's .npmrc, and npm has nowhere to
          # aim the OIDC exchange.
          registry-url: 'https://registry.npmjs.org'

      - name: Install package
        run: npm ci

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: Tests
        run: npm test

      - name: Typecheck
        run: npm run typecheck

      - name: Build
        run: npm run build

      - name: npm CLI guard
        # Trusted publishing needs npm >= 11.5.1. An older npm would try to
        # authenticate with a token that no longer exists and fail with a
        # 401 that says nothing about the real cause, so this meter goes red
        # first, with the reason written out.
        run: |
          MINIMUM=11.5.1
          CURRENT="$(npm --version)"
          if [ "$(printf '%s\n%s\n' "$MINIMUM" "$CURRENT" | sort -V | head -n1)" != "$MINIMUM" ]; then
            echo "npm $CURRENT is older than the $MINIMUM that trusted publishing requires. Raise .nvmrc to a Node whose bundled npm clears it." >&2
            exit 1
          fi
          echo "npm $CURRENT satisfies the $MINIMUM floor"

      - name: Publish to npm
        # No token and no --provenance. Authentication is OIDC against the
        # trusted publisher; provenance is generated automatically by the
        # registry once this repository is public, and the flag is never
        # needed with trusted publishing.
        run: npm publish
```

- [ ] **Step 2: Delete the superseded workflow**

```bash
git rm .github/workflows/publish.yml
```

Everything it did is now owned elsewhere: release-please owns the version, the
CHANGELOG and the tag, so the version guard has nothing left to disagree
about; `workflow_dispatch` disappears with it, which also removes the
validation-mismatch risk npm documents for that trigger.

- [ ] **Step 3: Verify the workflow is valid YAML and Prettier-clean**

```bash
node -e "const y=require('fs').readFileSync('.github/workflows/release.yml','utf8'); console.log('bytes', y.length)"
npm run format:check
```

Then, if `actionlint` is available (`brew install actionlint` — worth the
one-off install, since a syntax error here is only otherwise discovered by
pushing):

```bash
actionlint .github/workflows/release.yml
```

Expected: no output from `actionlint` (it prints only problems), and Prettier
green. If `actionlint` is not installed and you choose not to install it,
record that this check was skipped rather than claiming it passed.

- [ ] **Step 4: Verify the two strings Task 4 depends on**

```bash
ls .github/workflows/          # must show release.yml and NOT publish.yml
grep -n 'environment: npm-publish' .github/workflows/release.yml
```

Expected: `ci.yml release.yml`, and one match for the environment. These are
the exact values that go into the npm form; a typo here surfaces later as an
unexplained rejected publish.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish through release-please and OIDC, drop the token

A tag pushed with GITHUB_TOKEN does not trigger other workflows, so
publishing lives in the same file as release-please rather than behind a
Personal Access Token — the long-lived secret this change removes.

Deletes publish.yml: release-please owns the version, the CHANGELOG and the
tag, so the version guard has nothing to compare and workflow_dispatch, which
npm documents as a validation-mismatch risk, disappears with it."
```

---

### Task 3: Documentation for the new release path

**Files:**

- Create: `docs/trusted-publishing.md`
- Create: `.claude/docs/references/publishing-trust.md`
- Modify: `CONTRIBUTING.md` — the whole "Publishing a version" section
- Modify: `CLAUDE.md` — the "Releasing" section and the Status table row

**Interfaces:**

- Consumes: the workflow and config from Tasks 1 and 2.
- Produces: the runbook Task 4 follows step by step. Task 4 does not invent
  its own steps; it executes what this task writes.

- [ ] **Step 1: Write the teaching document**

`docs/trusted-publishing.md`. This is the document that answers "why is there
no secret any more", written to be reusable on another repository rather than
as a changelog of this one. It must cover, in prose:

- What the old shape was: a granular automation token with 2FA bypass, stored
  as `NPM_TOKEN`, read by the workflow as `NODE_AUTH_TOKEN`. A credential that
  exists for months, works from anywhere, and is as strong as wherever it is
  stored.
- What replaces it: GitHub mints a short-lived OIDC token describing _this_
  workflow run — repository, workflow filename, environment, ref. npm compares
  those claims against the trusted publisher registered for the package and
  accepts the publish only on a match. Nothing long-lived exists to steal, and
  a stolen token is useless outside the run that minted it.
- What npm matches on, and that all four fields are case-sensitive:
  organization, repository, workflow **filename**, optional environment.
- Why the publish step must live in the same workflow file as release-please:
  a tag created with `GITHUB_TOKEN` does not trigger other workflows.
- The two floors: npm >= 11.5.1 and Node >= 22.14.0.
- The provenance distinction, stated plainly because it is the thing everyone
  gets wrong: **OIDC authentication works from a private repository; only
  provenance generation requires a public one.** And with trusted publishing
  provenance is automatic — `--provenance` is never passed.
- What to do on another repository: the four fields, the `id-token: write`
  permission, the absence of a token, and the order that keeps a working
  fallback (configure the publisher, prove one release, then revoke the
  token).

- [ ] **Step 2: Write the agent-facing reference**

`.claude/docs/references/publishing-trust.md`, following the house style of
`measured-foundations.md`: each finding labeled, with its source. Label these
as **documented** (read from npm's and the action's own documentation on
2026-08-18, not measured here):

- OIDC authenticates from private repositories; provenance does not.
  Source: `docs.npmjs.com/trusted-publishers`.
- Provenance is automatic with trusted publishing; `--provenance` is never
  needed. Same source.
- npm >= 11.5.1, Node >= 22.14.0. Same source.
- The trusted publisher matches organization, repository, workflow filename
  and optional environment; all case-sensitive; a configuration created after
  2026-05-20 must select at least one allowed action. Same source.
- `workflow_dispatch` and `workflow_call` are documented causes of validation
  mismatch. Same source.
- Tags created with `GITHUB_TOKEN` do not trigger other workflows, so the
  publish step must share the workflow file with release-please. Source:
  `github.com/googleapis/release-please-action`.
- release-please derives the bump from Conventional Commit types; `docs:`,
  `ci:` and `chore:` bump nothing, so a documentation-only release must be
  forced with a `Release-As:` footer. Same source.

And label this one as **measured (this repo, 2026-08-19)**:

- Classic npm tokens were revoked on 2025-12-09 and granular write tokens with
  2FA bypass are capped at 90 days, which is why the previous mechanism had an
  expiry clock rather than a deprecation warning. Source: the GitHub changelog
  entries linked from the spec.

- [ ] **Step 3: Rewrite the CONTRIBUTING release runbook**

Replace the whole "Publishing a version" section. The new one says:

- Publishing follows from **merging the release PR**. There is no manual tag
  step and no token.
- Commits on `main` must follow Conventional Commits, because that is what
  release-please reads. `feat:` and `fix:` produce releases; `docs:`, `ci:`,
  `chore:` and `refactor:` do not.
- **The documentation-only release**: when a release is wanted and no `feat:`
  or `fix:` is behind it, force it with a `Release-As: X.Y.Z` footer on a
  commit, otherwise release-please opens no release PR and the pipeline looks
  broken while behaving correctly.
- The release PR is the editing point for the CHANGELOG: release-please
  generates entries from commit subjects, and prose written by hand reads
  better. Edit it in the PR, before the release exists.
- Preparation, once: the `npm-publish` environment with a required reviewer,
  and the trusted publisher on npmjs.com with the four exact values.
- Delete the old token preparation steps entirely — `gh secret set NPM_TOKEN`
  is no longer part of this repo's setup.
- Setup for a fresh clone: set the repository-level git identity, since the
  global config on a work machine may carry a corporate address.

```bash
git config --local user.email alex@yabbadabba.dev
git config --local user.name "Alex Fuentes"
```

- [ ] **Step 4: Update CLAUDE.md**

Rewrite the "Releasing" paragraph: release-please plus OIDC, no token, no
`--provenance` ever, provenance arriving automatically once the repo is
public. Update the Status table row to say phase 1 is in flight. Leave
`ROADMAP.md` alone — Task 8 closes it, once the outcome is real rather than
intended.

- [ ] **Step 5: Verify formatting and that the token is gone from the docs**

```bash
npm run format:check
grep -rn 'NPM_TOKEN\|NODE_AUTH_TOKEN\|--provenance' --include='*.md' . | grep -v node_modules | grep -v docs/superpowers
```

Expected: Prettier green, and the only surviving mentions are historical ones
that explicitly describe the old mechanism (in `docs/trusted-publishing.md`
and the agent-facing reference). Any instruction still telling a reader to
create a token is a defect — fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add docs/trusted-publishing.md .claude/docs/references/publishing-trust.md CONTRIBUTING.md CLAUDE.md
git commit -m "docs: document trusted publishing and the release-please runbook

The teaching document explains why no secret remains and what npm matches on,
written to be reusable elsewhere. The runbook loses the token preparation
entirely and gains the two things that will otherwise bite: Conventional
Commits as a requirement, and the Release-As footer for a release with only
documentation behind it."
```

- [ ] **Step 7: Open the PR and let CI run**

```bash
git push -u origin chore/release-please-and-trusted-publishing
gh pr create --fill
gh pr checks --watch
```

Expected: the `ci` workflow green. Note that `release.yml` does **not** run on
a pull request — it is only reachable from a push to `main`, so its first real
exercise is Task 4. Do not read a green PR as evidence that the release
workflow works.

---

## Revised execution order for Tasks 4-8 (2026-08-19)

Task numbers below are unchanged, so that every cross-reference in the spec
and in the ledger still resolves. What changed is the **order they run in**,
and two tasks were added. Run them in exactly this sequence:

| Order | Task                                | What it does                                                                                          | Must not start before              |
| ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1     | **Task 5R** (new)                   | Redoes the under-covered audit dimensions and adds dimension 9                                        | —                                  |
| 2     | **Task 6** (revised destination)    | Rewrites `main`'s authorship locally; pushes nothing                                                  | Task 5R passing on every dimension |
| 3     | **Task 6B** (new)                   | Archives this repository privately; creates the new private `pepito` and pushes the rewritten history | Task 6's tree-SHA check matching   |
| 4     | **Task 7** (revised target)         | The human flips the new repository public; hardening and rulesets                                     | Task 6B verified                   |
| 5     | **Task 4** (resequenced, was first) | The cutover: `npm-publish` environment, npm trusted publisher, the `0.1.1` release                    | Task 7's public flip               |
| 6     | **Task 8** (revised)                | Proves provenance on `0.1.1` and closes the documentation                                             | Task 4's publish being green       |

Why Task 4 moved to the end: the same reason release-please came before the
trusted publisher inside phase 1 — **do not bind the registry to a name that
is about to move.** No trusted publisher exists yet, so there is nothing to
re-point; that risk evaporates rather than being managed.

What this ordering removes: publishing from an already-public repository means
**`0.1.1` carries provenance on its first release.** The separate `0.1.2`
validation release is gone from Task 8 — it would prove nothing `0.1.1` does
not, and npm gets configured once instead of twice.

**Standing constraint, no expiry:** `pepito-archive` must never be made
public. It retains the pull refs carrying a corporate email address and one
blob with an absolute home path; those refs are immutable from the client, so
visibility is the only control that exists. Any later task, audit or
maintainer inheriting this repository is bound by this.

---

### Task 4: The cutover, in the final repository (human-gated)

**RESEQUENCED 2026-08-19: this task now runs LAST but one, after Task 7 has
made the new repository public. Do not start it before that.** Everything it
configures — the environment, the trusted publisher, the release — is
configured **once, in the new repository**, so that no npm-side binding ever
names a repository that is about to move. Its own deliverable is therefore
also the first provenance-carrying release, which is why Task 8 no longer
needs a second one.

**Files:** none. This task changes state on GitHub and npmjs.com, and its
deliverable is a published `0.1.1` with no secret behind it and provenance
attached.

**Interfaces:**

- Consumes: the workflow from Tasks 1–3 (already merged and carried into the
  new repository by Task 6B), the public repository from Task 7, and the exact
  strings `release.yml` and `npm-publish`.
- Produces: a working OIDC publish path **and** the first provenance-carrying
  release, which Task 8 verifies from the registry.

**Stop and ask the human at every step below. Do not perform the npm-side or
visibility-side actions on their behalf.**

- [ ] **Step 0: Ask the human to confirm the Actions PR-creation setting**

Settings → Actions → General → Workflow permissions → "Allow GitHub Actions
to create and approve pull requests" must be enabled. Without it,
release-please's `GITHUB_TOKEN` cannot open the release PR, and the failure
mode is silence: no PR appears anywhere, and nothing in the run log says why.

**Open item, blocking, added 2026-08-19:** this setting also exists one level
up, at `github.com/organizations/yabbadabbadev/settings/actions` → Workflow
permissions → "Allow GitHub Actions to create and approve pull requests", and
it is currently **disabled** there. An organization-level "disabled" wins over
a repository-level "enabled" — the repository API cannot override it, and
attempting the equivalent PATCH on the repository returns HTTP 409 with `The
organization does not allow GitHub Actions to create or approve pull
requests`. Until a human enables it at the organization, release-please
cannot open a release PR regardless of what the repository setting says. Ask
the human to check and, if needed, flip the organization-level setting before
relying on this step's repository-level check.

**Cleared 2026-08-19:** the human enabled it at the organization, and the
repository-level flag then had to be set as well and was. The organization
setting carries over to the new repository; the repository-level one does not,
because the new repository is new. Re-measure it there rather than assuming:

```bash
gh api repos/yabbadabbadev/pepito/actions/permissions/workflow
```

Expected:
`{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}`.

- [ ] **Step 1: DONE ALREADY — the phase 1 code is merged, and its first run
      behaved as designed**

Kept as a record rather than as work. The PR from Task 3 was squash-merged and
the push to `main` ran `release.yml` for the first time: the release job was
green and the publish job was **skipped**, because the squash subject was
`ci:` and nothing was releasable. That skip was the predicted outcome, and it
is the only exercise `release.yml` has had.

Nothing to run here. What carries into the new repository is the merged
workflow, brought over by Task 6B's push of the rewritten `main`. Confirm it
arrived before continuing:

```bash
gh api repos/yabbadabbadev/pepito/contents/.github/workflows/release.yml --jq '.name'
```

Expected: `release.yml`. If it is absent, Task 6B did not complete and this
task must not proceed.

- [ ] **Step 2: Ask the human to create the environment**

GitHub → Settings → Environments → New environment → `npm-publish` → Required
reviewers → add the repository owner. Verify afterwards that the environment
exists **and** that the required-reviewer rule is actually attached to it —
the name existing is not enough, since GitHub auto-creates an environment
unprotected the moment a workflow references one that doesn't exist yet:

```bash
gh api repos/yabbadabbadev/pepito/environments --jq '.environments[].name'
gh api repos/yabbadabbadev/pepito/environments/npm-publish \
  --jq '.protection_rules[] | select(.type == "required_reviewers")'
```

Expected: the first command lists `npm-publish`; the second returns a
non-empty `required_reviewers` protection rule. An empty result from the
second command means the gate does not exist yet, regardless of what the
first command shows.

- [ ] **Step 3: Ask the human to configure the trusted publisher**

npmjs.com → `@yabbadabbadev/pepito` → Settings → Trusted Publisher → GitHub
Actions, with exactly:

| Field                | Value           |
| -------------------- | --------------- |
| Organization or user | `yabbadabbadev` |
| Repository           | `pepito`        |
| Workflow filename    | `release.yml`   |
| Environment          | `npm-publish`   |
| Allowed actions      | `npm publish`   |

All fields are case-sensitive. This cannot be verified from the CLI; the
verification is the publish in Step 5.

- [ ] **Step 4: Force the validation release**

There is no `feat:` or `fix:` on `main`, so release-please will not propose a
release on its own. Ask for one explicitly, on a branch:

```bash
git switch -c chore/release-0.1.1
git commit --allow-empty -m "chore: release 0.1.1

Validates the OIDC publish path end to end: release-please computes the
version and the tag, and the publish job authenticates with no secret.

Release-As: 0.1.1"
git push -u origin chore/release-0.1.1
gh pr create --fill && gh pr merge --squash --delete-branch
```

Expected: release-please opens a release PR titled for `0.1.1`, carrying the
version bump and a CHANGELOG entry.

Because this now runs from a public repository, `0.1.1` is the **first
provenance-carrying release**. There is no second validation release: the
`0.1.2` step that used to live in Task 8 is gone, and Task 8 verifies
provenance on `0.1.1` instead.

- [ ] **Step 5: Edit the CHANGELOG in the release PR, then merge it**

Read what release-please generated. It will be a bullet derived from the
commit subject; replace it with a sentence that says what actually changed for
a consumer of the package — nothing did, in this release, and saying so
plainly is better than a bullet that implies otherwise. Then merge.

**Known gap, not fixed here:** nothing runs `format:check` against the
release PR — `ci.yml` never fires on a PR opened with `GITHUB_TOKEN` (see
Task 7 Step 7), and `format:check` is `prettier --check .`, which does cover
`CHANGELOG.md` and `package.json`. release-please's generated CHANGELOG
entries and version bumps are therefore never Prettier-checked before
landing on `main`. If their formatting drifts from what Prettier would
produce, `main` goes red silently and the failure surfaces on the next
unrelated PR, not on the release PR that introduced the drift. No task in
this plan runs Prettier on the release PR's diff; a later task should either
add that check or accept the risk explicitly.

Merging creates the tag, which pushes to `main`, which runs `release.yml`
again — this time with `release_created` true, so the publish job starts and
pauses on the environment gate.

- [ ] **Step 6: Approve the environment gate**

Ask the human to approve the pending deployment in the Actions UI. Then:

```bash
gh run list --workflow=release.yml --limit 1
gh run view --log | grep -iE 'npm (notice|error)|satisfies the|provenance' | head -30
```

Expected: the npm CLI guard prints that it satisfies the floor, and the
publish succeeds. If npm rejects it, the message names which claim did not
match — compare it against the table in Step 3 rather than guessing.

- [ ] **Step 7: Verify the publish is real, from the registry**

```bash
npm view @yabbadabbadev/pepito version
npm view @yabbadabbadev/pepito dist-tags
```

Expected: `0.1.1`. Check the registry, never the local copy.

- [ ] **Step 8: Only now, retire the token**

Ask the human to revoke the token on npmjs.com → Access Tokens. Then delete
the repository secret and prove it is gone:

```bash
gh secret delete NPM_TOKEN --repo yabbadabbadev/pepito-archive
```

Expected: `NPM_TOKEN` absent. The order matters: until Step 7 proved OIDC
works, the token was the only way to publish.

**Revised 2026-08-19:** the secret exists on the repository that becomes
`pepito-archive`, not on the new one — a new repository starts with no
secrets. Delete it there, and check both:

```bash
gh secret list --repo yabbadabbadev/pepito-archive
gh secret list --repo yabbadabbadev/pepito
```

Expected: `NPM_TOKEN` absent from both. Revoking the token on npmjs.com is
what actually retires the credential; deleting the secret only removes the
copy.

---

### Task 5: The security audit

**EXECUTED 2026-08-19, and its verdict does NOT stand.** The report exists at
`docs/security-audit-2026-08-19.md`, but an adversarial review found coverage
gaps in dimensions 1, 2, 3 and 5, and found that no dimension owned the
surfaces GitHub retains. Task 5R below redoes the affected dimensions and adds
dimension 9. **Task 6 consumes Task 5R's verdict, not this one.** The steps
below are kept unchanged as the record of what was run — the commands are what
Task 5R corrects, and reading them is how the correction is understood.

**Files:**

- Create: `docs/security-audit-2026-08-19.md`

**Interfaces:**

- Consumes: nothing from earlier tasks; this can run in parallel with phase 1.
- Produces: the report whose eighth dimension Task 7 fills in, and the
  go/no-go verdict Task 6 depends on. **If any dimension fails, stop and
  report — do not proceed to Task 6.**

- [ ] **Step 1: Create the work branch and install the scanner**

```bash
git switch -c chore/security-audit
brew install gitleaks
gitleaks version
```

- [ ] **Step 2: Dimension 1 — credentials and secrets, across the whole history**

```bash
gitleaks detect --source . --log-opts="--all" --redact --verbose
```

`--redact` is not optional here: it keeps any finding out of the terminal
transcript and out of the report. Expected: no leaks. A finding must be
resolved before Task 6, not explained away.

- [ ] **Step 3: Dimension 2 — company and brand references**

The corporate domain must never be typed into a tracked file — that is
exactly the defect this audit exists to catch, so the pattern is derived from
the history at run time instead:

```bash
CORP_DOMAINS="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
  | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)"
echo "searching for: $CORP_DOMAINS"   # visible in the run, absent from the repo
git grep -nIiE "${CORP_DOMAINS}|despensa" -- . ; echo "exit=$?"
git log --all --format='%an <%ae>%n%cn <%ce>%n%B' | grep -icE "$CORP_DOMAINS" || echo "0 in history metadata and messages"
```

Expected: no hits in tracked content — the spec's dimension-2 criterion is 0
occurrences, with no carve-out for this plan or its own report (`$CORP_DOMAINS`
is a shell variable computed at run time, never a literal in a tracked file).
The history metadata count will be non-zero — that is the exposure Task 6
removes, and the report records the count, not the address.

- [ ] **Step 4: Dimension 3 — PII**

```bash
git grep -nIoE '/Users/[a-zA-Z0-9._-]+' -- . | sort -u
git grep -nIoE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' -- . | sort -u
```

Expected: no absolute home paths outside the audit's own patterns (Step 8);
the only email addresses are deliberately public ones (the LICENSE holder, the
package author).

- [ ] **Step 5: Dimension 4 — private-repo pointers, inventoried**

```bash
git grep -cIiE 'vbmmsw|despensa' -- . | sort -t: -k2 -rn
```

Expected: an inventory by file. The policy is that these stay, labeled as
private — so the pass criterion is that a reader is told they are private, not
that the count is zero. Add that label where it is missing (`CLAUDE.md`,
`CONTRIBUTING.md`, `.claude/docs/references/measured-foundations.md`).

- [ ] **Step 6: Dimension 5 — infrastructure leakage**

```bash
grep -oE '"resolved": *"https?://[^/"]+' package-lock.json | sort -u
git log --all --name-only --format='%h' -- '*.npmrc' '.npmrc' '*.env*' | head
gh api repos/yabbadabbadev/pepito/actions/secrets --jq '.secrets[].name'
comm -23 <(git log --all --pretty=format: --name-only --diff-filter=A | sort -u | sed '/^$/d') <(git ls-files | sort)
```

Expected: only `registry.npmjs.org`; no `.npmrc` or `.env` ever committed; the
secrets list empty after Task 4; and the files that existed and no longer do
are only the renamed Spanish-named tests.

- [ ] **Step 7: Dimension 6 — what the tarball actually ships**

```bash
npm run build
npm pack --dry-run 2>&1 | tail -30
```

Expected: `dist/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` and
nothing else. Anything unexpected in that list is shipping to every consumer.

- [ ] **Step 8: Dimension 7 — the process documentation, including this report**

```bash
grep -rnIoE '/Users/[a-zA-Z0-9._-]+' docs .claude || echo "no home paths"
CORP_DOMAINS="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
  | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)"
grep -rniE "$CORP_DOMAINS" docs .claude || echo "no corporate domain"
```

Expected: no hit at all. This is the dimension that catches the report
auditing itself: a report reproducing the strings the rewrite removes would
publish exactly what phase 2 exists to remove.

**The self-reference this dimension has to account for:** the plan and the
spec discuss these categories — company domains, home paths, PII — by name,
because they describe what the audit looks for. That is not the same as
containing a literal instance of one: the search pattern is derived at run
time from `git log`, computed into a shell variable, and never typed into a
tracked file. The pass criterion matches the spec exactly: **0 occurrences,
with no exception for this plan, the spec, or the report.** Any hit is a
finding to be removed, not a self-reference to be waved through.

- [ ] **Step 9: Write the report**

`docs/security-audit-2026-08-19.md`, one section per dimension, each carrying:
the command run, the verdict, and the evidence **as a count or a verdict, not
as the matched string**. Include the "measured vs assumed" labels this repo
requires, the date, and an explicit go/no-go line at the top. Dimension 8
stays open with a note that Task 7 fills it in — an honest open row rather
than a checkmark for work not yet done.

- [ ] **Step 10: Verify and commit**

```bash
npm run format:check
CORP_DOMAINS="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
  | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)"
grep -niE "${CORP_DOMAINS}|/Users/" docs/security-audit-2026-08-19.md || echo "report is clean of what it audits"
git add docs/security-audit-2026-08-19.md CLAUDE.md CONTRIBUTING.md .claude/docs/references/measured-foundations.md
git commit -m "docs: security audit ahead of going public

Eight dimensions with binary criteria, evidence recorded as commands and
verdicts rather than as the strings found: a report that restates what it
audits would publish the very thing the history rewrite removes.

Labels the pointers to private repositories as private, which is the agreed
treatment — they carry the traceability of measured evidence and are not
company references."
```

---

### Task 5R: Redo the under-covered audit dimensions, and add dimension 9

**Files:**

- Modify: `docs/security-audit-2026-08-19.md` — dimensions 1, 2, 3 and 5
  re-measured; dimension 9 added; the go/no-go line rewritten

**Interfaces:**

- Consumes: Task 5's report, whose verdicts it replaces where it re-measures.
- Produces: the go/no-go verdict **Task 6 depends on**. **If any dimension
  fails, stop and report — do not proceed to Task 6.**
- Ordering that is easy to get wrong: this task's commit must be **merged to
  `main` before Task 6 runs**. Task 6 rewrites `main` and Task 6B pushes the
  result, so anything not on `main` at that moment never reaches the published
  repository. A corrected audit report that lands afterwards would have to be
  re-committed by hand.

**The general lesson this task exists to encode, stated once and applied in
every command below:**

- `git grep` without a revision argument searches **the index**, not history.
  A criterion phrased over history needs `git grep <rev>`, `--all`, or a
  `git log`-based scan.
- `git log -p` and anything built on it **skip merge commits** unless told
  otherwise (`-m`, `--first-parent`, or `--diff-merges`). `gitleaks
--log-opts=--all` inherits that skipping, so "every commit" is an
  overstatement of what it saw.
- `grep -I` **silently ignores** any file it decides is binary. Silence from
  `grep -I` is not the same as absence.
- An exit status read through a pipe is **the pipe's last command's status**,
  not the interesting command's. A pipeline ending in `sort -u` returns 0
  whatever happened upstream. This is the same failure shape as reading `N`
  from `git log --format=%G?` on a machine without `gpg`, which this project
  already fell for once: a meter that cannot measure must go red, not return a
  convenient answer.

- [ ] **Step 0: Work on a branch**

```bash
git switch chore/security-audit 2>/dev/null || git switch -c chore/audit-redo
git status --short
```

Either branch is fine — `chore/security-audit` already carries the report this
task corrects. What is not fine is `main`: a `PreToolUse` hook blocks it, and
the repository rule stands regardless of the hook.

- [ ] **Step 1: Dimension 1 — re-run the scanner, and state its real scope**

```bash
gitleaks detect --source . --log-opts="--all" --redact --verbose; echo "gitleaks exit=$?"
git rev-list --count --all
git rev-list --count --all --merges
```

Record all three numbers. The report must say that `gitleaks` scanned the
non-merge commits — `--log-opts=--all` inherits `git log`'s merge skipping —
and state how many merge commits were therefore not scanned, rather than
claiming the whole history. Cover the merges explicitly:

```bash
git rev-list --all --merges | while read -r sha; do
  git show --diff-merges=first-parent --format= "$sha"
done | gitleaks detect --pipe --redact --verbose; echo "merge scan exit=$?"
```

If `--pipe` is unavailable in the installed version, say so and record the
dimension as partially covered with the reason. Do not claim coverage the tool
did not give.

- [ ] **Step 2: Dimension 1 — the manual read the method requires**

The spec's method is `gitleaks` **plus a manual read of every tracked file**.
That read was omitted, and the file count cited was stale. Re-establish both:

```bash
git ls-files | wc -l
git ls-files
```

Read every file in that list. Record the real count and the fact that the read
happened, per file category rather than per file. A count that disagrees with
an earlier report is itself a finding worth one line.

- [ ] **Step 3: Dimension 2 — the corporate domain, over history and not the index**

The pattern stays derived at run time and is never typed into a tracked file:

```bash
CORP_DOMAINS="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
  | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)"

# Tracked content, at every revision reachable from any ref -- NOT the index.
git grep -nIiE "$CORP_DOMAINS" $(git rev-list --all) -- .
echo "history content exit=$?"

# The index, separately, so the two are never conflated.
git grep -nIiE "$CORP_DOMAINS" -- .
echo "index exit=$?"

# Authorship and messages.
git log --all --format='%an <%ae>%n%cn <%ce>%n%B' | grep -icE "$CORP_DOMAINS"
```

Note the shape of the first command: `git grep` is given every revision as an
argument, so it searches history rather than the index, and its status is
echoed directly rather than piped into anything that would swallow it. On a
history this small the argument list is safe; if it ever grows past the
shell's limit, loop over `git rev-list --all` and echo each non-zero status
inside the loop. Expected: zero content hits at every revision; a non-zero authorship count, which is the exposure the rewrite
and the new repository remove together.

`grep -I` is in use here deliberately — this repository tracks no binary
files. Confirm that rather than assuming it:

```bash
git ls-files | while read -r f; do
  git check-attr -a -- "$f" | grep -qi 'binary' && echo "binary: $f"
done; echo "binary check done"
file --mime $(git ls-files) | grep -v 'text/' || echo "all tracked files are text"
```

- [ ] **Step 4: Dimension 3 — PII, over history**

```bash
git grep -nIoE '/Users/[a-zA-Z0-9._-]+' $(git rev-list --all) -- .
echo "home path exit=$?"
ADDRESSES="$(mktemp)"
git grep -hIoE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' $(git rev-list --all) -- . > "$ADDRESSES"
echo "email grep exit=$?"
sort -u "$ADDRESSES"; rm -f "$ADDRESSES"
```

Expected: the known home-path blob in PR #4's history and nothing on `main` —
which the spec records as measured, with `git merge-base --is-ancestor`
disproving the claim that it was reachable from `main`. Every email address
either the package author's or one of GitHub's generic addresses. Report the
distinction between "in the tree" and "in a retained pull ref" explicitly:
they have different remediations, and dimension 9 owns the second.

- [ ] **Step 5: Dimension 5 — add the two omitted pieces of evidence**

The original run recorded the lockfile registries, the absence of `.npmrc` and
`.env`, and the secret names. It omitted workflow permissions and `.claude/`.
Add both:

```bash
gh api repos/yabbadabbadev/pepito/actions/permissions/workflow
grep -rn 'permissions:' -A4 .github/workflows/
git ls-files .claude
git grep -nIiE 'token|secret|password|key' -- .claude
```

Expected: default workflow permissions read-only with the PR-creation flag as
measured; every workflow's `permissions:` block scoped per job, with
`id-token: write` on the publish job alone; nothing in `.claude/` that names
a credential value rather than a credential's name.

- [ ] **Step 6: Dimension 9 — the surfaces GitHub retains**

No earlier dimension owned any of these. This one does, and it is the reason
the whole phase-2 approach changed.

```bash
git ls-remote origin 'refs/pull/*'
git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'
for r in $(git for-each-ref --format='%(refname)' refs/remotes/pr); do
  echo "== $r"; git log --format='%h %ae' "$r" | sort -u -k2
done
gh pr list --state all --json number,title,body --jq '.[] | "\(.number) \(.title)"'
gh issue list --state all --json number,title --jq '.[] | "\(.number) \(.title)"'
gh run list --limit 50 --json databaseId,name,conclusion --jq '.[] | "\(.databaseId) \(.name) \(.conclusion)"'
gh api repos/yabbadabbadev/pepito --jq '{description, topics, forks_count}'
git tag -l | while read -r t; do echo "== $t"; git cat-file -p "$t" | head -5; done
npm view @yabbadabbadev/pepito@0.1.0 --json | node -e "const p=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(p.dist)"
```

Expected, per the reviewer who found this gap and checked most of it: PR
titles and bodies, issues, run logs, description, topics, tags and the
published `0.1.0` tarball all clean; the pull refs **not** clean, carrying up
to 15 commits authored with a corporate domain plus one blob with an absolute
home path. Record that the refs are immutable from the client:

```bash
git push --force origin refs/remotes/pr/1:refs/pull/1/head
```

Expected: rejected with `deny updating a hidden ref`. That rejection is the
evidence for the new-repository decision, so it belongs in the report rather
than only in a ledger.

- [ ] **Step 7: Rewrite the report**

`docs/security-audit-2026-08-19.md` keeps its filename and its date — it is
the audit of this repository, corrected, not a second audit. Per dimension:
the command actually run, its real output, and a verdict. The re-measured
dimensions replace their earlier verdicts outright; a superseded verdict is
marked superseded with the reason, never silently overwritten. Add dimension 9
with its own section. Rewrite the go/no-go line: it can no longer read GO for
"make this repository public", because that is not what happens any more — the
verdict is GO for **publishing the rewritten history as a new repository**,
with `pepito-archive` staying private permanently.

Evidence stays redacted, as before: the count and the verdict, never the
matched string. Dimension 9 in particular must describe the corporate address
rather than reproduce it.

- [ ] **Step 8: Verify and commit**

```bash
npm run format:check
CORP_DOMAINS="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
  | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)"
grep -niE "${CORP_DOMAINS}|/Users/" docs/security-audit-2026-08-19.md; echo "grep exit=$?"
```

Expected: Prettier green, and `grep exit=1` — no match. Note the `echo` of the
status directly after `grep`, with nothing piped in between: that is the point
of this task.

```bash
git add docs/security-audit-2026-08-19.md
git commit -m "docs: redo the under-covered audit dimensions, add dimension 9

Dimensions 2 and 3 searched the index with a revision-less git grep while
their criteria demand history; dimension 1 omitted the manual read of every
tracked file and overstated its scope, since gitleaks inherits git log's
skipping of merge commits; dimension 5 omitted workflow permissions and
.claude/; and several exit statuses were read through pipelines ending in
sort -u, which always return 0.

Dimension 9 covers the surfaces GitHub retains -- pull refs, PR titles and
bodies, issues, run logs, description and topics, tags, forks and the
published tarball -- which no dimension owned. It is what found the pull-ref
exposure that changed the remediation."
```

---

### Task 6: Rewrite commit authorship (locally; nothing is pushed)

**REVISED 2026-08-19 — destination only.** The rewrite, its mailmap, its
tree-SHA invariant and its abort condition are unchanged. What changed is where
the result goes: it is **no longer force-pushed to this repository**, because
GitHub would keep serving the pre-rewrite commits through `refs/pull/*`. This
task now ends with a verified mirror on disk and pushes nothing. Task 6B
publishes it, to a new repository.

**Files:** none in the working tree. This task rewrites git history inside a
scratch mirror.

**Interfaces:**

- Consumes: a passing **Task 5R**. **Do not start if any dimension failed.**
- Produces: a verified rewritten mirror in a scratch directory, which Task 6B
  pushes. Task 6B must not start before this task's tree-SHA check matches.

**This task destroys nothing reachable from the remote and pushes nothing. The
signature-loss step below is still human-gated, because the loss becomes real
the moment Task 6B pushes.**

- [ ] **Step 1: Ask the human to verify the email on GitHub — blocking**

`github.com/settings/emails` → add `alex@yabbadabba.dev` → verify by clicking
the emailed link. Without this, the 18 rewritten commits show a generic avatar
and no link to the profile. It is recoverable — GitHub re-attributes
retroactively once verified — but it is cheaper to do first.

Do not continue until the human confirms the address shows as verified.

- [ ] **Step 2: Install the tool and record the "before" fingerprint**

```bash
brew install git-filter-repo
cd ~/dummies/pepito
git rev-parse HEAD^{tree}
git rev-list --count --all
```

Write both values down. The tree SHA is the control for Step 6.

- [ ] **Step 3: Work on a mirror, never on the working clone**

```bash
SCRATCH="$(mktemp -d)"
git clone --mirror git@github.com:yabbadabbadev/pepito.git "$SCRATCH/pepito.git"
cd "$SCRATCH/pepito.git"
```

- [ ] **Step 4: Ask the human to accept the loss of signed-merge badges — blocking**

`git filter-repo` strips the `gpgsig` header from every commit it rewrites.
Three commits on `main` carry one: the PR #1, #2 and #3 merge commits, signed
by GitHub's own web-flow key when the merge happened through the GitHub UI.
The tree-SHA check in Step 6 proves no content changes, but it says nothing
about this — signatures are metadata, not tree content, and their loss is
permanent. `git log --format=%G?` is **not** a usable meter for checking this
on this machine: `gpg` is not installed here, so git cannot attempt
verification at all and prints `N` for every commit regardless of whether it
is signed, alongside `error: cannot run gpg: No such file or directory`. Run
this instead, which checks for the `gpgsig` header directly rather than
asking git to verify anything:

```bash
git rev-list --all | while read -r sha; do
  git cat-file commit "$sha" | grep -q '^gpgsig' && echo "$sha"
done
```

Expected: three commits, all merge commits on `main`. Show the human this
list before continuing. After the rewrite, these three will show as
unverified on GitHub — the badge cannot be regenerated afterward.

Do not continue until the human explicitly accepts this loss.

- [ ] **Step 5: Rewrite authorship**

The mailmap is **derived from the history, not typed out**: writing the
corporate address into a tracked plan would put it back in the repository that
this task exists to clean, and audit dimension 7 would rightly fail this file.

```bash
git log --all --format='%ae%n%ce' | sort -u | grep -v '^noreply@github.com$' \
  | while read -r address; do
      printf 'Alex Fuentes <alex@yabbadabba.dev> <%s>\n' "$address"
    done > mailmap
cat mailmap    # read it before applying: this is the last review point
git filter-repo --mailmap mailmap --force
```

Every personal identity collapses into one, so the public history shows a
single author. `noreply@github.com` is excluded on purpose: it is GitHub's own
committer on the merge commits, not a personal address, and rewriting it would
misattribute GitHub's merges to a person.

- [ ] **Step 6: The check that makes this safe**

```bash
git rev-parse HEAD^{tree}          # must equal the value from Step 2
git log --format='%an <%ae>' | sort -u
git log --format='%cn <%ce>' | sort -u
git rev-list --count --all
git tag -l
```

Expected: **the tree SHA is identical to Step 2's**, proving only authorship
metadata changed and not one byte of content; a single author identity; the
same commit count; and both tags present. Committer identity on the merge
commits may remain `GitHub <noreply@github.com>`, which is correct — that is
GitHub's own merge, not a personal address.

**If the tree SHA differs, stop. Push nothing.** Report the mismatch: it means
the rewrite altered content, which is not what was authorized.

- [ ] **Step 7 (SUPERSEDED 2026-08-19 — do not run): force-push to this
      repository**

```bash
# SUPERSEDED -- do not run. Kept for context; see Task 6B.
git push --force origin 'refs/heads/main:refs/heads/main'
git push --force --tags origin
```

This is the step the pull-ref finding invalidates. It would succeed, `main`
would become clean, and GitHub would go on serving the pre-rewrite commits
through `refs/pull/1/head` .. `refs/pull/4/head`, which are public on a public
repository and cannot be updated from the client — measured, with
`deny updating a hidden ref`. Task 6B replaces it.

- [ ] **Step 8 (SUPERSEDED 2026-08-19 — do not run): delete the stale remote
      branches**

Nothing needs deleting: Task 6B pushes `refs/heads/main` and the tags and
nothing else, so `docs/worktree-warning` and `publish-without-provenance`
simply never exist on the new repository. Verifying their absence there is
cheaper and stronger than deleting them here.

- [ ] **Step 9: Record the scratch mirror's location and stop**

Do not touch the working clone yet. It is still a valid clone of the old
remote, which stays valid until Task 6B repoints it, and moving it now would
leave the machine with no working copy while the new repository does not exist.

```bash
pwd            # the scratch mirror -- write this path down for Task 6B
git rev-parse HEAD
git tag -l
```

Expected: the mirror path, the rewritten `HEAD` SHA and both tags. Task 6B
consumes exactly these. **Do not delete the scratch directory** — it is the
only copy of the rewritten history until Task 6B has pushed it.

---

### Task 6B: Archive this repository, publish the rewritten history as a new one

**Files:** none. This task changes state on GitHub only.

**Interfaces:**

- Consumes: Task 6's verified scratch mirror. **Do not start before Task 6's
  tree-SHA check matched.** If it did not match, Task 6 aborted and there is
  nothing to push.
- Produces: `yabbadabbadev/pepito-archive` (private, permanently) and a new
  **private** `yabbadabbadev/pepito` carrying only the rewritten `main` and its
  tags. Task 7 flips the new one public and must not start before this task's
  verification passes.

**Every step that changes GitHub state is human-gated. The agent does not
rename, create or push on the human's behalf.**

- [ ] **Step 1: Confirm the standing constraint out loud, before anything moves**

`pepito-archive` must never be made public. It retains `refs/pull/1/head`
through `refs/pull/4/head`, which carry commits authored with a corporate email
address and one blob with an absolute home path; those refs are immutable from
the client, so visibility is the only control that exists. State this to the
human and get an explicit acknowledgement before the rename. It is not a
passing remark: it is the whole reason the archive stays where it is instead of
being deleted, and the reason deleting it is also not proposed — the `v0.1.0`
tag and the migration's evidence trail live there.

- [ ] **Step 2: Ask the human to rename this repository — human-gated**

GitHub → Settings → General → Repository name → `pepito-archive` → Rename.

```bash
gh api repos/yabbadabbadev/pepito-archive --jq '.name, .visibility'
```

Expected: `pepito-archive` and `private`. If `.visibility` is anything but
`private`, stop: the constraint in Step 1 is already violated and nothing
further should happen until it is fixed.

The rename leaves GitHub's redirects in place from the old name — documented,
and deliberately broken by Step 3, because `yabbadabbadev/pepito` must resolve
to the new public repository rather than redirect to the archive. That is
GitHub's own documented consequence of reusing a name, and it is the outcome
wanted here.

- [ ] **Step 3: Ask the human to create the new repository — private — human-gated**

Create `yabbadabbadev/pepito`, **visibility private**, with no README, no
`.gitignore` and no license — an empty repository, so the first push is the
rewritten history and nothing else.

```bash
gh api repos/yabbadabbadev/pepito --jq '.name, .visibility, .size'
git ls-remote https://github.com/yabbadabbadev/pepito
```

Expected: `pepito`, `private`, size `0`, and `git ls-remote` returning nothing
at all. A non-empty listing means the repository was initialized with content;
ask for it to be recreated empty rather than force-pushing over it.

Private first is deliberate: **verification happens before exposure.** Every
check in Step 5 reads a repository nobody outside can see yet, and the new
repository's pull refs start empty.

- [ ] **Step 4: Push only `main` and the tags, from the scratch mirror**

```bash
cd <the scratch mirror path recorded in Task 6 Step 9>
git remote add new git@github.com:yabbadabbadev/pepito.git
git push new 'refs/heads/main:refs/heads/main'
git push new --tags
```

Note what is **not** pushed: `git push --mirror` would copy every ref the
mirror holds, including any `refs/pull/*` it fetched, which would defeat the
entire point of this task. Push the two refspecs above and nothing else.

- [ ] **Step 5: Verify the new repository, while it is still private**

```bash
git ls-remote new
gh api repos/yabbadabbadev/pepito/branches --jq '.[].name'
git ls-remote new 'refs/pull/*'; echo "pull refs exit=$?"
```

Expected: only `refs/heads/main` and `refs/tags/v0.1.0` (plus `v0.1.1` if it
exists by then); `main` the only branch; **no pull refs at all**. Then, from a
fresh clone rather than from the mirror, because a mirror can flatter itself:

```bash
CHECK="$(mktemp -d)"
git clone git@github.com:yabbadabbadev/pepito.git "$CHECK/pepito"
cd "$CHECK/pepito"
git rev-parse HEAD^{tree}          # must equal Task 6 Step 2's value
git rev-list --count --all
git log --format='%an <%ae>' | sort -u
git tag -l
git grep -nIiE "$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
  | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)" \
  $(git rev-list --all) -- .; echo "corporate domain exit=$?"
```

Expected: **the tree SHA identical to Task 6 Step 2's**, the same commit count,
a single author identity, both tags, and `corporate domain exit=1` — meaning no
match, with the status read directly and not through a pipe. Note that on a
clean history the derived pattern may come out empty; if it does, say so and
record the dimension as satisfied by the authorship listing instead of by an
empty-pattern grep, which would match everything.

**If the tree SHA differs from Task 6 Step 2's, stop. Report it.** The content
that landed is not the content that was authorized.

- [ ] **Step 6: Re-run audit dimension 9 against the new repository**

```bash
gh api repos/yabbadabbadev/pepito --jq '{description, topics, forks_count}'
gh pr list --repo yabbadabbadev/pepito --state all --json number --jq 'length'
gh issue list --repo yabbadabbadev/pepito --state all --json number --jq 'length'
gh run list --repo yabbadabbadev/pepito --limit 50 --json databaseId --jq 'length'
```

Expected: no pull requests, no issues, no runs, no forks — a repository whose
retained surfaces are empty because nothing has happened in it yet. This is
the evidence that the move achieved what the force-push could not, and it
belongs in the audit report.

- [ ] **Step 7: Repoint the local working copy**

Every local commit now has a different SHA, and the old remote is a different
repository. Move the old clone aside rather than deleting it, clone the new
one, and restore the repository-level identity — a fresh clone inherits the
global config, which is what put a corporate address in the history in the
first place.

```bash
cd ~/dummies
mv pepito pepito.pre-rewrite
git clone git@github.com:yabbadabbadev/pepito.git
cd pepito
git config --local user.email alex@yabbadabba.dev
git config --local user.name "Alex Fuentes"
git log --format='%an <%ae>' | sort -u
git var GIT_AUTHOR_IDENT
git remote -v
```

Expected: one identity in the log, the new identity active, and `origin`
pointing at the new repository. Keep `pepito.pre-rewrite` until Task 8 is done,
then delete it — it is the last local copy of the old history.

---

### Task 7: Go public, and harden

**REVISED 2026-08-19 — target only.** Everything below now applies to the
**new** repository created in Task 6B, never to `pepito-archive`. **Do not
start before Task 6B's Step 5 and Step 6 verifications passed.**

**Files:**

- Create: `SECURITY.md`
- Modify: `docs/security-audit-2026-08-19.md` — dimension 8

**Interfaces:**

- Consumes: a verified Task 6B.
- Produces: a public repository, which is the precondition for **Task 4** (the
  cutover) and, through it, for Task 8's provenance. Task 4 must not start
  before Step 3 below confirms `public`.

- [ ] **Step 1: Write SECURITY.md on a work branch**

```bash
git switch -c chore/public-hardening
```

`SECURITY.md` states which versions are supported, that reports go through
GitHub's private vulnerability reporting rather than a public issue, and what
a reporter can expect. Keep it short and true — do not promise a response
time nobody has committed to.

- [ ] **Step 2: Merge it before flipping visibility**

```bash
npm run format:check
git add SECURITY.md
git commit -m "docs: add a security policy ahead of going public"
git push -u origin chore/public-hardening
gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch
```

- [ ] **Step 3: Ask the human to make the NEW repository public — irreversible**

GitHub → Settings → General → Danger Zone → Change visibility → Public, on
`yabbadabbadev/pepito`. **Never on `pepito-archive`, which stays private
permanently.**

Confirm the preconditions out loud before asking: Task 5R passed on every
dimension, Task 6's tree SHA matched, Task 6B's fresh-clone check reproduced
that same tree SHA, the new repository has no pull refs and no stale branches,
and the archive reads `private`. Re-read that last one immediately before
asking — it is the one that cannot be undone in the wrong direction:

```bash
gh api repos/yabbadabbadev/pepito-archive --jq '.visibility'
```

Expected: `private`. Then:

```bash
gh api repos/yabbadabbadev/pepito --jq '.visibility, .default_branch'
```

Expected: `public`.

- [ ] **Step 4: Enable secret scanning and push protection**

```bash
gh api -X PATCH repos/yabbadabbadev/pepito \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
gh api repos/yabbadabbadev/pepito --jq '.security_and_analysis'
```

Expected: both enabled. These are free on public repositories and were
unavailable before.

- [ ] **Step 5: Restrict what workflows can do, especially from forks**

```bash
gh api -X PUT repos/yabbadabbadev/pepito/actions/permissions/workflow \
  -F default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false
gh api repos/yabbadabbadev/pepito/actions/permissions/workflow
```

Expected: `read`. `release.yml` is unaffected: it grants `contents: write` at
the job level, which this default does not override.

Ask the human to set Settings → Actions → General → Fork pull request
workflows → require approval for all outside collaborators. Record as an
audited fact that `ci.yml` triggers on `pull_request`, not
`pull_request_target`, so a fork's run never sees repository secrets.

- [ ] **Step 6: Enable Dependabot and private vulnerability reporting**

```bash
gh api -X PUT repos/yabbadabbadev/pepito/vulnerability-alerts
gh api -X PUT repos/yabbadabbadev/pepito/private-vulnerability-reporting
gh api repos/yabbadabbadev/pepito/vulnerability-alerts && echo "alerts on"
```

- [ ] **Step 7 (SUPERSEDED — see Steps 7a–7g below): Protect main — after the
      history has landed, never before**

The classic branch-protection call originally specified here is superseded by
repository rulesets (Steps 7a–7g). Rulesets are the modern mechanism, support
an explicit bypass list rather than an all-or-nothing `enforce_admins` flag,
and — unlike classic protection's practical expectation of a public
repository's review culture — are equally configurable while this repository
is still private. The classic call is kept below, struck through in spirit
but not in text, because it is what surfaced the trap that Step 7a exists to
avoid; do not run it.

```bash
# SUPERSEDED — do not run. Kept for context; see Steps 7a-7g.
gh api -X PUT repos/yabbadabbadev/pepito/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["quality"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
gh api repos/yabbadabbadev/pepito/branches/main/protection --jq '.allow_force_pushes.enabled, .required_status_checks.contexts'
```

The consequence that would have followed from running it is exactly what
Step 7a exists to avoid: requiring the `quality` check makes release-please's
own release PRs permanently unmergeable, because `ci.yml` runs
`on: pull_request` and a PR opened with the default `GITHUB_TOKEN` — which is
how `release-please-action` opens the release PR — does not trigger other
workflows. `quality` would never run on a release PR, the required check
would never report success, and the only escape would be an admin bypass
nobody planned for. See `docs/superpowers/specs/2026-08-18-publishing-trust-and-going-public-design.md`
for the full design; the steps below are its implementation.

- [ ] **Step 7a: Prerequisite — give `ci.yml` a `push` trigger for
      release-please's branches, before creating any ruleset that requires
      `quality`**

This step touches `.github/workflows/ci.yml` and is scoped to whichever task
implements this design — it is recorded here as a hard ordering constraint,
not performed by this plan-annotation pass. It lands as an ordinary PR on the
new repository, which means it also must not run before Task 6B has pushed
that repository's `main`. Add a `push` trigger alongside
the existing `pull_request` trigger, scoped to the branch pattern
release-please uses:

```yaml
on:
  pull_request:
  push:
    branches: ['release-please--**']
```

The reasoning: a required status check is only ever satisfied by a check run
reported against the same head SHA the ruleset evaluates. `ci.yml` triggering
`on: pull_request` means a PR opened by `GITHUB_TOKEN` — which is how
release-please opens its release PR — never produces that check run, because
GitHub does not trigger `pull_request`-scoped workflows for PRs opened by the
default token. Adding the `push` trigger for `release-please--**` produces
the check run from the push that creates or updates that branch, on the same
SHA the release PR later carries, so the requirement is satisfied
legitimately rather than through a bypass. **This must land before the
ruleset requiring `quality` (Step 7c) is created** — creating the ruleset
first leaves the very first release PR after that point permanently stuck,
with no planned way out.

- [ ] **Step 7b: Ask the human to decide on required approvals — a real
      trade-off with one maintainer, not a formality**

Requiring pull request approvals is attractive because release PRs are
authored by `github-actions[bot]`, and the human maintainer can approve
those. But GitHub does not allow a user to approve their own pull request, so
any PR the maintainer opens personally would be blocked by the same rule
unless the maintainer is also on the ruleset's bypass list — at which point
the required-approval rule is a formality for that person's own work rather
than an actual control. Two honest resolutions exist, and the choice between
them belongs to the human, not to whoever implements this:

- Accept the bypass: put the maintainer on the bypass list, require
  approvals for everyone else (in practice, for release PRs, which the
  maintainer can approve), and accept that the rule does not gate the
  maintainer's own PRs.
- Wait for a second maintainer before turning on required approvals at all,
  so the rule has teeth for every author including the current one.

Do not pick one on the implementer's behalf; ask.

- [ ] **Step 7c: What was asked for that already comes free — reviewers
      restricted to organization members**

No separate rule is needed for this. GitHub only counts an approving review
toward a required-approvals rule when it comes from a user with write access
to the repository, so a review from an outside contributor never satisfies
the rule regardless of ruleset configuration. If finer-grained control is
wanted later — restricting approval authority to specific people or teams
rather than "anyone with write access" — the mechanism is a `CODEOWNERS`
file plus the ruleset's "Require review from Code Owners" option. Note it as
available, not as needed now: this repository has one maintainer, and
`CODEOWNERS` has nothing to route to yet.

- [ ] **Step 7d: What must NOT be required — signed commits**

Do not add a signed-commits rule to the `main` ruleset. The maintainer does
not sign commits locally, so the rule would block the maintainer's own
pushes, not just an attacker's. This is also where the measured finding
recorded in this plan's Task 6 Step 4 and in the spec's Findings section
becomes directly relevant: `git filter-repo` strips the `gpgsig` header from
every commit it rewrites, and of this repository's commits, exactly three
carry a signature at all — the PR #1, #2 and #3 merge commits, signed by
GitHub's own web-flow key when the merge happened through the GitHub UI, not
by the maintainer. A signed-commits requirement would not reflect anything
this repository's actual commit flow produces.

- [ ] **Step 7e: Create the branch ruleset on `main`**

```bash
gh api -X POST repos/yabbadabbadev/pepito/rulesets \
  --input - <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [{ "context": "quality" }]
      }
    }
  ]
}
JSON
```

Rules beyond what was originally asked for, each with its own reason: force
pushes and deletions blocked on `main` (a stale-but-common gap that classic
protection also covered, kept here); conversation resolution required
(`required_review_thread_resolution`, so an unresolved review comment cannot
be squash-merged past); linear history required (`required_linear_history`,
which matches the squash-merge workflow this repository already uses for
every PR in this plan — it does not change behavior, it makes the existing
behavior enforced). `required_approving_review_count` and the trade-off it
carries is Step 7b's decision, recorded here as `1`; adjust to `0` if the
human chose to wait for a second maintainer instead of accepting the bypass.

Whichever count is chosen, list the maintainer as a bypass actor at ruleset
creation time if Step 7b's answer was "accept the bypass" — a bypass actor is
set via the `bypass_actors` field on the same payload, naming the
maintainer's GitHub user ID with `bypass_mode: "always"`.

- [ ] **Step 7f: Create a separate tag ruleset protecting `v*`**

```bash
gh api -X POST repos/yabbadabbadev/pepito/rulesets \
  --input - <<'JSON'
{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [{ "type": "deletion" }, { "type": "update" }]
}
JSON
```

This matters specifically because of the pipeline built in this plan:
release-please now creates tags automatically on every merged release PR,
with no manual step and no second thought. A protected tag ruleset is what
stops a tag for a version already published to npm from being deleted and
re-created pointing at different content — a mistake that is easy to make by
hand and is exactly the kind of thing automation makes easy to make by
accident too.

- [ ] **Step 7g: After going public, restrict who can bypass the rulesets**

Once the repository is public (Task 7 Step 3), revisit both rulesets'
`bypass_actors` and narrow them to the smallest set that still lets releases
ship — in practice, the repository owner alone. The rulesets' rules
themselves do not need to change at this point; what changes is exposure,
because a public repository draws more attempts to find whatever the bypass
list allows through. **The bypass list is what should be audited
periodically going forward, not the rules** — the rules are static policy,
the bypass list is the part that can silently grow.

- [ ] **Step 8: Close dimensions 8 and 9 in the report, and commit**

Fill in dimension 8 with the `gh api` output for each control — the verdict per
control, not a checkmark. Add to dimension 9 the re-run Task 6B Step 6
performed against the new repository: no pull refs, no pull requests, no
issues, no runs, no forks. That empty result is the evidence that moving
repositories achieved what a force-push could not, and it is the only place in
the report where dimension 9 comes back clean. Then:

```bash
git switch -c chore/close-audit
npm run format:check
git add docs/security-audit-2026-08-19.md
git commit -m "docs: close the post-public hardening dimension of the audit

Records each control with the gh api output that proves it, including the
audited fact that ci.yml runs on pull_request rather than
pull_request_target, so a fork's run never sees repository secrets."
git push -u origin chore/close-audit
gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch
```

---

### Task 8: Prove provenance, and close the documentation

**REVISED 2026-08-19.** Its own release is gone. Task 4 now runs from an
already-public repository, so `0.1.1` is the first provenance-carrying release
and this task verifies that release rather than forcing a second one. **Do not
start before Task 4's publish is green.**

**Files:**

- Modify: `ROADMAP.md`, `CLAUDE.md`

**Interfaces:**

- Consumes: the public repository from Task 7 and the `0.1.1` publish from
  Task 4.
- Produces: documentation that describes what happened rather than what was
  planned.

- [ ] **Step 1 (REMOVED 2026-08-19): the `0.1.2` validation release**

Gone, and worth saying why rather than deleting silently. It existed because
the original order published `0.1.1` from a **private** repository, where the
registry generates no provenance, so a second release was needed once the
repository turned public. Under the revised order the repository is already
public when Task 4 publishes, `0.1.1` carries provenance on its first release,
and a `0.1.2` would prove nothing `0.1.1` does not — while costing a second
npm configuration pass and a version number spent on nothing.

Nothing to run in this step.

- [ ] **Step 2: Verify provenance on `0.1.1` — from the registry, not from the run log**

```bash
npm view @yabbadabbadev/pepito version
npm view @yabbadabbadev/pepito --json | node -e "const p=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('dist keys:', Object.keys(p.dist))"
npm audit signatures
```

Expected: `0.1.1`, an attestations entry in `dist`, and `npm audit signatures`
reporting verified signatures and attestations. If provenance is absent, do
not paper over it: the likely causes are the repository not actually being
public at publish time or the package being published from a ref the
attestation cannot resolve, and both are diagnosable from the run log. Note
that `0.1.0`, published from the old repository, carries no provenance and
never will — that is expected, not a finding.

- [ ] **Step 3: Confirm no `--provenance` flag was ever added**

```bash
grep -rn 'provenance' .github/workflows/ || echo "no provenance flag anywhere, as intended"
```

Expected: no match. Provenance came from the registry, not from a flag. This
is the check that keeps the ROADMAP's old promise from quietly creeping back
in.

- [ ] **Step 4: Close the ROADMAP**

Rewrite three rows, and add the repository move as a fourth entry — it is the
kind of thing a reader of the ROADMAP will otherwise discover from a broken
link: mark "Trusted publishing (OIDC, no token)" as done with
the date; mark "Provenance publishing" as done, and correct the reasoning
recorded there — the entry promised to re-enable a flag that turned out never
to be needed; drop "remove `workflow_dispatch`" as superseded, since the
trigger left with `publish.yml`. Add nothing that was not actually deferred.

- [ ] **Step 5: Update the CLAUDE.md status and Releasing sections**

The Status table gets a row for this migration: what was executed, on what
date, with the verification — including that the published history lives in a
new repository, that `pepito-archive` is private permanently and must stay
that way, and that `0.1.1` is the first release carrying provenance. "Releasing" describes release-please plus OIDC
plus automatic provenance, with no token and no flag. Point to
`docs/trusted-publishing.md` for the reasoning and to
`.claude/docs/references/publishing-trust.md` for the labeled findings.

- [ ] **Step 6: Verify and merge**

```bash
npm run format:check
git switch -c docs/close-publishing-migration
git add ROADMAP.md CLAUDE.md
git commit -m "docs: close the publishing migration

Trusted publishing and provenance are done, and the ROADMAP's reasoning for
the latter was wrong in an instructive way: it promised to re-enable a
--provenance flag that trusted publishing never needs. workflow_dispatch is
dropped rather than deferred, since it left with publish.yml."
git push -u origin docs/close-publishing-migration
gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch
```

- [ ] **Step 7: Delete the pre-rewrite clone and the scratch mirror**

```bash
rm -rf ~/dummies/pepito.pre-rewrite
```

Also delete the Task 6 scratch mirror, whose path was recorded in Task 6
Step 9. Both are local copies of the pre-rewrite history. Note the limit of
this step honestly: it removes the copies on this machine, not the ones GitHub
retains in `pepito-archive` — those are covered by the standing constraint that
the archive stays private, not by any command.

---

## What this plan does not do

- Migrate to `npm stage publish` or staged releases.
- Support self-hosted runners, which trusted publishing does not.
- Touch `src/`, `test/`, or the public API. If a task finds itself editing the
  library, it has left its scope — stop and report.
- Correct the stale manual-publish fallback in `CONTRIBUTING.md`, which
  describes `npm login` as it behaved before npm moved to two-hour session
  tokens. Recorded in the spec as adjacent work.
- Remove the corporate authorship from `pepito-archive`. It cannot be done:
  the pull refs are immutable from the client. The archive stays private, and
  that constraint is permanent rather than a step this plan completes.
- Delete `pepito-archive`. Not proposed: it holds the `v0.1.0` tag as
  published and the migration's evidence trail. Private is the control, not
  deletion.
