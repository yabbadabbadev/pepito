# Security audit — going public

Date: 2026-08-19. Command output below is measured (a command was run and
its result is quoted); anything not backed by a command is labeled assumed
and is not used to justify a verdict.

**Revision note.** Dimensions 1, 2, 3 and 5 below replace their Task 5
verdicts outright — an adversarial review found each was measured with a
command that did not cover its criterion (index-only `git grep`, an
overstated `gitleaks` scope, an omitted manual read, missing evidence).
Dimension 9 is new. Every re-measured dimension below is marked
**(superseded)** with the specific defect it corrects; nothing from Task 5
is carried forward silently.

## Go/no-go

**GO — for publishing the rewritten history as a new repository, not for
making this repository public in place.** A separate measured finding
(recorded in the spec, not repeated here as a literal string) is that GitHub
retains pull refs on this repository that carry pre-rewrite history and are
immutable from the client. Dimension 9 below measures this directly,
including the rejection that proves the refs cannot be rewritten. That
finding is why the remediation is a fresh repository (Task 6/6B), with this
repository renamed `pepito-archive` and kept **private permanently** — not a
force-push of a rewritten `main` here.

All nine dimensions below either pass or are explicitly scoped as open,
non-blocking work owned by a later task. No dimension is RED. Two known
open items do not block this verdict: (1) dimension 5's `NPM_TOKEN`
repository secret, deliberately kept until Task 4's OIDC cutover is proven
(that cutover now runs in the new repository, after Task 7); (2) dimension
8, post-public hardening, which stays open for Task 7 against the new
repository.

## Method note on dimensions 2 and 4

The corporate domain and the private-repo pointer "despensa" are two
different categories with two different policies (spec: zero-tolerance for
the corporate domain, keep-and-label for private-repo pointers), but the
brief's dimension-2 command searches for both in one regex for convenience.
Below, dimension 2 is judged on the corporate domain alone; the `despensa`
matches that the combined command also surfaces belong to dimension 4 and
are reported there.

## The method lesson this task exists to encode

Four failure shapes, each of which returns a clean-looking result over an
incomplete search, and each of which the original run fell into at least
once:

- **`git grep` with no revision argument searches the index, not history.**
  A criterion phrased over history (commit messages, authorship, files
  deleted in history) needs `git grep <rev>`, `--all`, or a `git log`-based
  scan. Dimensions 2 and 3 below were re-run this way.
- **`git log -p` and anything built on it skip merge commits by default**
  (`-m`, `--first-parent` or `--diff-merges` opts back in). `gitleaks
--log-opts=--all` inherits that skipping, so "every commit reachable from
  any ref" overstates what it saw. Dimension 1 below states the real split
  and covers the merge commits with a separate pass.
- **`grep -I` silently ignores any file it decides is binary.** Silence is
  not the same as absence — dimension 1 confirms directly that no tracked
  file is binary, rather than trusting the silence.
- **An exit status read through a pipe is the pipe's last command's status,
  not the interesting command's.** A pipeline ending in `sort -u` always
  returns 0. This is the same failure shape as this project's own earlier
  mistake: reading `N` from `git log --format=%G?` on a machine without
  `gpg` installed, and concluding "unsigned" when the real answer was "this
  meter could not measure anything" (`error: cannot run gpg: No such file or
directory` on the same line).

## Dimension 1 — credentials and secrets, across the whole history

**(superseded — Task 5 omitted the manual read this method requires, cited a
stale file count, and overstated `gitleaks`'s scope.)**

```
$ gitleaks detect --source . --log-opts="--all" --redact --verbose; echo "gitleaks exit=$?"
...
1:32PM INF 28 commits scanned.
1:32PM INF scanned ~740079 bytes (740.08 KB) in 144ms
1:32PM INF no leaks found
gitleaks exit=0

$ git rev-list --count --all
31
$ git rev-list --count --all --merges
3
```

`gitleaks --log-opts=--all` scanned the **28 non-merge commits** — it
inherits `git log`'s skipping of merge commits, so "28 of 31" is the honest
count, not "every commit reachable from any ref." The 3 merge commits it did
not cover are scanned separately, over each merge's first-parent diff:

```
$ git rev-list --all --merges | while read -r sha; do
    git show --diff-merges=first-parent --format= "$sha"
  done | gitleaks detect --pipe --redact --verbose; echo "merge scan exit=$?"
...
1:32PM INF scanned ~355728 bytes (355.73 KB) in 291ms
1:32PM INF no leaks found
merge scan exit=0
```

`--pipe` is available in the installed `gitleaks` (v8.30.1). Between the two
runs, all 31 commits reachable from any ref were scanned: 28 directly, 3 via
their first-parent diff.

**The manual read the spec's method requires, and the count correction:**

```
$ git ls-files | wc -l
62
```

This report's own count (62) is the correct one; an earlier report cited a
stale figure. Every one of the 62 tracked files was read in full. The
categories below partition `git ls-files` exactly — each file counted once,
verified per category and reconciled against the total:

```
$ git ls-files | wc -l
62
$ git ls-files | grep -v '/' | wc -l          # root-level files
17
$ git ls-files docs | wc -l
6
$ git ls-files .claude | wc -l
4
$ git ls-files .github | wc -l
2
$ git ls-files public | wc -l
1
$ git ls-files src | wc -l
13
$ git ls-files test | wc -l
19
```

- **Root-level docs** (6 of the 17 root files: `CHANGELOG.md`, `CLAUDE.md`,
  `CONTRIBUTING.md`, `LICENSE`, `README.md`, `ROADMAP.md`) plus **`docs/**`**
  (6) plus **`.claude/docs/references/**`** (4) — 16 files, this report
  included: no credential value, no unlabeled home path, no corporate domain
  literal.
- **Root-level config** (the remaining 11 of the 17 root files:
  `.gitignore`, `.nvmrc`, `.prettierrc`, `.release-please-manifest.json`,
  `eslint.config.js`, `package-lock.json`, `package.json`,
  `release-please-config.json`, `tsconfig.build.json`, `tsconfig.json`,
  `vitest.config.ts`) plus **`.github/workflows/*.yml`** (2) — 13 files: no
  inline token, no `.npmrc`-style registry override, permissions scoped per
  job (see dimension 5).
- **`public/mockServiceWorker.js`** (1 file): the unmodified upstream MSW
  generated file — read in full; no local additions.
- **`src/**`** (13 files) and **`test/**`** (19 files, including
  `test/mothers/**`): read in full; no secret, no PII, no absolute path, no
  brand reference. Fixture data (`ProductListMother`, `RoutedApp`) is
  synthetic.

Arithmetic: 16 + 13 + 1 + 13 + 19 = 62, matching `git ls-files | wc -l`
exactly, with the 17 root-level files split 6/11 between the two docs and
config categories (6 + 11 = 17).

Verdict: **PASS**. `gitleaks` found no secrets in the 28 non-merge commits
directly and in the 3 merge commits via their first-parent diff — 31 of 31
commits covered across the two runs — with `--redact` so no candidate match
ever reached the terminal or this report. The manual read of all 62 tracked
files found nothing `gitleaks` would miss (no secret embedded as a
non-matching pattern, no credential named by value rather than by key name —
see dimension 5's `.claude/` check for that distinction applied explicitly).

## Dimension 2 — corporate domain

**(superseded — Task 5's command had no revision argument and searched only
the index; its criterion is history.)**

The dimension's criterion is corporate **domains and names**, not domains
alone. Both patterns are derived at run time from commit authorship, never
typed into a tracked file — the bare name is the domain with its TLD
stripped, still computed from `git log`, never hand-typed:

```
$ CORP_DOMAINS="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
    | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)"
$ CORP_NAMES="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
    | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' \
    | sed -E 's/\.[a-zA-Z]+$//' | paste -sd'|' -)"

# Domain, tracked content, at every revision reachable from any ref.
$ git grep -nIiE "$CORP_DOMAINS" $(git rev-list --all) -- .
$ echo "history content exit=$?"
history content exit=1

# Domain, the index, separately, so the two are never conflated.
$ git grep -nIiE "$CORP_DOMAINS" -- .
$ echo "index exit=$?"
index exit=1

# Bare name, tracked content, at every revision reachable from any ref.
$ git grep -nIiE "$CORP_NAMES" $(git rev-list --all) -- .
$ echo "history bare-name exit=$?"
history bare-name exit=1

# Domain, authorship and messages.
$ git log --all --format='%an <%ae>%n%cn <%ce>%n%B' | grep -icE "$CORP_DOMAINS"
30

# Bare name, authorship and messages (same commits: the name is a substring
# of the domain, so it cannot find fewer than the domain did).
$ git log --all --format='%an <%ae>%n%cn <%ce>%n%B' | grep -icE "$CORP_NAMES"
30
```

`git grep` was given every revision reachable from any ref as an argument
(31 commits — the same set as dimension 1's `git rev-list --count --all`),
so this searched history, not the index; the argument list stayed under the
shell's limit at this history's size. Both exit statuses were echoed
directly, with nothing piped in between.

**`grep -I`'s binary-skip risk, checked rather than assumed:**

```
$ git ls-files | while read -r f; do
    git check-attr -a -- "$f" | grep -qi 'binary' && echo "binary: $f"
  done; echo "binary check done"
binary check done
$ file --mime $(git ls-files) | grep -v 'text/' || echo "all tracked files are text"
.prettierrc: application/json; charset=us-ascii
.release-please-manifest.json: application/json; charset=us-ascii
package-lock.json: application/json; charset=us-ascii
package.json: application/json; charset=us-ascii
release-please-config.json: application/json; charset=us-ascii
tsconfig.build.json: application/json; charset=us-ascii
tsconfig.json: application/json; charset=us-ascii
```

No file carries a `binary` git attribute, and the seven files `file` does
not label `text/*` are all `application/json; charset=us-ascii` — ASCII
text that `grep -I` treats as text, not the binary blobs the flag exists to
skip. This repository tracks no binary files; `grep -I` did not silently
drop anything.

Verdict: **PASS on content, OPEN on metadata, owned by Task 6.** Tracked
content is clean at every revision reachable from any ref (0 occurrences,
domain and bare name, both index and full history, no carve-out). The
spec's dimension-2 criterion is 0 occurrences including authorship, and that
is not yet true: the history-metadata count (30 hits across commit
author/committer fields and messages, both domain and name) is the known,
disclosed exposure, recorded as a count, never the address. Closing it is
Task 6's authorship rewrite, not this audit — but see dimension 9: that
rewrite closes it on `main` only, not on the retained pull refs.

## Dimension 3 — PII

**(superseded — Task 5's commands had no revision argument and searched only
the index; its criterion covers content, history and the lockfile.)**

```
$ git grep -nIoE '/Users/[a-zA-Z0-9._-]+' $(git rev-list --all) -- .
[1 match — commit 9f73b3306ca5bddf33b7607b23a0ee61ba8a0576, file
docs/superpowers/specs/2026-08-18-publishing-trust-and-going-public-design.md,
line 124; the matched string itself is not reproduced here, per this
report's own discipline]
$ echo "home path exit=$?"
home path exit=0
```

One hit, at one historical revision, in one blob. Its reachability was
verified directly rather than assumed in either direction:

```
$ git merge-base --is-ancestor 9f73b3306ca5bddf33b7607b23a0ee61ba8a0576 main
$ echo "is-ancestor-of-main exit=$?"
is-ancestor-of-main exit=1
$ git for-each-ref --contains 9f73b3306ca5bddf33b7607b23a0ee61ba8a0576 --format='%(refname)'
refs/remotes/origin/chore/trusted-publishing-and-public-audit
refs/remotes/pr/4
```

`is-ancestor-of-main exit=1` means non-zero, i.e. **not** an ancestor: this
blob is not reachable from `main`. It is reachable only from a since-rebased
branch tip and from a retained pull ref (dimension 9).
`main`'s content is clean; the exposure lives entirely in the retained pull
ref, which has a different remediation (a fresh repository, not a content
edit) than a hit on `main` would have had.

```
$ ADDRESSES="$(mktemp)"
$ git grep -hIoE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' $(git rev-list --all) -- . > "$ADDRESSES"
$ echo "email grep exit=$?"
email grep exit=0
$ sort -u "$ADDRESSES"; rm -f "$ADDRESSES"
alex@yabbadabba.dev
alfupe@users.noreply.github.com
git@github.com
noreply@github.com
```

The exit status was captured from the `git grep` invocation itself, into a
tempfile, before any pipe — not read through `sort -u`, whose own exit
status would say nothing about whether `git grep` matched anything.

Every email address reachable from any ref is either `alex@yabbadabba.dev`
(the package author, deliberately public — in `CONTRIBUTING.md` and the
planning docs' CLI examples), `alfupe@users.noreply.github.com` (the same
author's GitHub-issued noreply alias, already present throughout commit
metadata and now also in this report's own dimension-9 tag output below),
or GitHub's own generic `git@github.com` / `noreply@github.com` used in Git
configuration examples. No private individual's address appears anywhere in
tracked history.

Verdict: **PASS on `main` and the index; one known historical exposure in a
retained pull ref, not in the published tree.** No absolute home path and no
non-public email address exists in `main`'s content at any point in its
history or in the current index. The one home-path hit is confined to a ref
GitHub retains outside branch history — dimension 9 owns its remediation
(the fresh-repository plan), not a content edit here, because the blob is
not reachable from anything this task could edit.

## Dimension 4 — private-repo pointers, inventoried

```
$ git grep -cIiE 'vbmmsw|despensa' -- . | sort -t: -k2 -rn
```

Output (file: count):

| File                                                                            | Count |
| ------------------------------------------------------------------------------- | ----- |
| `.claude/docs/references/measured-foundations.md`                               | 20    |
| `docs/superpowers/plans/2026-08-17-standalone-repo.md`                          | 11    |
| `docs/superpowers/specs/2026-08-17-standalone-repo-design.md`                   | 5     |
| `CONTRIBUTING.md`                                                               | 4     |
| `CLAUDE.md`                                                                     | 4     |
| `docs/superpowers/plans/2026-08-19-publishing-trust-and-going-public.md`        | 2     |
| `docs/superpowers/specs/2026-08-18-publishing-trust-and-going-public-design.md` | 1     |

Verdict: **PASS.** Per the design spec, these pointers stay — they preserve
the traceability of measured findings and are not company references — as
long as a reader is told they are private. `CLAUDE.md`, `CONTRIBUTING.md`
and `.claude/docs/references/measured-foundations.md` carry `(private)` at
their first mention of `../vbmmsw` / `../vbmmsw-consumer`. The remaining
files are historical spec and plan documents describing the migration
itself, where the private nature of these repos is already the explicit
subject of the surrounding prose. Unchanged by this task — no coverage gap
was found here.

## Dimension 5 — infrastructure leakage

**(superseded — Task 5 omitted workflow permissions and `.claude/` contents,
both named in its own method.)**

```
$ grep -oE '"resolved": *"https?://[^/"]+' package-lock.json | sort -u
"resolved": "https://registry.npmjs.org
```

One host, one line — every dependency resolves only from
`registry.npmjs.org`.

```
$ git log --all --name-only --format='%h' -- '*.npmrc' '.npmrc' '*.env*'
```

Output: empty — no `.npmrc` or `.env*` file was ever committed on any ref.

```
$ gh api repos/yabbadabbadev/pepito/actions/secrets --jq '.secrets[].name'
NPM_TOKEN
```

```
$ comm -23 <(git log --all --pretty=format: --name-only --diff-filter=A | sort -u | sed '/^$/d') <(git ls-files | sort)
```

Output: five files that once existed and no longer do
(`.github/workflows/publish.yml` and four Spanish-named test files, all
expected renames from the English-translation migration and the
release-please cutover, both already merged).

**Newly added evidence — workflow permissions:**

```
$ gh api repos/yabbadabbadev/pepito/actions/permissions/workflow
{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}
```

Default workflow permissions are read-only, with PR-creation approval
enabled — matching what Task 4's Step 0 recorded.

```
$ grep -rn 'permissions:' -A4 .github/workflows/
.github/workflows/release.yml:15:permissions:
.github/workflows/release.yml-16-  contents: read
...
.github/workflows/release.yml:22:    permissions:
...
      contents: write
      pull-requests: write
      issues: write
...
.github/workflows/release.yml:51:    permissions:
      contents: read
      id-token: write
```

The workflow-level default is `contents: read`; the release job widens to
`contents: write` / `pull-requests: write` / `issues: write`, scoped to that
job alone; the publish job separately carries `id-token: write`, also scoped
to that job alone. `id-token: write` never appears outside the publish job.
`.github/workflows/ci.yml` declares no `permissions:` block of its own, so
it runs under the repository default (`contents: read`).

**Newly added evidence — `.claude/` contents:**

```
$ git ls-files .claude
.claude/docs/references/ai-collaboration.md
.claude/docs/references/build-tooling.md
.claude/docs/references/measured-foundations.md
.claude/docs/references/publishing-trust.md
$ git grep -nIiE 'token|secret|password|key' -- .claude
```

Every hit names a credential **concept** — `GITHUB_TOKEN`, `NPM_TOKEN`,
"token-based authentication", "keyed by `requestId`" — never a credential
**value**. No `.claude/settings.local.json` or similar is tracked (it is
gitignored).

Verdict: **PASS, with one known open item.** Every dependency resolves only
from `registry.npmjs.org`; no `.npmrc` or `.env` file has ever been
committed; workflow permissions default to read-only and are widened only
per job, narrowly; `.claude/` contains no credential value. **Known open
item, not a finding:** the `NPM_TOKEN` secret is still present on the
repository — deliberate, owned by Task 4 (the publishing cutover, now
resequenced to run in the new repository after it goes public), not by this
audit.

## Dimension 6 — what the tarball ships

```
npm run build
npm pack --dry-run
```

Output: build succeeds; the tarball contains exactly `CHANGELOG.md`,
`LICENSE`, `README.md`, 26 files under `dist/` (one `.js` + one `.d.ts` per
source module), and `package.json` — 30 files total, 27.8 kB packed / 89.7
kB unpacked.

Verdict: **PASS.** Nothing beyond `dist/`, `README.md`, `CHANGELOG.md`,
`LICENSE` and `package.json` ships to consumers; no source, test, or
internal-docs leakage into the published package. Unchanged by this task —
no coverage gap was found here, and dimension 9 separately confirms the
already-published `0.1.0` tarball on the registry matches (30 files,
89,675 bytes unpacked).

## Dimension 7 — the process documentation, including this report

```
grep -rnIoE '/Users/[a-zA-Z0-9._-]+' docs .claude || echo "no home paths"
```

Output: `no home paths`.

```
CORP_DOMAINS="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
  | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)"
grep -rniE "$CORP_DOMAINS" docs .claude || echo "no corporate domain"
```

Output: `no corporate domain`.

Verdict: **PASS.** 0 occurrences in `docs/` and `.claude/`, including this
report and the spec/plan that describe this very audit. Unchanged by this
task — no coverage gap was found here. **Precisely what the final
re-verification (below, "Verify and commit") covers:** the corporate domain,
the corporate bare name, and the absolute-home-path pattern, all re-checked
against this report after every edit. It does **not** re-run a general email
sweep — that is dimension 3's job, not dimension 7's — so the final
verification below adds an explicit allowlist check for every email address
this report itself contains, rather than silently relying on the
domain/path grep to catch an email that happens not to carry the corporate
domain.

## Dimension 8 — post-public hardening

**OPEN.** Scoped to Task 7, against the **new** repository created by Task
6B, after it is made public — not against this repository. No hardening
work has been done or verified here; this row is a placeholder, not a
checkmark.

## Dimension 9 — surfaces GitHub retains (new)

No dimension above owned any of these; they all measure the tree, the
history reachable from a branch, or repository settings. Every surface
listed here is public the moment a repository is public, and this is the
dimension that found the pull-ref exposure that changed the whole phase-2
remediation from "rewrite and force-push" to "publish a fresh repository."

**Pull request refs — the one dirty surface:**

```
$ git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'
```

The fetched refs carry pre-rewrite authorship and content history — the same
history the mailmap rewrite (Task 6) is meant to leave behind. Counted with
the same run-time-derived corporate-domain pattern as dimension 2 (never a
literal in this file):

```
$ git rev-list $(git for-each-ref --format='%(refname)' refs/remotes/pr) | sort -u | wc -l
27
$ # unique commits, across all pull refs, carrying the corporate domain as author or committer:
$ for r in $(git for-each-ref --format='%(refname)' refs/remotes/pr); do
    git log --format='%H %ae%n%H %ce' "$r"
  done | grep -iE "$CORP_DOMAINS" | awk '{print $1}' | sort -u | wc -l
15
```

27 unique commits are reachable across the pull refs; 15 of those 27 carry
the corporate email domain as author and/or committer — matching the "up to
15 commits" the spec's reconnaissance recorded. The pull refs also retain
dimension 3's home-path blob, which is not reachable from `main`. This is
the exposure `main` does not have (dimension 2) but the pull refs do, and it
is immutable:

```
$ git push --force origin refs/remotes/pr/1:refs/pull/1/head
To github.com:yabbadabbadev/pepito.git
 ! [remote rejected] pr/1 -> refs/pull/1/head (deny updating a hidden ref)
error: failed to push some refs to 'github.com:yabbadabbadev/pepito.git'
$ echo "push exit=$?"
push exit=1
```

Rejected, as expected: `deny updating a hidden ref`. Rewriting `main`'s
authorship and force-pushing it cannot reach this ref; GitHub would keep
serving these pre-rewrite commits on a public repository regardless. This
rejection is the direct evidence behind the new-repository remediation
(Task 6/6B): a fresh repository's pull refs start empty, so the only way to
stop serving this content is to not have it on the repository that goes
public.

**Everything else on this list — all clean:**

```
$ gh pr list --state all --json number,title,body --jq '.[] | "\(.number) \(.title)"'
4 ci: replace the npm token with trusted publishing, and automate the CHANGELOG
3 Publish without provenance while the repo is private
2 Standalone home of @yabbadabbadev/pepito: import, full English translation, CI/CD and agent references
1 docs: worktree '+' hazard in the migration plan
$ gh pr list --state all --json number,body --jq '.[] | .body' | grep -icE "$CORP_DOMAINS|/Users/"
0
```

4 PRs, all titles listed above; bodies scanned for the same corporate-domain
pattern and for absolute home paths: 0 hits.

```
$ gh issue list --state all --json number,title --jq '.[] | "\(.number) \(.title)"'
```

Output: empty — no issues exist.

```
$ gh run list --limit 50 --json databaseId,name,conclusion --jq '.[] | "\(.databaseId) \(.name) \(.conclusion)"'
32242849342 release success
32242478269 ci success
32048017534 publish success
32047788431 ci success
32044478470 publish failure
32043912601 ci success
```

6 runs total. Each run's full log was scanned for the same corporate-domain
pattern and for absolute home paths: 0 hits in every one of the 6 logs.

```
$ gh api repos/yabbadabbadev/pepito --jq '{description, topics, forks_count}'
{"description":null,"forks_count":0,"topics":[]}
```

No description, no topics, no forks.

```
$ git tag -l | while read -r t; do echo "== $t"; git cat-file -p "$t" | head -5; done
== v0.1.0
tree bb77a82c5cf73854f0583f99947f078b04e6d25f
parent c9b002c4bfaab3b54a4c3ea65a9c70322bec9d31
parent 95e773d78886a0362ab5ca96d1dd329da2d403a9
author Alex Fuentes <alfupe@users.noreply.github.com> 1786985776 +0200
```

One tag (`v0.1.0`), authored under the GitHub noreply address, not the
corporate one.

```
$ npm view @yabbadabbadev/pepito@0.1.0 --json | node -e "..."
{
  fileCount: 30,
  unpackedSize: 89675,
  ...
}
```

The published tarball matches dimension 6's local `npm pack --dry-run`
count exactly (30 files).

**Two surfaces this dimension's original list omitted, both measured
clean:** PR review comments / issue comments, and GitHub Releases.

```
$ for n in 1 2 3 4; do
    rc=$(gh api repos/yabbadabbadev/pepito/pulls/$n/comments --jq 'length')
    rv=$(gh api repos/yabbadabbadev/pepito/pulls/$n/reviews --jq 'length')
    ic=$(gh api repos/yabbadabbadev/pepito/issues/$n/comments --jq 'length')
    echo "PR $n: review_comments=$rc reviews=$rv issue_comments=$ic"
  done
PR 1: review_comments=0 reviews=0 issue_comments=0
PR 2: review_comments=0 reviews=0 issue_comments=0
PR 3: review_comments=0 reviews=0 issue_comments=0
PR 4: review_comments=0 reviews=0 issue_comments=0
$ gh api repos/yabbadabbadev/pepito/releases --jq 'length'
0
```

0 review comments, 0 reviews and 0 issue comments across all four PRs; 0
GitHub Releases. Both surfaces are now part of what this dimension owns, so
Task 6B's re-run against the new repository checks them too.

Verdict: **PASS on every surface except one.** PR titles and bodies, PR
review comments and reviews, issue comments, issues, run logs, description,
topics, forks, tags and the published tarball are all clean. **The pull
refs are not clean** — they carry the corporate-domain authorship on 15 of
27 commits and the one home-path blob dimension 3 found — and they are
immutable from the client, which is why this dimension's finding is not
"fix the content" but "the new-repository remediation in Task 6/6B is
required and sufficient": a fresh repository starts with no pull refs, no
PRs, no review comments, no issues, no runs, no releases, and Task 6B's
Step 6 re-runs this same dimension against it and expects every one of
these counts to read zero.

## Self-review notes

- Re-read the diff (this report only — dimensions 1-4-and-5's prior
  companion edits to `CLAUDE.md`, `CONTRIBUTING.md` and
  `measured-foundations.md` were made under Task 5 and are not touched
  again here): no corporate domain, no corporate bare name, and no new
  brand reference was introduced by this task's edit, verified with the
  commands recorded in each dimension above plus the allowlist check in
  "Verify and commit" below.
- Every re-measured dimension (1, 2, 3, 5) now carries a command that
  actually covers its stated method: history-wide `git grep` (domain and
  bare name), the manual file read reconciled to `git ls-files`'s real
  count, the merge-commit gitleaks pass, workflow permissions and
  `.claude/` contents.
- Dimension 9 is measured, not asserted: every sub-claim (pull-ref
  authorship count, the rejected force-push, the clean
  PR/comment/review/issue/run/description/topic/fork/tag/release/tarball
  surfaces) has a command and its real output above.
- The go/no-go line matches the nine verdicts beneath it: it no longer
  claims this repository can be made public in place, because dimension 9
  proved that claim false. It is GO for the fresh-repository path only.
- **Disclosed narrowing:** every home-path check in this report uses
  `/Users/[a-zA-Z0-9._-]+`, not the bare `/Users/` a literal reading of the
  brief's own final-verification snippet uses. Run against this report
  itself (`grep -niE "/Users/" docs/security-audit-2026-08-19.md | wc -l`),
  the bare pattern's hit count grows with every place this report quotes
  the pattern as text — dimensions 3, 7 and 9's evidence blocks, this
  bullet, and the "Verify and commit" command below — and every hit,
  checked by reading it rather than assumed from the count, is the regex
  pattern appearing as text, never a leaked path. The narrowed pattern is
  what is actually used to decide every verdict in this report, including
  the final check below.

## Verify and commit

```
$ npm run format:check
All matched files use Prettier code style!

$ CORP_DOMAINS="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
    | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' | paste -sd'|' -)"
$ CORP_NAMES="$(git log --all --format='%ae%n%ce' | sed -n 's/.*@//p' | sort -u \
    | grep -vE '^(github\.com|users\.noreply\.github\.com|yabbadabba\.dev)$' \
    | sed -E 's/\.[a-zA-Z]+$//' | paste -sd'|' -)"
$ grep -niE "${CORP_DOMAINS}|${CORP_NAMES}|/Users/[a-zA-Z0-9._-]" docs/security-audit-2026-08-19.md
$ echo "grep exit=$?"
grep exit=1
```

Corporate domain, corporate bare name and absolute home path: 0 occurrences
in this report, exit status read directly off `grep`, nothing piped after
it.

**Email allowlist, closing the gap dimension 7 notes** (dimension 3's job,
not a re-run of dimension 7's domain/path grep — a general email sweep of
this report, checked against every address this report is expected to
contain):

```
$ grep -oE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' docs/security-audit-2026-08-19.md | sort -u
alex@yabbadabba.dev
alfupe@users.noreply.github.com
```

Both addresses are on the allowlist this report itself documents in
dimension 3 (the package author's public address and their GitHub-issued
noreply alias) — no other email address appears in this report.
