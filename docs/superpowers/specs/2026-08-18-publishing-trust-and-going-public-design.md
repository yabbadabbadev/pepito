# Publishing trust and going public — design

Date: 2026-08-18 (phase 2 revised 2026-08-19)
Status: phase 1 code merged and live; phase 1 cutover deferred to the end of
phase 2; phase 2 remediation revised after a measured discovery

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
- **Measured (this repo, 2026-08-19) — this finding invalidates the phase 2
  remediation designed below.** GitHub retains `refs/pull/1/head` through
  `refs/pull/4/head` on the remote. Enumerated with
  `git ls-remote origin 'refs/pull/*'`, fetched with
  `git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'` and read with
  `git log --format='%ae'` over the fetched refs, they carry up to 15 commits
  authored with a corporate email domain, and PR #4's history contains one
  blob with an absolute home path. Those refs are **immutable from the
  client**: `git push --force origin refs/remotes/pr/1:refs/pull/1/head` is
  rejected with `deny updating a hidden ref`. The consequence is that
  rewriting `main`'s authorship and force-pushing cannot reach the exposure.
  `main` becomes clean and GitHub keeps serving the pre-rewrite commits
  through the pull refs, whose PR pages are public on a public repository.
  The rewrite would do its job perfectly and achieve nothing.
- **Measured (this repo, 2026-08-19):** the adversarial review of the audit
  claimed the blob carrying an absolute home path was reachable from `main`.
  It is not. `git merge-base --is-ancestor` returns non-zero for the commit
  that introduces it against `main`, and the blob was reachable only from a
  stale local remote-tracking ref. `main`'s content is clean; the entire
  exposure lives in the retained pull refs.
- **Documented (GitHub, read 2026-08-19):** renaming a repository leaves
  redirects in place for links, clones and the API, and GitHub's own
  documentation warns of exactly one failure mode — the redirect stops
  working once a **new** repository takes the old name. Here that is the
  intended outcome rather than a hazard: `yabbadabbadev/pepito` must resolve
  to the new public repository, not redirect to the private archive. Reusing
  the name is therefore supported, with the redirect's loss deliberate.

## Decisions

| Decision                                                                 | Choice                                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sequencing                                                               | Two decoupled phases                                                                                                                                                        | Kills the expiring-token risk immediately; keeps the one irreversible step (going public) behind the audit gate                                                                                                                                                                                                                                                                                                                                                    |
| CHANGELOG authorship                                                     | release-please, adopted inside phase 1                                                                                                                                      | Removes the hand-written step that no gate enforced. Generated prose is weaker than the crafted `0.1.0` entry, which the release PR mitigates: it is a human editing point before the release exists                                                                                                                                                                                                                                                               |
| Corporate email in history                                               | Rewrite all 18 commits to a single identity — **partially superseded 2026-08-19:** still done, no longer sufficient on its own                                              | The only genuine exposure found; cheap to fix at this size. Superseded in reach, not in substance: the rewrite is what makes the history that gets published clean, but it cannot remove what GitHub retains in `refs/pull/*` on this repository. See the new-repository row below                                                                                                                                                                                 |
| Private-repo pointers (`../vbmmsw`, `../vbmmsw-consumer`, "La Despensa") | Keep, labeled as private                                                                                                                                                    | Preserves traceability of measured evidence, which is a standing rule of this repo; the names are not company references                                                                                                                                                                                                                                                                                                                                           |
| `workflow_dispatch`                                                      | Gone, superseded                                                                                                                                                            | It disappears with `publish.yml`. npm documents it as a validation-mismatch risk, and release-please removes the need for a manual escape hatch: publishing follows from merging a release PR                                                                                                                                                                                                                                                                      |
| GitHub Environment                                                       | `npm-publish` with a required reviewer                                                                                                                                      | Cheapest defense against an unintended or hostile tag push publishing on its own; matters more once public                                                                                                                                                                                                                                                                                                                                                         |
| Publishing credential                                                    | Removed entirely after OIDC is proven                                                                                                                                       | A token that still exists is a token that can leak                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Process documentation (`docs/superpowers/**`)                            | Public, sanitized                                                                                                                                                           | Specs and plans are an asset for a package whose argument is measured rigor; hiding them protects nothing                                                                                                                                                                                                                                                                                                                                                          |
| Audit report evidence                                                    | Committed, redacted                                                                                                                                                         | An audit report must not restate what it audits: publishing the raw grep output would reproduce verbatim the strings the rewrite exists to remove. Evidentiary value lives in the command run and the verdict, not in repeating the finding                                                                                                                                                                                                                        |
| Loss of the "Verified" badge on `main`'s 3 signed merge commits          | Accepted, human sign-off required before the rewrite runs                                                                                                                   | `git filter-repo` strips the `gpgsig` header GitHub applied to the PR #1–#3 merges; the badge cannot be regenerated after the fact. The tree-SHA check proves content is untouched but says nothing about this, so the human accepts the loss explicitly, before the force-push, not after discovering it on GitHub                                                                                                                                                |
| `main` and tag protection mechanism (added 2026-08-19)                   | Repository rulesets, not classic branch protection                                                                                                                          | Rulesets are the modern mechanism, support an explicit bypass list instead of an all-or-nothing admin-enforcement flag, and are fully configurable on a private repository — classic protection's `contexts` array otherwise invites the exact release-PR trap below                                                                                                                                                                                               |
| Requiring the `quality` check without adapting `ci.yml`                  | Rejected; `ci.yml` gets a `push` trigger for `release-please--**` first                                                                                                     | A release PR is opened by `GITHUB_TOKEN`, which does not trigger `pull_request`-scoped workflows, so `quality` would never report on it and the required check would block every release PR indefinitely. The `push` trigger produces the check run on the same head SHA the ruleset evaluates, satisfying the requirement legitimately. This must land **before** the ruleset requiring `quality` is created, or the first release PR after that point is stuck   |
| Required pull request approvals with one maintainer                      | Human decides: accept a bypass, or wait for a second maintainer                                                                                                             | Release PRs are authored by `github-actions[bot]` and the maintainer can approve those, but GitHub never allows approving one's own PR — so any PR the maintainer opens personally is blocked unless they bypass the rule, at which point the rule is a formality for their own work. Both halves are recorded; the choice is not made here                                                                                                                        |
| Restricting approving reviewers to organization members                  | No rule added — already true                                                                                                                                                | GitHub only counts an approving review toward a required-approvals rule when the reviewer has write access to the repository, so an outside contributor's review never satisfies it. `CODEOWNERS` plus "require review from Code Owners" is noted as available for finer control later, not needed now                                                                                                                                                             |
| Requiring signed commits on `main`                                       | Not required                                                                                                                                                                | The maintainer does not sign commits locally; the rule would block their own pushes. Consistent with the measured finding that only 3 commits in this repository are signed at all, and all 3 are GitHub's own web-flow signature on PR merges, not the maintainer's                                                                                                                                                                                               |
| Rules added beyond what was asked                                        | Block force pushes and deletions on `main`; require conversation resolution; require linear history; a separate tag ruleset protecting `v*`                                 | Force-push/deletion blocks are baseline hygiene classic protection also covered; conversation resolution stops a squash-merge past an unresolved review comment; linear history matches the squash-merge workflow already in use, so it enforces existing behavior rather than changing it; the tag ruleset matters specifically because release-please now creates tags automatically, and a protected tag prevents re-tagging a version already published to npm |
| Ruleset bypass list, after going public                                  | Narrowed to the repository owner alone; audited periodically                                                                                                                | Going public increases exposure to whatever the bypass list allows through. The bypass list is the thing to audit going forward — the rules themselves are static policy                                                                                                                                                                                                                                                                                           |
| Remediating the retained pull refs (added 2026-08-19)                    | Publish a **fresh repository**: archive the current one privately, create a new private `pepito`, push only the rewritten `main` and its tags, then flip the new one public | The pull refs cannot be rewritten from the client, so no amount of history rewriting on this repository removes the exposure. A new repository's pull refs start empty, so the published history is exactly the rewritten history and nothing else. The driver is not provenance: a visitor arriving from npmjs.com must not hit a private 404, which costs credibility regardless of how little the package is used                                               |
| Where the archive lives, and its visibility (added 2026-08-19)           | Rename the current repository to `pepito-archive`, keep it **private permanently**                                                                                          | It retains pre-rewrite history through refs the client cannot modify; making it public would publish exactly what the migration exists to remove. Recorded below as a standing constraint rather than a step, because it has no completion date                                                                                                                                                                                                                    |
| Reusing the name `pepito` for the new repository (added 2026-08-19)      | Supported, with the rename's redirect deliberately broken                                                                                                                   | GitHub documents only one consequence — the redirect from the old name stops working once a new repository claims it. That is the intended outcome: `yabbadabbadev/pepito` must be the new public repository, not a redirect to the archive                                                                                                                                                                                                                        |
| Order of the new repository against the npm configuration (2026-08-19)   | Create and verify the new repository, flip it public, **then** run the phase 1 cutover once, in the final repository                                                        | The same reason release-please came before the trusted publisher in phase 1: do not bind the registry to a name that is about to move. No trusted publisher exists yet — phase 1's cutover was never executed — so there is nothing to re-point and that risk evaporates instead of being managed                                                                                                                                                                  |
| Separate `0.1.2` provenance validation release (superseded 2026-08-19)   | Dropped                                                                                                                                                                     | Publishing from an already-public repository means `0.1.1` carries provenance on its first release. A second validation release would prove nothing the first does not, and npm gets configured once rather than twice                                                                                                                                                                                                                                             |
| Pushing the new repository private first (added 2026-08-19)              | Yes, always private on first push                                                                                                                                           | Verification happens before exposure, never after: the tree-SHA check, the authorship check and the audit re-run all read a repository nobody outside can see yet                                                                                                                                                                                                                                                                                                  |

## Standing constraints

- **`pepito-archive` must never be made public.** It retains pre-rewrite
  history through refs the client cannot modify, so visibility is the only
  control available. This constraint has no expiry and no exception: it
  outlives this migration and applies to anyone who inherits the repository.
- **`package.json`'s `repository`, `homepage` and `bugs` fields already point
  at `github.com/yabbadabbadev/pepito`** (measured, this repo, 2026-08-19),
  which is the name the new public repository takes. They need no change.
  They would need one only if the new repository were given a different name,
  and it is not.

## Phase 1 — Release automation and trusted publishing (repo stays private)

Two changes to the release pipeline, deliberately in this order: the pipeline
is restructured first, while the token still works as a fallback, and npm's
trusted publisher is then configured once, against the final workflow
filename.

**Revised 2026-08-19.** The code half of this phase is merged and live:
`release.yml` runs on pushes to `main`, and its first real run behaved as
designed — release job green, publish job skipped because nothing was
releasable. The cutover half — the `npm-publish` environment, the npm trusted
publisher and a validation release — was **never executed**, so no trusted
publisher exists yet and the `NPM_TOKEN` secret still stands as the fallback.
That is now a benefit rather than a debt: the cutover moves to the end of
phase 2 and runs once, in the final repository, so nothing has to be
re-pointed at a repository that is about to move.

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

**Revised 2026-08-19:** these steps run in the new repository, after it is
public — not here, and not before. `0.1.1` is therefore the first
provenance-carrying release, and the phase 2 verification below owns that
check.

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

## Phase 2 — Security audit, history rewrite, fresh repository, going public

### The audit

Nine dimensions, each with a method and a binary pass criterion. The report
is written to `docs/security-audit-2026-08-19.md` and committed, so the
decision to go public carries its evidence. Each dimension records the
command run and its output — the proof, not the word "reviewed". A dimension
that cannot be measured is recorded red, with the reason.

| #   | Dimension                                  | Method                                                                                                                                                                                                             | Pass criterion                                                          |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1   | Credentials and secrets                    | `gitleaks detect` over the full history (requires installing `gitleaks`), plus a manual read of all 55 tracked files                                                                                               | 0 findings, or findings justified in writing as false positives         |
| 2   | Company and brand references               | grep for corporate domains and names across tracked content, commit messages, authorship and files deleted in history                                                                                              | 0 occurrences                                                           |
| 3   | PII                                        | emails, names and absolute user home paths across content, history and lockfile                                                                                                                                    | only deliberately public identity                                       |
| 4   | Private-repo pointers                      | full inventory of the references                                                                                                                                                                                   | the agreed policy applied: kept and labeled private                     |
| 5   | Infrastructure leakage                     | secret names, workflow permissions, `.claude/` contents, lockfile registries                                                                                                                                       | already verified clean during reconnaissance; re-confirmed with output  |
| 6   | Published tarball contents                 | `npm pack --dry-run` file list against what is expected                                                                                                                                                            | nothing beyond `dist/` and package metadata                             |
| 7   | Process documentation                      | read `docs/superpowers/**`, `.claude/docs/references/**` and the audit report itself for absolute user home paths, corporate domains and verbatim reproductions of redacted findings                               | 0 occurrences; the report states commands and verdicts only             |
| 8   | Post-public posture                        | the hardening checklist below, verified through `gh api`                                                                                                                                                           | applied and confirmed                                                   |
| 9   | Surfaces GitHub retains (added 2026-08-19) | pull request refs and the authorship of the commits they carry, PR titles and bodies, issues, past Actions run logs, repository description and topics, tag contents, forks, and the already-published npm tarball | each surface either clean, or named with the remediation that covers it |

**Why dimension 9 exists.** Every surface it lists is public on a public
repository, and none of dimensions 1-8 owned any of them: they all measure the
tree, the history reachable from a branch, or repository settings. The
reviewer who found this gap checked most of the list and found it clean --
titles, bodies, issues, run logs, description, topics, tags and the published
tarball. The one dirty surface is the pull-ref authorship, and it is what
forces the new repository. The dimension therefore exists to make the coverage
owned and repeatable, not because everything in it is dirty: on the new
repository it is re-run and expected to come back empty, which is itself the
evidence that the move worked.

**The 2026-08-19 audit report has to be redone in the affected dimensions.**
The adversarial review found real coverage gaps: dimensions 2 and 3 ran `git
grep` with no revision argument, so they searched the index while their
criteria demand history; dimension 1 omitted the manual read of every tracked
file this method requires, and cited a stale file count; dimension 1 also
overstates its scope, because `gitleaks --log-opts=--all` inherits `git log`'s
skipping of merge commits; dimension 5 omitted workflow permissions and
`.claude/` from its evidence; and several exit statuses were read from
pipelines ending in `sort -u`, which always return 0. That last one is the
same failure shape as reading `N` from `git log --format=%G?` on a machine
without `gpg`, which this project already fell for once. The re-run is a plan
task, and the verdicts it replaces are not carried forward.

### Hardening checklist (post-public)

- Secret scanning and push protection enabled.
- Default workflow permissions set to read-only.
- Approval required for workflow runs from fork pull requests. Note as an
  audited fact that `ci.yml` triggers on `pull_request`, not
  `pull_request_target`, so fork runs never see repository secrets.
- Dependabot alerts enabled.
- `SECURITY.md` written and private vulnerability reporting enabled.
- The two stale remote branches (`docs/worktree-warning`,
  `publish-without-provenance`) absent — **revised 2026-08-19:** they are
  never pushed to the new repository rather than deleted from it.
- `main` and `v*` protected by repository rulesets — applied **after** the
  history has landed, since a ruleset blocking force pushes would otherwise
  block the initial push. Superseded here from the
  classic branch-protection API originally planned; see the Decisions table
  above and `docs/superpowers/plans/2026-08-19-publishing-trust-and-going-public.md`
  Task 7 Steps 7a–7g for the full design, including the `ci.yml` change that
  must land before the `quality` check can be required without deadlocking
  every release PR.

**Open item, blocking, added 2026-08-19:** release-please's ability to open a
release PR depends on an organization-level setting, not only the
repository-level one already checked in Task 4 Step 0.
`github.com/organizations/yabbadabbadev/settings/actions` → Workflow
permissions → "Allow GitHub Actions to create and approve pull requests" is
currently disabled at the organization, and the repository API cannot
override an organization-level "disabled" — attempting the equivalent PATCH
on the repository returns HTTP 409 `The organization does not allow GitHub
Actions to create or approve pull requests`. This must be enabled by a human
with organization access before release-please can function at all.
**Cleared 2026-08-19:** the human enabled it at the organization, and the
repository-level flag was then set too — measured as
`{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}`.
It is an organization-level setting, so it carries over to the new
repository, but it is worth re-reading there rather than assumed.

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

**Superseded 2026-08-19, in destination only:** the rewrite was originally
followed by a force-push of `main` and the tags back to this repository. That
step is gone — see the pull-ref finding above — and its replacement is a push
of the rewritten `main` and its tags to a new, empty, private repository. The
rewrite itself, its mailmap, its tree-SHA invariant and its abort condition
are unchanged; only where the result lands changed. The stale branches
(`docs/worktree-warning`, `publish-without-provenance`) are not pushed at all
rather than deleted afterwards.

The global `git config` on this machine carries the corporate email, so the
next commit made here would reintroduce it. **Already applied on 2026-08-18,
ahead of this phase:** `user.email` and `user.name` are set at the repository
level in `.git/config`, which leaves this repo's identity self-contained
instead of half-inherited from the global config. The global config is
untouched. What remains for this phase is documenting it in
`CONTRIBUTING.md` as a setup step, so a fresh clone does not silently fall
back to the global identity.

### Order of the irreversible steps

**Superseded 2026-08-19.** The original order was: verify the email, rewrite,
force-push while private, verify, flip visibility. Its steps 2 and 5 assumed
the exposure lived only in `main`. The reasoning it was built on survives —
never make anything public before the history it will serve is the rewritten
one — and the revised order below preserves it. The original is kept because
the sequencing principle is the same, and because the reason it failed is a
finding, not an oversight to erase.

The revised order:

1. Redo the audit in the dimensions the adversarial review found
   under-covered, with history-covering commands, and add dimension 9.
2. Verify `alex@yabbadabba.dev` on the GitHub account — otherwise the 18
   rewritten commits lose attribution to the profile (recoverable later:
   GitHub re-attributes retroactively once verified).
3. Rewrite authorship locally, on a mirror, with the tree-SHA invariant as the
   gate. Push nothing yet.
4. Rename this repository to `pepito-archive`, keeping it private.
5. Create a new **private** repository named `pepito` and push only the
   rewritten `main` and its tags.
6. Verify against the new repository: tree SHA, authorship, tags, and
   dimension 9 coming back empty. Verification precedes exposure.
7. The human flips the new repository to public.
8. Only then: the phase 1 cutover, once, in the final repository — the
   `npm-publish` environment with a required reviewer, the npm trusted
   publisher, and the rulesets designed above.

Two consequences of this ordering, stated because they remove work rather than
add it. First, publishing from an already-public repository means **`0.1.1`
carries provenance on its first release**: the separate `0.1.2` validation
release disappears entirely and npm is configured once instead of twice.
Second, the reason for the ordering is the one that already put release-please
before the trusted publisher in phase 1 — do not bind the registry to a name
that is about to move.

The property worth keeping from the original text still holds, and more
cleanly: the rewrite happens before any provenance-carrying publish exists.
Provenance binds a package to a specific commit, and rewriting afterwards
would leave that binding pointing at a SHA that no longer exists. `0.1.0`
carries no provenance and is immune to the rewrite.

### Verification

- `npm view @yabbadabbadev/pepito@0.1.1` reports provenance, and
  `npm audit signatures` passes.
- No `--provenance` flag was added anywhere.
- The hardening checklist confirmed through `gh api` output, against the new
  repository.
- `gh api repos/yabbadabbadev/pepito-archive --jq '.visibility'` returns
  `private`, and does so on every later audit of this package.
- `git ls-remote origin 'refs/pull/*'` against the new repository returns
  nothing before the first PR is opened there.

## Documentation deliverables

| File                                          | Content                                                                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/trusted-publishing.md`                  | **new** — the teaching document: why OIDC removes the secret, which claims npm validates, how it compares with the token it replaces. Written to be reusable on other repositories, not only this one |
| `docs/security-audit-2026-08-19.md`           | **new** — the audit report, nine dimensions with redacted evidence                                                                                                                                    |
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
