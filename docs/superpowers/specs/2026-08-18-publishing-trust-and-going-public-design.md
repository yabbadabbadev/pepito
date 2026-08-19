# Publishing trust and going public — design

Date: 2026-08-18
Status: approved, pending implementation plan

## Problem

`@yabbadabbadev/pepito` publishes from CI with `NODE_AUTH_TOKEN`, a granular
npm automation token with the "Bypass 2FA" capability. That mechanism is on
its way out: npm revoked all classic tokens on 2025-12-09, and granular
write tokens with 2FA bypass are now capped at a 90-day lifetime. The
current setup therefore has an expiry clock running, not a hypothetical
future deprecation.

Two goals follow, and they were initially believed to be one:

1. Replace the token with trusted publishing (OIDC), so no long-lived
   publishing credential exists anywhere.
2. Make this repository public, which is what unlocks provenance
   attestations — gated behind a security audit, because publishing a
   history is irreversible.

## Findings that shape the design

Verified against `docs.npmjs.com/trusted-publishers` and the GitHub
changelog on 2026-08-18, not assumed.

- **Measured (documented):** OIDC authentication works from a **private**
  repository. Only provenance generation requires a public one: "For
  packages in private repositories, provenance will not be generated even
  though you're using trusted publishing." This decouples goal 1 from goal
  2 and is the single most consequential finding here — the ROADMAP's
  ordering was written on the opposite premise.
- **Measured (documented):** with trusted publishing, provenance is
  generated **automatically** for a public repo and a public package. The
  `--provenance` flag is never needed. The ROADMAP entry promising to
  "re-enable the flag" describes work that does not exist.
- **Measured (documented):** trusted publishing requires npm >= 11.5.1 and
  Node >= 22.14.0. This repo pins Node 24.18.0 in `.nvmrc`, whose bundled
  npm (11.16.0 locally) clears the bar.
- **Measured (documented):** the npmjs.com trusted publisher configuration
  matches on organization, repository, workflow **filename**, and an
  optional environment name. All fields are case-sensitive. Configurations
  created after 2026-05-20 must explicitly select at least one allowed
  action.
- **Measured (documented):** npm's own docs flag `workflow_dispatch` and
  `workflow_call` as a cause of trusted-publisher validation mismatch. The
  current `publish.yml` accepts `workflow_dispatch`.
- **Measured (documented):** `release-please-action` exposes a
  `release_created` output plus `tag_name` and `version`, and its own docs
  state that "events triggered by the `GITHUB_TOKEN` will not create a new
  workflow run" — which is why the publish step has to live in the same
  workflow file rather than in a separate tag-triggered one.
- **Measured (documented):** the release-please job needs `contents: write`
  and `pull-requests: write`, which is a wider grant than the current
  `contents: read`. It is scoped to the release job alone, not to the publish
  job that carries `id-token: write`.
- **Measured (this repo, 2026-08-18):** reconnaissance of the 55 tracked
  files and all 18 commits found no credentials, no real-company reference
  in tracked content, no `.npmrc` or `.env` ever committed, and only
  `registry.npmjs.org` in the lockfile. The one real exposure is commit
  authorship: 15 of 18 commits carry a corporate email address.
- **Measured (this repo, 2026-08-19):** `main`'s three merge commits (the
  PR #1, #2, #3 merges) carry GitHub's own `gpgsig` signature, applied by
  GitHub's web-flow key when the merge happens through the GitHub UI. The
  first pass at this finding ran `git log --all --format='%H %G?'`, read the
  `N` printed for every one of the 18 commits as "unsigned", and concluded
  the rewrite in Phase 2 had nothing to break. That reading is wrong, and the
  command was not a usable meter for the question: `gpg` is not installed on
  this machine, so git could not attempt verification at all and printed
  `error: cannot run gpg: No such file or directory` alongside every `N` —
  a meter that cannot measure reporting a convenient answer instead of going
  red. The actual signal was in that error line, not in the `%G?` column. The
  presence of the `gpgsig` header itself — independent of any verification —
  was confirmed directly with `git cat-file commit <sha> | grep gpgsig`
  against all 26 commits reachable from any ref, which found exactly three,
  all merge commits on `main`. Diffing the raw commit object of one of them
  (`git cat-file commit 299e2335998f057195fd456a58f8374557312af1`) before and
  after a scratch rewrite showed tree, author, committer and message
  byte-identical; the only difference was the `gpgsig` header itself, which
  `git filter-repo` strips from every commit it touches. The Phase 2 rewrite
  therefore does have something to break: it will strip these three
  signatures, and those merge commits will permanently lose their "Verified"
  badge on GitHub once pushed.

## Decisions

| Decision                                                                 | Choice                                                    | Rationale                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sequencing                                                               | Two decoupled phases                                      | Kills the expiring-token risk immediately; keeps the one irreversible step (going public) behind the audit gate                                                                                                                                                                                                     |
| CHANGELOG authorship                                                     | release-please, adopted inside phase 1                    | Removes the hand-written step that no gate enforced. Generated prose is weaker than the crafted `0.1.0` entry, which the release PR mitigates: it is a human editing point before the release exists                                                                                                                |
| Corporate email in history                                               | Rewrite all 18 commits to a single identity               | The only genuine exposure found; cheap to fix at this size                                                                                                                                                                                                                                                          |
| Private-repo pointers (`../vbmmsw`, `../vbmmsw-consumer`, "La Despensa") | Keep, labeled as private                                  | Preserves traceability of measured evidence, which is a standing rule of this repo; the names are not company references                                                                                                                                                                                            |
| `workflow_dispatch`                                                      | Gone, superseded                                          | It disappears with `publish.yml`. npm documents it as a validation-mismatch risk, and release-please removes the need for a manual escape hatch: publishing follows from merging a release PR                                                                                                                       |
| GitHub Environment                                                       | `npm-publish` with a required reviewer                    | Cheapest defense against an unintended or hostile tag push publishing on its own; matters more once public                                                                                                                                                                                                          |
| Publishing credential                                                    | Removed entirely after OIDC is proven                     | A token that still exists is a token that can leak                                                                                                                                                                                                                                                                  |
| Process documentation (`docs/superpowers/**`)                            | Public, sanitized                                         | Specs and plans are an asset for a package whose argument is measured rigor; hiding them protects nothing                                                                                                                                                                                                           |
| Audit report evidence                                                    | Committed, redacted                                       | An audit report must not restate what it audits: publishing the raw grep output would reproduce verbatim the strings the rewrite exists to remove. Evidentiary value lives in the command run and the verdict, not in repeating the finding                                                                         |
| Loss of the "Verified" badge on `main`'s 3 signed merge commits          | Accepted, human sign-off required before the rewrite runs | `git filter-repo` strips the `gpgsig` header GitHub applied to the PR #1–#3 merges; the badge cannot be regenerated after the fact. The tree-SHA check proves content is untouched but says nothing about this, so the human accepts the loss explicitly, before the force-push, not after discovering it on GitHub |

## Phase 1 — Release automation and trusted publishing (repo stays private)

Two changes to the release pipeline, deliberately in this order: the pipeline
is restructured first, while the token still works as a fallback, and npm's
trusted publisher is then configured once, against the final workflow
filename.

### Why the two travel together

The trusted publisher binds to a workflow **filename**. Tags created with
`GITHUB_TOKEN` do not trigger other workflows, so release-please cannot push
a tag and let a separate `publish.yml` react to it — either it publishes from
the same workflow, or a Personal Access Token is introduced, which is the
exact long-lived secret this phase exists to remove. The secret-free shape is
therefore a single `release.yml`, and configuring npm before that file exists
would mean binding to a name about to disappear.

### Code change

- **New `.github/workflows/release.yml`**, replacing `publish.yml`:
  - Triggered by pushes to `main`. The release-please action (pinned by
    commit SHA, like every other action in this repo) maintains a release PR
    with the version bump and the generated CHANGELOG entry.
  - A publish job guarded by the action's `release_created` output, carrying
    `id-token: write` and `environment: npm-publish`, repeating the same
    verification as the PR gate (install, Chromium, tests, typecheck, build),
    then the npm CLI guard and `npm publish` with no token.
- **`publish.yml` deleted.** Its tag trigger, its `workflow_dispatch` and its
  version guard are all superseded: release-please owns the version, the
  CHANGELOG and the tag, so a tag can no longer disagree with `package.json`.
- **`release-please-config.json` and `.release-please-manifest.json`** added,
  the manifest seeded with the already-published `0.1.0` so the first run
  computes the next version instead of starting over.
- The npm CLI guard fails with a written reason if the runner's npm is older
  than 11.5.1, rather than letting `npm publish` fail while attempting an
  authentication path that no longer exists.
- `registry-url` stays in `setup-node` — the official example keeps it; only
  the `NODE_AUTH_TOKEN` environment variable goes away.

### The bootstrap gotcha

**Measured against the action's documented behaviour:** release-please derives
the bump from Conventional Commit types, and every commit on `main` today is
`docs:`, `ci:` or `chore:` — none of which bump a version. Left alone it would
open no release PR at all, which reads as a broken pipeline rather than as
correct behaviour. The validation release is therefore forced explicitly with
a `Release-As: 0.1.1` footer, and that requirement is documented in
`CONTRIBUTING.md`: a release with nothing but documentation commits behind it
has to be asked for.

### Human steps (ordered; the agent stops and asks at each)

1. Create the `npm-publish` GitHub Environment with the repository owner as a
   required reviewer.
2. Configure the trusted publisher on npmjs.com for `@yabbadabbadev/pepito`:
   organization `yabbadabbadev`, repository `pepito`, workflow filename
   `release.yml`, environment `npm-publish`, allowed action `npm publish`.
3. Merge the release PR that release-please opens. Merging it is what creates
   the tag, and the resulting push to `main` is what runs the publish job.
4. Approve the environment gate when the run pauses for it.
5. Only after a green publish: revoke the npm token and delete the
   `NPM_TOKEN` repository secret. The token is the fallback until OIDC is
   proven; removing it earlier would leave no way to publish if OIDC fails.

### Verification

- release-please opens a release PR carrying the `0.1.1` bump and a CHANGELOG
  entry.
- The publish job is green with no `NODE_AUTH_TOKEN` anywhere in its
  environment.
- `npm view @yabbadabbadev/pepito version` returns `0.1.1`.
- `gh secret list` no longer lists `NPM_TOKEN`.

## Phase 2 — Security audit, history rewrite, going public

### The audit

Eight dimensions, each with a method and a binary pass criterion. The report
is written to `docs/security-audit-2026-08-19.md` and committed, so the
decision to go public carries its evidence. Each dimension records the
command run and its output — the proof, not the word "reviewed". A dimension
that cannot be measured is recorded red, with the reason.

| #   | Dimension                    | Method                                                                                                                                                                               | Pass criterion                                                         |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | Credentials and secrets      | `gitleaks detect` over the full history (requires installing `gitleaks`), plus a manual read of all 55 tracked files                                                                 | 0 findings, or findings justified in writing as false positives        |
| 2   | Company and brand references | grep for corporate domains and names across tracked content, commit messages, authorship and files deleted in history                                                                | 0 occurrences                                                          |
| 3   | PII                          | emails, names and absolute user home paths across content, history and lockfile                                                                                                      | only deliberately public identity                                      |
| 4   | Private-repo pointers        | full inventory of the references                                                                                                                                                     | the agreed policy applied: kept and labeled private                    |
| 5   | Infrastructure leakage       | secret names, workflow permissions, `.claude/` contents, lockfile registries                                                                                                         | already verified clean during reconnaissance; re-confirmed with output |
| 6   | Published tarball contents   | `npm pack --dry-run` file list against what is expected                                                                                                                              | nothing beyond `dist/` and package metadata                            |
| 7   | Process documentation        | read `docs/superpowers/**`, `.claude/docs/references/**` and the audit report itself for absolute user home paths, corporate domains and verbatim reproductions of redacted findings | 0 occurrences; the report states commands and verdicts only            |
| 8   | Post-public posture          | the hardening checklist below, verified through `gh api`                                                                                                                             | applied and confirmed                                                  |

### Hardening checklist (post-public)

- Secret scanning and push protection enabled.
- Default workflow permissions set to read-only.
- Approval required for workflow runs from fork pull requests. Note as an
  audited fact that `ci.yml` triggers on `pull_request`, not
  `pull_request_target`, so fork runs never see repository secrets.
- Dependabot alerts enabled.
- `SECURITY.md` written and private vulnerability reporting enabled.
- The two stale remote branches deleted (`docs/worktree-warning`,
  `publish-without-provenance`).
- Branch protection on `main` — applied **after** the force-push, since it
  would otherwise block it.

### The history rewrite

Nothing destructive touches the working clone. The rewrite runs on a
`git clone --mirror` in a scratch directory, applying
`git filter-repo --mailmap` to map both existing identities to a single
`Alex Fuentes <alex@yabbadabba.dev>`. Requires `git-filter-repo` to be
installed.

**The check that makes this safe is comparable, not impressionistic:** the
`HEAD` tree SHA (`git rev-parse HEAD^{tree}`) must be identical before and
after the rewrite. A match proves only authorship metadata changed and not
one byte of content. Additional checks: 18 commits after, a single identity
in `git log`, and both tags repointed. If the tree SHA differs, the rewrite
aborts and nothing is pushed.

Only then: force-push `main` and tags, delete the stale branches, and
re-clone the local copy so it cannot diverge.

The global `git config` on this machine carries the corporate email, so the
next commit made here would reintroduce it. **Already applied on 2026-08-18,
ahead of this phase:** `user.email` and `user.name` are set at the repository
level in `.git/config`, which leaves this repo's identity self-contained
instead of half-inherited from the global config. The global config is
untouched. What remains for this phase is documenting it in
`CONTRIBUTING.md` as a setup step, so a fresh clone does not silently fall
back to the global identity.

### Order of the irreversible steps

1. Verify `alex@yabbadabba.dev` on the GitHub account — otherwise the 18
   rewritten commits lose attribution to the profile (recoverable later:
   GitHub re-attributes retroactively once verified).
2. Rewrite and force-push, while the repository is still private.
3. Verify.
4. Make the repository public.

Never the reverse: rewriting after going public means the old history has
already been seen.

A property that falls out of this sequencing and is worth stating: the
rewrite happens **before** the first provenance-carrying publish (`0.1.2`).
Provenance binds a package to a specific commit; rewriting afterwards would
leave that binding pointing at a SHA that no longer exists. Under this
order, `0.1.0` and `0.1.1` carry no provenance and are immune to the
rewrite.

### Verification

- `npm view @yabbadabbadev/pepito@0.1.2` reports provenance, and
  `npm audit signatures` passes.
- No `--provenance` flag was added anywhere.
- The hardening checklist confirmed through `gh api` output.

## Documentation deliverables

| File                                          | Content                                                                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/trusted-publishing.md`                  | **new** — the teaching document: why OIDC removes the secret, which claims npm validates, how it compares with the token it replaces. Written to be reusable on other repositories, not only this one |
| `docs/security-audit-2026-08-19.md`           | **new** — the audit report, eight dimensions with redacted evidence                                                                                                                                   |
| `SECURITY.md`                                 | **new** — reporting policy, expected of a public repository                                                                                                                                           |
| `.claude/docs/references/publishing-trust.md` | **new**, agent-facing — the findings above, each labeled measured or documented                                                                                                                       |
| `CONTRIBUTING.md`                             | release runbook without a token; repository-level `user.email` as a setup step                                                                                                                        |
| `CLAUDE.md`                                   | Status and Releasing brought up to date                                                                                                                                                               |
| `ROADMAP.md`                                  | closes "trusted publishing" and "provenance"; drops "remove `workflow_dispatch`" as superseded                                                                                                        |

## Tooling to install

Two tools this repo does not currently have, both one-off local installs and
neither added as a package dependency:

- `gitleaks` — history-aware secret scanning for audit dimension 1.
- `git-filter-repo` — the history rewrite.

## Noted, deferred to the ROADMAP

- **The manual publish fallback in `CONTRIBUTING.md` is stale.** It describes
  `npm login` as it behaved before npm moved to two-hour session tokens.
  Correcting it is documentation work adjacent to, but not part of, this
  migration.

## Out of scope

- Migrating to `npm stage publish` or staged releases.
- Self-hosted runners (unsupported by trusted publishing today).
- Any change to the library's source, tests or public API.
- Scrubbing the Spanish test filenames present in history: they are not
  sensitive, and rewriting content would break the tree-SHA equality check
  that makes the authorship rewrite verifiable.
