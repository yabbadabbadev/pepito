# Publishing trust: OIDC and release-please

Load this before touching `.github/workflows/release.yml`,
`release-please-config.json`, `.release-please-manifest.json`, or the
"Publishing a version" section of `CONTRIBUTING.md`. The reasoning behind
each finding — why it matters, not just what it says — lives in
`docs/trusted-publishing.md`; this file is the pointer table an agent checks
before assuming something about the release path.

**Labels.** Each finding is marked **documented** (read from npm's or the
action's own documentation, not reproduced in this repo) or **measured**
(observed here, with its evidence). Reading counts as documented-sourcing
when it's the exact upstream doc in play; do not promote a documented item
to measured without actually reproducing the behaviour in this repo.

Read on npm's and the action's documentation on 2026-08-18.

---

## 1. OIDC authenticates from a private repository; provenance does not

**Documented.** Source: `docs.npmjs.com/trusted-publishers`.

Trusted-publisher OIDC authentication has no repository-visibility
requirement — it works identically whether the calling repository is
private or public. Provenance generation is the part gated on visibility:
npm's registry only accepts provenance attestations built from a source
repository it can itself inspect, which means a public one. Conflating the
two is the most common mistake when reasoning about this mechanism; they are
independently gated.

## 2. Provenance is automatic with trusted publishing; `--provenance` is never needed

**Documented.** Same source.

When a publish authenticates via a trusted publisher, the registry attaches
provenance on its own, without the CLI flag. Passing `--provenance`
explicitly is redundant at best; on a private repository it is the flag
that already produced a hard failure once in this repo's history (`E422`
on the `v0.1.0` publish, before this migration) — see `docs/trusted-publishing.md`
for that measured finding.

## 3. Version floors: npm >= 11.5.1, Node >= 22.14.0

**Documented.** Same source.

An npm below 11.5.1 does not know how to request or present an OIDC token
and falls back to token-based authentication, which fails with an opaque
401 rather than a message naming the real cause. `release.yml`'s "npm CLI
guard" step exists specifically to turn that opaque failure into a named
one before the publish step runs.

## 4. What the trusted publisher matches, and the case-sensitivity and post-2026-05-20 rule

**Documented.** Same source.

A trusted publisher configuration pins four fields: organization,
repository, workflow **filename** (not job or step name), and an optional
environment. All four are compared case-sensitively — a casing mismatch on
any one of them is a silent rejection, not a warning. Configurations created
after 2026-05-20 must additionally select at least one allowed action (this
repo's configuration selects `npm publish`).

## 5. `workflow_dispatch` and `workflow_call` are documented mismatch risks

**Documented.** Same source.

npm's own documentation names these two trigger types as causes of trusted-
publisher validation mismatches. This is part of why the previous
`publish.yml` — deleted by this migration — is not simply ported forward
with a token swap: its `workflow_dispatch` escape hatch is exactly the kind
of trigger npm calls out, and release-please removes the need for that
manual path by making every publish follow from a merged release PR.

## 6. A `GITHUB_TOKEN` tag does not trigger other workflows — publish must share the file with release-please

**Documented.** Source: `github.com/googleapis/release-please-action`.

Tags (and any other ref/commit) created by a workflow's own `GITHUB_TOKEN`
do not trigger downstream workflow runs — a deliberate GitHub Actions
safeguard against runaway workflow chains. A release-please job that creates
a tag therefore cannot be followed by a _separate_, tag-triggered publish
workflow without either widening `GITHUB_TOKEN`'s scope or introducing a
Personal Access Token — reintroducing a long-lived credential. `release.yml`
avoids this by putting the publish job in the same file, gated on the
release job's `release_created` output, so both run inside the one `push`
event.

## 7. `docs:`/`ci:`/`chore:` commits bump nothing; force a release with `Release-As:`

**Documented.** Same source.

release-please derives the version bump from Conventional Commit types on
`main`: `feat:` bumps minor, `fix:` bumps patch, and `docs:`, `ci:`,
`chore:` and `refactor:` bump nothing at all — no release PR gets opened or
updated for them. A release consisting only of such commits (a documentation
fix, say) needs a `Release-As: X.Y.Z` footer on one of the commits to force
release-please to open a release PR anyway. Without it, the absence of a
release PR looks like the pipeline is broken when it is in fact behaving
exactly as documented.

## 8. Classic tokens revoked 2025-12-09; granular write tokens capped at 90 days

**Measured (this repo, 2026-08-19).** Source: the GitHub changelog entries
linked from `docs/superpowers/specs/2026-08-18-publishing-trust-and-going-public-design.md`.

npm revoked all classic tokens outright on 2025-12-09, and granular tokens
with write access (including the automation-typed, 2FA-bypassing token this
repo's previous `NPM_TOKEN` was) are capped at a 90-day maximum lifetime.
This is why the previous mechanism carried an expiry clock rather than a
mere deprecation warning: the token this repo used was never going to work
indefinitely, regardless of whether this migration happened.

## 9. The release PR needs a manual workflow approval, every time

**Measured (this repo, 2026-08-20).** Source: the `0.1.1` release run.

Workflow runs triggered by `github-actions[bot]`'s release PR arrive in
state `action_required`, not queued or running — GitHub withholds them
pending a human approval, the same gate it applies to first-time external
contributors. Until someone approves the run, the required `quality` check
never reports, and the branch ruleset that requires it blocks the merge: the
release PR simply sits there looking broken, with nothing in the PR itself
explaining why. Approving it: `gh api -X POST
repos/<org>/<repo>/actions/runs/<run_id>/approve`, or the "Approve and run"
button in the Actions UI. This is a per-release human step — it recurs on
every release, not just the first — and until this finding it was not
written down anywhere.

## 10. The `push` trigger on `ci.yml` does not cover the case it was built for

**Measured (this repo, 2026-08-20).** Source: runs observed on the release
branch during the `0.1.1` release.

The trigger was added on the premise that a pull request opened with
`GITHUB_TOKEN` does not trigger workflows, so a `push` trigger on
release-please's branches would produce the `quality` check that
`pull_request` could not. What was actually observed contradicts half of
that premise: the release PR's _creation_ did trigger `ci.yml`, through the
ordinary `pull_request` event — `GITHUB_TOKEN`'s restriction turned out not
to block that. But when the bot later _updates_ its own branch (pushing a
new commit onto an already-open release PR), nothing triggers at all: not
`pull_request` (no new PR is opened), and not this `push` trigger either,
because that update is also pushed with `GITHUB_TOKEN`. The trigger is
therefore a useful escape hatch for a human pushing to a matching branch
name, not the guarantee it was designed to provide — the actual guarantee
that the release PR's check eventually reports is finding 9's manual
workflow-run approval.

## 11. The release branch name carries a `--components--` suffix

**Measured (this repo, 2026-08-20).** Source: the branch name of the
`0.1.1` release PR.

The branch release-please opened was
`release-please--branches--main--components--pepito`, with a
`--components--pepito` suffix, even though this is a single-package
repository. A prior verification (2026-08-19, reading release-please's
`branch-name.js` source) had explicitly ruled the suffix out for a root
single-package setup. `ci.yml`'s `push` trigger glob (`release-please--**`)
still matches the longer name, so nothing broke — but the glob must not be
narrowed to the shorter form the earlier reading predicted, since the
suffix is real.

## 12. `workflow_dispatch` on `ci.yml` is deliberate, and asymmetric with the publishing workflow

**Measured (this repo, 2026-08-19–20).** Source: the trigger was used, as
designed, to re-run the quality gate on the release branch when it was left
with no reporting check.

`workflow_dispatch` on `ci.yml` exists to re-run the quality gate against an
arbitrary ref without fabricating a commit — the exact need that came up
when the release PR's checks were stuck pending approval (finding 9).
Removing it because the publishing workflow deliberately dropped the same
trigger type (finding 5, `docs/trusted-publishing.md` on `workflow_dispatch`
and `workflow_call` as npm's own documented trusted-publisher mismatch
risks) would be a category error: `ci.yml` publishes nothing, holds no
secret, and involves no OIDC identity, so its worst case from an arbitrary
dispatch is spent Actions minutes, and only users with write access can
dispatch it at all. On the publishing workflow the same trigger enters
npm's trusted-publisher claim validation, which is what makes it a risk
there and not here.
