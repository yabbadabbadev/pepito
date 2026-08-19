# Trusted publishing: why there is no secret any more

This document explains why publishing to npm from this repository no longer
depends on a stored credential, and what that mechanism actually replaces.
It is written to be reusable on another repository, not as a changelog entry
for this one — the workflow file and the config are the changelog; this is
the reasoning.

## The old shape

Until this change, publishing authenticated with a **granular npm automation
token**: a credential created by hand on npmjs.com, scoped to a package or a
scope, typed "automation" so it skips the interactive one-time-password
prompt a CI job cannot answer. It was stored as the `NPM_TOKEN` GitHub
secret and handed to `npm publish` through the `NODE_AUTH_TOKEN` environment
variable, which is the name npm's CLI reads by convention.

The properties that make that shape a liability have nothing to do with
whether the token was handled carefully:

- It is **long-lived** — it exists from the day it is created until someone
  remembers to rotate or revoke it, not for the duration of one publish.
- It **works from anywhere** — anyone who has it (or extracts it from a
  compromised runner, a leaked log, a misconfigured secret) can publish with
  it, from any machine, not just from this repository's CI.
- It is **only as strong as wherever it is stored** — a GitHub Actions
  secret is well protected, but the credential itself carries no memory of
  what's supposed to be allowed to use it.

None of that is a criticism of this repository's setup specifically; it is
what any static, bearer-token credential looks like, regardless of scope or
rotation discipline.

## What replaces it

**OIDC (OpenID Connect) trusted publishing.** Instead of a stored secret,
the GitHub Actions runner asks GitHub for a short-lived identity token that
describes the exact workflow run in progress: which repository, which
workflow file, which environment (if any), and which ref. npm compares those
claims against a "trusted publisher" configuration registered on the package
and accepts the publish only when every configured field matches.

The consequence is structural, not just a smaller attack surface:

- **Nothing long-lived exists to steal.** The identity token is minted for
  one job and expires with it. There is no `NPM_TOKEN` value sitting in a
  secrets store, waiting to be exfiltrated.
- **A stolen token is useless outside the run that minted it.** Even if an
  attacker captured the OIDC token mid-flight, it authenticates only as
  "this specific workflow run, from this specific repository" — it cannot be
  replayed from a different workflow, a different repository, or a laptop.
- Authentication moves from "possession of a secret" to "provable identity
  of the calling workflow."

That structural improvement is scoped to the credential itself, not to the
whole release path. `id-token: write` is granted only to the `publish` job,
so a compromised `release-please-action` run cannot read the OIDC token —
but that same action is what authors the release commit and tag that the
`publish` job then checks out, builds, and ships. A compromise there still
reaches the registry through a legitimate, correctly-authenticated publish
of tampered content. The environment's required reviewer is the only gate
standing between that release job and a real publish; trusted publishing
removes the stolen-token risk, it does not remove the need for that human
to actually look at what they are approving.

## What npm matches on

A trusted publisher configuration on npmjs.com pins four fields, and **all
four are case-sensitive**:

1. The GitHub **organization** (or user) name.
2. The **repository** name.
3. The **workflow filename** — not a job name, not a step name, the literal
   filename of the workflow YAML (for example `release.yml`).
4. An optional **environment** name (for example `npm-publish`), which adds
   a fifth layer of control: a GitHub Environment can require a human
   reviewer to approve the run before it proceeds, even though the workflow
   fired automatically.

Any mismatch on any field — a renamed workflow file, a repository transfer,
a typo in casing — makes npm reject the OIDC token outright. There is no
partial match.

## Why the publish step has to live in the same workflow file as the release step

A tag created using the workflow's own `GITHUB_TOKEN` (as release-please
does when it merges a release PR) does **not** trigger other workflows —
that's a deliberate GitHub Actions safeguard against infinite workflow
chains. A separate, tag-triggered publish workflow would therefore never
fire on its own; making it fire would require handing `GITHUB_TOKEN` a wider
scope or introducing a Personal Access Token, which reintroduces exactly the
kind of long-lived credential this migration removes.

The fix is structural: put the publish job in the **same** workflow file as
the release job, gated on the release job's own output (`release_created`).
The publish job then runs in the same `push` event that release-please
already reacts to, with no second trigger needed.

## The two floors

Trusted publishing requires:

- **npm >= 11.5.1**
- **Node >= 22.14.0**

An older npm attempts to authenticate the old way and fails with a 401 that
gives no hint about the real cause (there is no token to compare against,
because none was ever provided) — so it is worth asserting the npm version
explicitly in CI and failing loudly, rather than discovering the mismatch
from an opaque registry error.

## The distinction everyone gets wrong: OIDC vs. provenance

**OIDC authentication works from a private repository. Only provenance
generation requires a public one.** These are two separate things that get
conflated because trusted publishing usually enables both at once on a
public repository:

- OIDC authentication is what lets the workflow prove its identity to npm
  and publish at all. It has no visibility requirement.
- Provenance is a signed, publicly verifiable attestation that ties the
  published package back to the exact source commit and workflow run that
  built it. Generating it requires the source to be inspectable, which is
  why npm's registry rejects provenance attestations built from private
  repositories.

The practical implication: a private repository can adopt trusted
publishing today and drop its long-lived token immediately, without
waiting for the repository to go public. Provenance simply isn't part of
the publish yet, and arrives automatically — without any workflow change —
the day the repository is made public.

**With trusted publishing, provenance is automatic.** `--provenance` is
never passed as a flag; the registry attaches provenance on its own once
the publishing repository is public. Passing the flag explicitly is not
merely redundant — combined with a private repository it is the flag that
already once produced a hard rejection (`E422`) rather than a silent skip.

## Adopting this on another repository

1. **Configure the trusted publisher first**, on npmjs.com, with the exact
   organization, repository, workflow filename and (if used) environment
   that will do the publishing. A configuration created after 2026-05-20
   also requires selecting at least one allowed action (for example
   `npm publish`).
2. **Grant `id-token: write`** to the publish job specifically — not to the
   whole workflow — since that's the permission that lets the job request
   the OIDC token in the first place.
3. **Do not add a token.** No `NPM_TOKEN` secret, no `NODE_AUTH_TOKEN`
   environment variable, no `npm login`. Their mere presence in the
   workflow does not break trusted publishing, but their absence is the
   entire point.
4. **Prove one release before revoking the old token.** Keep the existing
   token secret in place until a real publish has gone through the new
   workflow successfully; only then revoke it. That order keeps a working
   fallback available for the one change that has no dry-run.

   This repository's own cutover cannot keep that fallback in the form
   above: `publish.yml` and its `workflow_dispatch` trigger are gone, so
   there is no token-authenticated workflow left to fall back to during the
   window between merging this change and proving the first OIDC publish.
   For that window, the fallback is manual — see "Emergency publish, until
   OIDC is proven" in `CONTRIBUTING.md` — a clean checkout, the same
   verification commands CI runs, and `npm publish` after an interactive
   `npm login`.
