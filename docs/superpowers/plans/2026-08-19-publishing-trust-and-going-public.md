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
eight dimensions, rewrites commit authorship, makes the repository public, and
proves provenance appeared.

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

| File                                          | Responsibility                                           | Task |
| --------------------------------------------- | -------------------------------------------------------- | ---- |
| `release-please-config.json`                  | How release-please versions this package                 | 1    |
| `.release-please-manifest.json`               | The version release-please believes is current           | 1    |
| `.github/workflows/release.yml`               | The entire release path: release PR, tag, OIDC publish   | 2    |
| `.github/workflows/publish.yml`               | **Deleted** — superseded by `release.yml`                | 2    |
| `docs/trusted-publishing.md`                  | Teaching document: why OIDC removes the secret           | 3    |
| `.claude/docs/references/publishing-trust.md` | Agent-facing findings, labeled                           | 3    |
| `CONTRIBUTING.md`                             | Release runbook rewritten around release-please and OIDC | 3    |
| `CLAUDE.md`, `ROADMAP.md`                     | Status, Releasing, closed and dropped deferrals          | 3, 8 |
| `docs/security-audit-2026-08-19.md`           | Audit report, eight dimensions, redacted                 | 5, 7 |
| `SECURITY.md`                                 | Vulnerability reporting policy                           | 7    |

A note on testing in this plan: no task touches `src/`, so there is no
red-green cycle to run. The equivalent discipline here is that **every task
states the command that proves it and the output that counts as proof**, and
the two tasks whose deliverable is a live pipeline (4 and 8) are proven by a
real publish, not by reading YAML.

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

### Task 4: Phase 1 cutover (human-gated)

**Files:** none. This task changes state on GitHub and npmjs.com, and its
deliverable is a published `0.1.1` with no secret behind it.

**Interfaces:**

- Consumes: the merged workflow from Tasks 1–3, and the exact strings
  `release.yml` and `npm-publish`.
- Produces: a working OIDC publish path, which Task 8 reuses unchanged to
  produce the first provenance-carrying release.

**Stop and ask the human at every step below. Do not perform the npm-side or
visibility-side actions on their behalf.**

- [ ] **Step 0: Ask the human to confirm the Actions PR-creation setting**

Settings → Actions → General → Workflow permissions → "Allow GitHub Actions
to create and approve pull requests" must be enabled. Without it,
release-please's `GITHUB_TOKEN` cannot open the release PR, and the failure
mode is silence: no PR appears anywhere, and nothing in the run log says why.

- [ ] **Step 1: Merge the PR from Task 3**

```bash
gh pr merge --squash --delete-branch
```

The push to `main` runs `release.yml` for the first time. Expect the release
job to succeed and the publish job to be **skipped** — nothing on `main` is a
`feat:` or `fix:`, so `release_created` is false. That skip is the correct
outcome, not a failure.

```bash
gh run list --workflow=release.yml --limit 1
gh run view --log | tail -40
```

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
gh secret delete NPM_TOKEN --repo yabbadabbadev/pepito
gh secret list --repo yabbadabbadev/pepito
```

Expected: `NPM_TOKEN` absent. The order matters: until Step 7 proved OIDC
works, the token was the only way to publish.

---

### Task 5: The security audit

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

### Task 6: Rewrite commit authorship

**Files:** none in the working tree. This task rewrites git history on the
remote.

**Interfaces:**

- Consumes: a passing Task 5. **Do not start if any dimension failed.**
- Produces: a history with a single authorship identity, which is the
  precondition for Task 7 making it public.

**This task force-pushes. Every step below is human-gated.**

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

- [ ] **Step 7: Ask the human to authorize the force-push, then push**

```bash
git push --force origin 'refs/heads/main:refs/heads/main'
git push --force --tags origin
```

- [ ] **Step 8: Delete the stale remote branches**

```bash
git push origin --delete docs/worktree-warning publish-without-provenance
gh api repos/yabbadabbadev/pepito/branches --jq '.[].name'
```

Expected: only `main` (plus any branch open at the time).

- [ ] **Step 9: Re-clone the local working copy so it cannot diverge**

Every local commit now has a different SHA, so the old clone is incompatible
with the remote. Move it aside rather than deleting it, re-clone, and restore
the repository-level identity — a fresh clone inherits the global config,
which is what put a corporate address in the history in the first place.

```bash
cd ~/dummies
mv pepito pepito.pre-rewrite
git clone git@github.com:yabbadabbadev/pepito.git
cd pepito
git config --local user.email alex@yabbadabba.dev
git config --local user.name "Alex Fuentes"
git log --format='%an <%ae>' | sort -u
git var GIT_AUTHOR_IDENT
```

Expected: one identity in the log, and the new identity active. Keep
`pepito.pre-rewrite` until Task 8 is done, then delete it — it is the only
remaining copy of the old history, and it contains what the rewrite removed.

---

### Task 7: Go public, and harden

**Files:**

- Create: `SECURITY.md`
- Modify: `docs/security-audit-2026-08-19.md` — dimension 8

**Interfaces:**

- Consumes: a verified Task 6.
- Produces: a public repository whose settings Task 8's provenance depends on.

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

- [ ] **Step 3: Ask the human to make the repository public — irreversible**

GitHub → Settings → General → Danger Zone → Change visibility → Public.

Confirm the preconditions out loud before asking: Task 5 passed, Task 6's tree
SHA matched, the force-push landed, the stale branches are gone. Then:

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

- [ ] **Step 7: Protect main — after the force-push, never before**

```bash
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

Expected: force pushes disabled, `quality` required.

**Known consequence, not a bug to fix here:** requiring the `quality` check
makes release-please's own release PRs unmergeable through the normal path.
`ci.yml` runs `on: pull_request`, and a PR opened with the default
`GITHUB_TOKEN` — which is how `release-please-action` opens the release PR —
does not trigger other workflows, the same restriction that shaped why
`release.yml` carries both jobs in Task 1. `quality` therefore never runs on
a release PR, the required check never reports success, and GitHub blocks
the merge button indefinitely, not just delays it.

`enforce_admins` stays `false` on purpose so this has a resolution: the
repository owner merges the release PR with `gh pr merge --admin --squash`
(or the equivalent "Merge without waiting for requirements" button), which
bypasses required checks for admins only. This is the intended mechanism,
not an unstated workaround — document it in `CONTRIBUTING.md`'s release
section so the next release doesn't look stuck. The alternative of adding
`pull_request_target` to `ci.yml` is deliberately not taken here: it would
hand a fork's PR run access to repository secrets, which is exactly what
Step 5 records `ci.yml` avoiding.

- [ ] **Step 8: Close dimension 8 in the report, and commit**

Fill in dimension 8 with the `gh api` output for each control — the verdict per
control, not a checkmark. Then:

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

**Files:**

- Modify: `ROADMAP.md`, `CLAUDE.md`

**Interfaces:**

- Consumes: the public repository from Task 7 and the OIDC path proven in
  Task 4, unchanged.
- Produces: the first provenance-carrying release, and documentation that
  describes what happened rather than what was planned.

- [ ] **Step 1: Force the provenance validation release**

```bash
git switch -c chore/release-0.1.2
git commit --allow-empty -m "chore: release 0.1.2

First release published from a public repository, which is what makes the
registry generate provenance. No source change.

Release-As: 0.1.2"
git push -u origin chore/release-0.1.2
gh pr create --fill && gh pr merge --squash --delete-branch
```

Then edit the CHANGELOG in the release PR as in Task 4 Step 5, merge it, and
approve the environment gate.

- [ ] **Step 2: Verify provenance exists — from the registry, not from the run log**

```bash
npm view @yabbadabbadev/pepito version
npm view @yabbadabbadev/pepito --json | node -e "const p=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('dist keys:', Object.keys(p.dist))"
npm audit signatures
```

Expected: `0.1.2`, an attestations entry in `dist`, and `npm audit signatures`
reporting verified signatures and attestations. If provenance is absent, do
not paper over it: the likely causes are the repository not actually being
public yet or the package being published from a ref the attestation cannot
resolve, and both are diagnosable from the run log.

- [ ] **Step 3: Confirm no `--provenance` flag was ever added**

```bash
grep -rn 'provenance' .github/workflows/ || echo "no provenance flag anywhere, as intended"
```

Expected: no match. Provenance came from the registry, not from a flag. This
is the check that keeps the ROADMAP's old promise from quietly creeping back
in.

- [ ] **Step 4: Close the ROADMAP**

Rewrite three rows: mark "Trusted publishing (OIDC, no token)" as done with
the date; mark "Provenance publishing" as done, and correct the reasoning
recorded there — the entry promised to re-enable a flag that turned out never
to be needed; drop "remove `workflow_dispatch`" as superseded, since the
trigger left with `publish.yml`. Add nothing that was not actually deferred.

- [ ] **Step 5: Update the CLAUDE.md status and Releasing sections**

The Status table gets a row for this migration: what was executed, on what
date, with the verification. "Releasing" describes release-please plus OIDC
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

- [ ] **Step 7: Delete the pre-rewrite clone**

```bash
rm -rf ~/dummies/pepito.pre-rewrite
```

It is the last copy of the history the rewrite removed. Keeping it defeats the
point of Task 6.

---

## What this plan does not do

- Migrate to `npm stage publish` or staged releases.
- Support self-hosted runners, which trusted publishing does not.
- Touch `src/`, `test/`, or the public API. If a task finds itself editing the
  library, it has left its scope — stop and report.
- Correct the stale manual-publish fallback in `CONTRIBUTING.md`, which
  describes `npm login` as it behaved before npm moved to two-hour session
  tokens. Recorded in the spec as adjacent work.
