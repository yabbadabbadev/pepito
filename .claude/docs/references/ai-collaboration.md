# AI-collaboration patterns, as they apply to this package

Distilled on 2026-08-17 by loading the `ai-patterns` skill (patterns for
AI-augmented development by Lada Kesseler, Llewellyn Falco, Ivett Ördög and
Nitsan Avni; the skill caches the collection at
`~/.cache/claude-skills/augmented-coding-patterns/documents/`, and its index
lives at `~/.claude/skills/ai-patterns/SKILL.md`). Read the source document
for a pattern before leaning on it — this file is a map of which patterns this
repo already runs on, not a replacement for them.

Only the patterns with a concrete counterpart here are listed. Each entry
states the pattern as the skill states it, then names the practice that
already implements it in this repo, so an agent can recognise the practice
instead of reinventing a worse version of it.

## Context management

**Ground rules** — "knowledge documents that auto-load when you open a
session... only your most important things", scoped user level and project
level. Here: `CLAUDE.md` at the repo root, and its "Non-negotiable rules"
section in particular (English everywhere; never commit on `main`; verify APIs
before writing against them; measured vs assumed stays labeled; the quality
harness; no brand references). The user-level half is `~/.claude/CLAUDE.md`.
Keep that section short — every line added there competes for attention with
the rest.

**Reference docs** — "on-demand knowledge documents. Load them only when you
need them for the current task", as opposed to always-loaded ground rules.
Here: this directory. `measured-foundations.md` before touching the event
listeners, the registry, the matchers or the storage cleanup;
`build-tooling.md` before touching the build; this file when setting up how to
work. `CLAUDE.md` deliberately keeps only the one-paragraph-per-boundary
architecture summary and points here for the evidence.

**Knowledge document / Extract knowledge** — "save important information to
markdown files"; "when you figure something out, explicitly ask AI to save it
to a file... save as you go, don't wait until the end of the session". Here
this is a rule, not a habit: _"Measured vs assumed stays labeled. Findings get
written down in `.claude/docs/references/` (agent-facing) or `docs/`
(user-facing) the moment they're made."_ The whole corpus behind
`measured-foundations.md` exists because that rule was followed during the
evaluation phase — those documents are the reason this package could be
designed at all instead of re-derived.

**Knowledge checkpoint** — "before attempting implementation, checkpoint the
plan... protect your time, not the code. Code changes are cheap to regenerate.
Your explanations and planning are expensive." Here: the spec and the plan are
committed artifacts —
`docs/superpowers/specs/2026-08-17-standalone-repo-design.md` and
`docs/superpowers/plans/2026-08-17-standalone-repo.md` — written and reviewed
before any file was moved, and the spec is the binding authority when a task
brief disagrees with it. A failed task is a `git reset`, not a redesign.

**Focused agent**, and its anti-pattern **Distracted agent** — "prefer single,
narrow responsibility on important tasks... small, focused agents > large,
scattered agents"; the distracted agent "doesn't feel broken - it often seems
to work fine", and ground rules get ignored even when explicitly stated. Here:
execution runs one task per fresh subagent with a written brief, and the
package's own architecture uses the same idea on code —
`src/msw-events.ts` is the only file that touches `worker.events`, so the
upstream API migration lands in one file. When a task starts sprawling, split
it; do not widen the agent.

## Reliability and verification

**Chain of small steps** — "break complex goals into small, focused,
verifiable steps... execute each step, verify it works, commit or save
progress after each step". Here: the plan's task list, plus TDD inside each
task. `CONTRIBUTING.md` makes the granularity auditable rather than claimed:
_"the PR must let the cycle show in the commits — writing the implementation
first and adding tests after, just to fill out the paperwork, doesn't count. A
test that has never failed proves nothing."_

**Offload deterministic** — "AI is bad at determinism. Code is good at it...
Don't ask AI to do deterministic work. Ask AI to write code that does it."
Here: never eyeball what a script already decides. `npm run lint`
(`--max-warnings 0`), `npm run format:check`, `npm run typecheck`,
`npm run coverage` (90/90 thresholds), and in `.github/workflows/` the CI job
that runs all four plus the publish job's tag-versus-`package.json` guard. The
same principle produced the Spanish sweep used as a migration check — a `grep`
over accents and common words, with the human-quality pass on top, because the
spec says mechanical grep alone is not proof.

**Feedback flip** — "flip from producing to evaluating: AI implements the
task; different AI (or same AI, refocused) gets task + code diff → 'find
problems and suggest improvements'; feed critique back... do this before
PR/code review". Here: the review between tasks, on the diff, before anything
reaches a human. The reviewer's job is to find problems, not to confirm the
task report.

**Playgrounds**, and its anti-pattern **Perfect recall fallacy** — "allow it
to experiment when it gets stuck... create an isolated playground folder where
AI can test library behaviours and discover constraints"; and do not expect
AI to remember library details, "let AI play and discover instead of expecting
it to remember". Here this is the origin story of the package: every finding
in `measured-foundations.md` came out of the evaluation repo's throwaway spike
and experiment directories, not out of recall. The rule it hardened into:
_"Verify APIs before writing against them. This stack moves fast; read
`node_modules/**/*.d.ts` or measure."_ Two findings — the `@vitest/expect`
augmentation and `request:match` not proving interception — are cases where
the documented, plausible, widely repeated answer is wrong here. Recall would
have produced both bugs.

**Unvalidated leaps** (anti-pattern) — "AI gets stuck because it's building on
unverified assumptions... each assumption becomes a foundation for the next
wrong step"; the fix is validating each step incrementally and using TDD as an
automatic micro-feedback loop. Here: the measured/reasoned labels exist for
exactly this. `snapshotAfterIdle`'s second observation is labeled reasoned
because this harness is too fast to measure the contended-CI scenario it
defends, and the mutation runs recorded next to it say which mutations a test
actually catches and which it does not. And when the mechanism itself cannot
tell: _"A meter that cannot measure must go red and carry its evidence"_ —
which is why `waitForNetworkIdle` times out with a dump of what was in flight
instead of hanging or passing quietly.

## Steering

**Active partner** — "explicitly grant permission and encourage AI to push
back on unclear instructions, challenge assumptions that seem wrong, flag
contradictions and impossibilities... AI defaults to silent compliance, even
when instructions don't make sense." Here: the migration plan's Global
Constraints say _"Any real defect found goes to the review loop, not silent
fixing"_ — a defect you were not asked about is still yours to raise. And the
commit rule goes further than pushing back: even if a commit on `main` is
approved in conversation, the correct move is to propose a branch first.

**Check alignment** — "before letting AI implement, make it show its
understanding... force it to be very succinct". Here: `brainstorming` before
designing anything new and `writing-plans` before implementing, both named in
`CLAUDE.md`'s workflow section; and the written artifact to check that
understanding against, which the migration plan names outright: _"The spec's
Decisions section governs every ambiguity."_ When a task's instructions and
the spec pull apart, the spec wins — and the divergence is worth saying out
loud rather than resolving quietly.

**Hooks**, against the obstacle **Selective hearing** — hooks "hook into
deterministic points in the agent lifecycle... allow for flexible and reliable
correction of behaviors", and they are the answer to instructions AI filters
out no matter how they are marked ("no amount of CAPS, **bold**, or
'IMPORTANT!!!' will override AI's attention filters"). Here: the rule against
committing on `main` is not trusted to prose — a `PreToolUse` hook in the user's
`~/.claude/settings.json` blocks the commit when the branch is `main` or
`master`. If the hook fires, the fix is a work branch, never a way around the
hook. Anything that must hold every single time belongs in a hook or a CI
gate, not only in a rule.

**Reminders** — "AI has recency bias... force attention on what matters
through repetition and structure. Make compliance structural, not optional",
via TODO checkboxes and the instruction sandwich. Here: the plan's per-task
checkboxes and the briefs' explicit verification steps, plus `CLAUDE.md`'s
`verification-before-completion` line — _command plus output, never
intention_. Claiming green without pasting the output is the failure this
pattern exists to prevent.

## Anti-patterns this repo actively guards against

**AI slop** — "using AI output without adding human judgment or value... the
slop test: could anyone with your prompt get the same result? That's probably
slop." Here: the four code smells that are not accepted, listed in `CLAUDE.md`
and `CONTRIBUTING.md` — comments that restate the code instead of explaining
the why, generic names (`data`, `result`, `handler`), just-in-case abstraction
with no real use case, and suspicious uniformity (empty sections, cloned files
with no content of their own). The failure messages are held to the same bar:
they are product, composed only in `failure-messages.ts` and pinned by tests,
so generic wording is a test failure and not a matter of taste.

**Distracted agent** and **Perfect recall fallacy**: covered above, next to
the patterns that answer them.

## What this file is not

It is not a process to follow instead of the repo's workflow. The workflow is
`superpowers` (`brainstorming`, `writing-plans`,
`subagent-driven-development`, `verification-before-completion`); these
patterns explain _why_ those steps are shaped the way they are, and give the
vocabulary to notice when a session has drifted out of one of them.
