# Measured foundations

Load this before changing anything in `src/msw-events.ts`,
`src/traffic-registry.ts`, `src/matchers.ts`, `src/matcher-types.ts`,
`src/failure-messages.ts`, `src/storage-cleanup.ts` or `src/mount.ts`. Every
mechanism there is a consequence of something measured, and several of the
findings are counter-intuitive enough that an agent reasoning from first
principles will "fix" the code back into a bug.

**Provenance.** The full write-ups live in the evaluation repo this package
was extracted from (`../vbmmsw`, private), in Spanish, under
`../vbmmsw/docs/knowledge/`. Those files survive the migration, so the
pointers stay valid; the Spanish filenames are the real filenames and are
not translated. This file is a distillation for iterating pepito, not a
translation of that corpus — go to the source when you need the
reproduction command, the raw table or the test that pins the behaviour.
Every `../vbmmsw/docs/knowledge/...` pointer below refers to that same
private repository.

**Labels.** Each finding is marked **measured** (observed, with its numbers)
or **reasoned** (derived from the mechanism, never observed in this harness).
The label is part of the finding: do not promote a reasoned item to measured
without taking the measurement, and do not drop the numbers when editing.
Reading counts as measuring when the artifact read is the exact one in play
— the installed `.d.ts` of the dependency version this package runs
against, say — because that reading observes the real thing, not an
inference about it; reading unrelated source to guess at behaviour that was
never run or reproduced here stays reasoned.

Measured on `msw@2.15.0`, `vitest@4.1.10`, Chromium headless via Playwright,
in local. Millisecond figures are indicative of one machine; the orderings
and the closure results are the robust part.

---

## 1. The request body only exists inside the `request:start` window

**Measured.** Source: `../vbmmsw/docs/knowledge/msw-browser-mode.md`.

Listening on `request:match` to record the body fails: by the time it is
emitted, MSW's handler has already read the stream and `request.clone()`
throws `TypeError: Failed to execute 'clone' on 'Request': Request body is
already used`. The stream cannot be recovered afterwards.

The only viable pattern, and the reason `msw-events.ts` looks the way it
does:

1. Listen on `request:start`, emitted **before** the handlers run.
2. Call `.clone()` **without yielding control** — no `await` before it. That
   is the only window in which the body is alive.
3. Store the body **promise** (`clone.json()`), unawaited, keyed by
   `requestId`. Awaiting it inside the listener would make the listener
   `async`, which reintroduces the problem.
4. `.catch(() => undefined)` on that promise, so a GET without a body does
   not leave a rejected promise that Vitest reports as an unhandled
   rejection.
5. Resolve the bodies at assertion time, off the interceptor's critical
   path.

Also measured: **if an `async` listener's promise rejects, the following
events are lost.** The symptom is a traffic log containing only the first
request.

Why the registry is keyed by `requestId` and not by `method + path`: the
content comes from the early phase and the verdict from the late one, and
`requestId` is what stitches the two halves. Two identical POSTs to the same
path are separate entries — which is what makes counting free.

Listeners must be subscribed **before** `worker.start()`: `start()` is the
first thing that can generate traffic.

## 2. `request:match` does not prove the request was intercepted

**Measured.** Source: `../vbmmsw/docs/knowledge/msw-browser-mode.md`.

The most dangerous gotcha of the set, because it produces silent false
positives. `request:match` means "a handler matched the URL", not "MSW
answered".

| Case                                      | `request:match` | `response:mocked` | `response:bypass` | `request:unhandled` | What the app receives |
| ----------------------------------------- | --------------- | ----------------- | ----------------- | ------------------- | --------------------- |
| Handler that answers                      | yes             | yes (200)         | no                | no                  | the mocked response   |
| Handler with `passthrough()`              | **yes**         | **no**            | yes (404)         | no                  | the REAL response     |
| No handler, default mode                  | no              | no                | yes (404)         | yes                 | the real response     |
| No handler, `onUnhandledRequest: 'error'` | no              | **yes (500)**     | **no**            | yes                 | a 500 from MSW        |

Two counter-intuitive readings: a handler with `passthrough()` (or one that
throws, or one that returns `undefined`) emits `request:match` and nothing
else, so a spy that marks "intercepted" on `request:match` asserts something
false; and in `'error'` mode MSW does not let the request through at all —
it fabricates its own 500 and emits it as `response:mocked`, and the
application's `fetch` does **not** reject. So `response:mocked` alone is not
enough either.

The rule that discriminates all four cases, correlated by `requestId`:

```
really intercepted  =  request:match  AND  response:mocked
```

| Observed combination     | Meaning                                          |
| ------------------------ | ------------------------------------------------ |
| `match` + `mocked`       | intercepted: MSW answered with your handler      |
| `match` without `mocked` | matched but did NOT answer (passthrough, throw)  |
| `mocked` without `match` | MSW fabricated the response (the error-mode 500) |
| `bypass`                 | went out to the real network                     |

## 3. The `Response` of `response:mocked` can be cloned

**Measured.** Source: `../vbmmsw/docs/knowledge/msw-browser-mode.md`.

`response.clone()` inside the `response:mocked` listener works, and the
application still receives its copy intact (verified by asserting on the
body that reaches the `fetch`). Same discipline as with the request: clone
without yielding control, store the promise and not the value.

This is what `toHaveRespondedWith` stands on, and it is the difference
between "the test passes" and "the test passes for the right reason": with a
wrong handler order, a generic `200 []` answering where the test believed it
had configured a `500` goes unnoticed by a green functional assertion.

## 4. Which event closes each path, and where the counter leaks

**Measured**, one row **reasoned**. Source:
`../vbmmsw/docs/knowledge/quiescencia-red-msw.md`.

The in-flight counter is `request:start` minus
(`response:mocked` | `response:bypass`). It reaches zero on every measured
path except one.

| Path                                        | Closing event                     | Counter reaches zero?           |
| ------------------------------------------- | --------------------------------- | ------------------------------- |
| Handler that answers                        | `response:mocked`                 | yes                             |
| Handler with `passthrough()`                | `response:bypass` (real response) | yes                             |
| No handler, default mode                    | `response:bypass`                 | yes                             |
| Handler that throws                         | `response:mocked` (MSW's 500)     | yes                             |
| Aborted fetch, handler finishes             | `response:mocked` when it does    | yes, but late                   |
| Aborted fetch, handler never finishes       | **none**                          | **NO: stuck forever**           |
| Opaque response (`no-cors` to other origin) | none (read in the source)         | presumably not — **unmeasured** |

The non-obvious paths:

- **Handler that throws.** MSW emits `unhandledException` and ~1.5 ms later
  fabricates its own 500, emitted as `response:mocked`; the app receives
  that 500 and its `fetch` does not reject. `unhandledException` does not
  need to touch the counter.
- **Aborted fetch.** The app's `fetch` rejects with `AbortError`
  immediately, but MSW keeps running the handler to the end: with
  `delay(400)`, `response:mocked` arrived ~404 ms after the abort.
  Quiescence measures "MSW finished", not "the application finished". With
  `delay('infinite')` no closing event ever arrives and the counter stays
  stuck — measured by waiting 600 ms after the abort. A regression test pins
  this: if some future MSW closes aborted requests, it goes red and the
  restriction becomes unnecessary.
- **Opaque responses (reasoned, read in the source, not measured).** In
  `#handleResponse` of the browser client (`msw/lib/browser/index.mjs`), a
  response whose `type` is opaque deletes the frame **without emitting any
  event**. The harness had no second origin to provoke it against. For
  pepito this means `fetch(..., { mode: 'no-cors' })` to another origin
  would leak the counter.

Invariants that follow, and that the registry implements:

- **Counter keyed by `requestId`** (a `Set`/`Map`), not an integer: a
  closing event whose `request:start` was never seen — traffic from before a
  registry reset, for instance — would drive an integer negative unnoticed.
- **The quiescence wait carries a timeout and, on expiry, throws with a dump
  of what was still in flight.** That is the never-finishing-handler case:
  without a timeout the matcher waits forever; with a silent timeout it
  cannot be diagnosed. A meter that cannot measure goes red.
- **Register the listeners once per worker** and renew the state, instead of
  registering per test: MSW's emitters offer no way to remove "only yours"
  without taking everyone else's (`removeAllListeners` flattens all).

## 5. `response:mocked` has no guaranteed order against the app's `await fetch`

**Measured.** Source: `../vbmmsw/docs/knowledge/quiescencia-red-msw.md`.

`response:*` events travel from the service worker to the client over
`postMessage`, sent just before the SW hands the response to the `fetch`
(read in `mockServiceWorker.js`: `sendToClient` precedes `return response`).
Message delivery and `fetch` resolution are two different async hops — a
race.

| Series | `response:mocked` BEFORE the fetch resolved | Skew (event − fetch) |
| ------ | ------------------------------------------- | -------------------- |
| GET    | 17/20                                       | −0.1 to +0.1 ms      |
| POST   | 6/10                                        | −0.1 to +0.1 ms      |

Consequences: `toHaveRespondedWith` cannot read the status immediately after
the application paints — the event may not have arrived. Either it retries
(as the positive matchers do) or it reads after quiescence. **After
quiescence the registry is complete by definition**: the counter only
reaches zero once every `request:start` got its response event, and with it
the status. That is the deterministic read point.

The race is not theoretical: the source repo's own characterization tests
asserted on `response:*` right after `await fetch` and were flaky under the
parallel suite (~1 in 3 full runs).

## 6. The blind window: the instantaneous counter is not samplable

**Measured.** Source: `../vbmmsw/docs/knowledge/quiescencia-red-msw.md`.

- **`fetch()` → `request:start` takes ~0.8 ms.** Synchronously after calling
  `fetch()` the counter is zero, guaranteed: the event travels over
  `postMessage` and cannot have arrived. In that window, "the network is
  calm" is a lie.
- **A whole mocked request lives ~0.6 ms** (`request:start` to
  `response:mocked`). It can be born and die between two samples of a
  polling loop: it happened in the first version of the test, which checked
  for "counter > 0" every 2 ms and never saw it.

Design consequence: **the instantaneous counter only tells you whether
something is still pending, never whether there was traffic.** Absence
(`not.toHaveBeenRequested`) is answered against the accumulated registry,
which keeps the history; quiescence (counter at zero) only guarantees that
what was observed has closed. Between the interaction and the first
`request:start` there is a window in which neither registry nor counter sees
anything, and a negated matcher evaluated immediately after the interaction
can pass falsely. **That window has no deterministic signal that closes it —
it is the limit of the mechanism**, and it is documented in the package
rather than hidden under a sleep.

## 7. Why `snapshotAfterIdle` takes two observations

**Measured** that the naive check fails; the second observation's benefit is
**reasoned**. Source: `../vbmmsw/docs/knowledge/quiescencia-red-msw.md`.

The very case quiescence exists to solve — `void fetch(spec)` without await,
followed with no yield by `expect(spec).not.toHaveBeenRequested()` — falls
**exactly** inside the blind window: between `fetch()` and the first
`request:start` there is not even a microtask, only chained synchronous
calls (matcher → `resolveTraffic` → `waitForNetworkIdle`), so the counter
reads zero by construction, not by bad luck. An immediate
`waitForNetworkIdle()` confirms "network calm" while lying — reproduced
deterministically, 100% across 8+ repetitions.

The real round trip measured there (page → SW → page over `postMessage`)
takes 1 to 6 ms, larger than the ~0.8 ms of the original measurement but of
the same order.

- **First iteration (insufficient, superseded):** a fixed margin of
  `RETRY_INTERVAL_MS` before the first `waitForNetworkIdle`. Enough in this
  harness (1–6 ms of real round trip against a 25 ms margin), and mutation
  testing showed removing the margin failed the DETERMINISM test in 100% of
  repetitions. But it is a timing assumption, not a guarantee: on a
  contended CI the round trip can stretch past the margin while the margin's
  `setTimeout` keeps its own clock, and the calm check would read an empty
  registry exactly in the tests that exist to prove that cannot happen.
- **Current iteration: a two-observation stability condition.**
  `snapshotAfterIdle` waits one `RETRY_INTERVAL_MS`, calls
  `waitForNetworkIdle()`, waits another `RETRY_INTERVAL_MS` and checks
  `inFlightCount() === 0`; if that second observation sees new traffic
  (arrived during the first wait), it waits for calm again and repeats,
  until two consecutive observations one interval apart are both calm. It
  converges because each `waitForNetworkIdle` still carries its own timeout
  with the diagnostic dump if it really hangs — and that error propagates
  unwrapped.

This **does not close the blind window**: there is still no deterministic
signal for a request that starts after the second observation. What it does
is narrow the practical failure bound from "more than one margin interval"
to "more than two", which is **reasoned** from how `waitForNetworkIdle`
works, not measured — this harness is too fast to reproduce the contended-CI
scenario that motivates the change.

Mutation results against the DETERMINISM tests of
`test/matchers-quiescence.test.ts`:

| Mutation                                          | Result                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| Naive immediate check (no `waitForNetworkIdle`)   | both DETERMINISM tests fail, 3/3 runs          |
| Second observation removed (margin + single wait) | does **not** fail here — defends CI, not local |
| Margin + double observation (current)             | 8/8 full suite, 5/5 + 5/5 isolated with `-t`   |

Never call `waitForNetworkIdle` raw from a matcher: that reopens the window
this function closes.

## 8. `request:end` is not a quiescence signal

**Measured.** Source: `../vbmmsw/docs/knowledge/quiescencia-red-msw.md`.

It looks like the natural candidate (emitted on every path of MSW's
`resolve()`) but it means "MSW decided what to do", not "the response was
delivered":

- On mocked requests it preceded the `fetch` resolution 20/20.
- On passthrough / no-handler it is emitted **before the real network
  answers**: measured 3.4 ms before `response:bypass`.
- On the exception path it **is not emitted at all** (measured: the trace of
  a throwing handler contains `request:start`, `unhandledException` and
  `response:mocked`, with no `request:end`).

## 9. Type augmentation targets `@vitest/expect`, not `'vitest'`

**Measured.** Source:
`../vbmmsw/docs/knowledge/augmentacion-tipos-vitest-expect.md` (measured with
`vitest@4.1.10` and TypeScript `7.0.2`).

The widely documented pattern
`declare module 'vitest' { interface Assertion<T = any> extends CustomMatchers<T> {} }`
**compiles without complaint and silently fails to merge** in this package:
`tsc --noEmit` flags nothing in the augmentation file, but the `Assertion`
returned by the global `expect()` does not gain the new methods, so
`expect(spec).toHaveBeenRequested()` keeps reporting TS2339 at the call
site. No TS2428/TS2717 either — there is no declaration conflict, it is
simply not the same declaration.

Ruled out by experiment: the file's location (tried in `src/`, in `test/`
and at the package root, byte-identical content, all fail the same), the
number of declared methods, and the package's own `peerDependencies` field
(tried removing it). The failure is deterministic across repeated runs, so
not a compiler race.

The cause: `vitest` re-exports `Assertion` from `@vitest/expect`, and the
`vitest` package augments its own global types against `@vitest/expect`
directly, not against `vitest` — see
`node_modules/vitest/dist/chunks/global.d.*.d.ts`:
`declare module "@vitest/expect" { interface Assertion<T> {...} }`. An
augmentation aimed at `'vitest'` merges into a different module identity from
the one the global `expect` consumes.

Not explained: why the evaluation repo's spike does not suffer it with the
same pattern. The most plausible hypothesis is pepito's peer-dependency
configuration (a real package with `peerDependencies: { vitest: ... }` plus
`vitest` also as a devDependency so the package can test itself), which the
spike does not have — but it was **not** isolated as the single cause, only
the alternatives above were explicitly ruled out.

So `src/matcher-types.ts` declares `module '@vitest/expect'`, and still
extends `Assertion` (never `Matchers`, per the already-known TS2428). If a
type test stops seeing a pepito matcher after a Vitest upgrade, this is the
first place to look: confirm in `node_modules/vitest/dist/chunks/*.d.ts`
which module the new version augments.

## 10. ANSI colour survives from the browser to the terminal

**Measured.** Source:
`../vbmmsw/docs/knowledge/salida-coloreada-matchers.md`.

Matchers registered with `expect.extend` run **inside the browser** while the
colour is painted by a terminal in another process. It still arrives, and
without chalk: inside a matcher, `this.utils` (the same utilities the native
matchers use — `matcherHint`, `diff`, `printExpected`, `printReceived`)
exists in browser mode and emits ANSI codes — dim hint, `- Expected` in
green, `+ Received` in red. The message travels as a string to the reporter
and the terminal paints it. Verified with the output piped (no TTY): the
codes are generated all the same, because the colour decision is taken in
the browser bundle, not by inspecting Node's stdout.

Consequences for `failure-messages.ts`: coloured output is `this.utils`, not
a dependency — same look as `toEqual`, no palette to maintain, free
consistency with `expect.element`. The red/green diff of "expected this
request / observed these" is `this.utils.diff(expected, received)` over flat
structures (method, path, body, status); do not lay it out by hand.

Coupling to watch: if a future Vitest propagates colour detection into the
browser (`NO_COLOR`, CI without colour), the messages could arrive without
ANSI or with ANSI where it does not belong. The characterization test pins
today's behaviour and will report the change.

## 11. The service worker intercepts cross-origin

**Measured.** Source: `../vbmmsw/docs/knowledge/msw-browser-mode.md`.

A handler with an absolute URL to a domain that does not resolve
(`https://api.example.invalid/…`, RFC 2606) answers a cross-origin `fetch`
with a mocked 200. The service worker intercepts everything leaving the
page, not just same-origin, and the handler's synthetic response does not go
through CORS.

Practical consequence: **pepito needs no `defaultHost`** like the previous
generation of network-testing tools. The API host is a detail of the MSW
handler — absolute URL or wildcard (`*/products`) — not a configuration knob
of this package.

Related, same source: **the service worker does not see Vite's internal
traffic** — 0 noise requests measured, because MSW filters by
`request.destination`, so the modules browser mode's Vite server serves
(`/@fs`, `/@vite/client`, `/node_modules/.vite/…`) never reach the log or
`onUnhandledRequest`. `worker.start({ quiet: true })` is enough and
`onUnhandledRequest: 'error'` is viable. If anyone ever suspects noise, the
source repo has a test that measures it instead of discussing it.

## 12. Storage belongs to the origin, and the cleanup has known limits

**Measured** (a, b) and **reasoned/defensive** (c). Sources:
`../vbmmsw/docs/knowledge/aislamiento-tests.md` and
`../vbmmsw/docs/knowledge/url-navegacion-browser-mode.md`.

Browser mode isolates at the level of the **document** (each test file gets a
clean context), but `localStorage`, `sessionStorage` and cookies belong to
the **origin**. Every file running in the same worker shares the origin
(`localhost:63315`) and therefore shares storage. jsdom does not have the
problem because it builds a whole synthetic `window` per file.

Deterministic, verified across three repeated runs:

```
default parallelism (2 files → 2 workers):  localStorage isolated
--maxWorkers=1      (2 files → 1 worker):   localStorage LEAKS
--no-file-parallelism (2 files → 1 worker): localStorage LEAKS
```

This is why it bites in CI and not locally: locally, with many workers and
few files, each file tends to land in a different worker. In CI parallelism
is capped, so one worker runs many files in sequence sharing storage — and
which files land together varies between runs, so the failure looks
intermittent although the mechanism is deterministic. It is the worst kind
of test bug: invisible locally, sporadic in CI.

Between tests of the **same** file nothing is isolated, in browser mode or in
jsdom: storage, cookies, `window` properties, `document.title` and orphan DOM
nodes all survive. What saves the normal case is `vitest-browser-react`'s
auto-cleanup, which unmounts what `render()` mounted — and only that.

Hence `setupNetwork()` owning `clearOriginStorage()`. Its limits:

- **(a, measured)** A cookie set without a `path` attribute while the test
  simulates a nested route still has real path `/` (see finding 13), so
  clearing with `path=/` does clear it.
- **(b, measured)** A cookie with an explicit `path` other than `/` is
  invisible in `document.cookie` from any simulated route — immediately, in
  the same call that sets it. It can neither be enumerated nor deleted. Same
  limit as for cookies with an explicit `domain`. A real backend can set
  such cookies; this is a known hole, not a solved problem.
- **(c, defensive, not measured as necessary)** Because of (a) and (b), the
  order between `clearOriginStorage()` and `history.replaceState(...)` inside
  the `afterEach` is indifferent in this harness today: inverting it does not
  change the covering test's result. Pepito keeps `clearOriginStorage()`
  **before** restoring the URL anyway — it is the correct reading of RFC 6265
  and costs nothing, in case a future Vitest runner or another browser engine
  (WebKit, Firefox via Playwright) does tie the cookie `path` to the
  simulated route.

## 13. The real URL is the mounting mechanism, and cookies do not follow it

**Measured.** Source:
`../vbmmsw/docs/knowledge/url-navegacion-browser-mode.md`.

`atPath` is `window.history.pushState({}, '', '/route')` over the runner
page's real URL, letting the application's own router read it. No
`MemoryRouter`, no coupling to any router library: pepito touches
`window.history`, which belongs to the browser, and anything that reads the
real URL (react-router, wouter, TanStack Router) notices on its own.

What was measured, test by test:

- **The Vitest runner tolerates the path change.** Its page runs on
  `http://localhost:<port>/?sessionId=…&iframeId=…` and the `pushState`
  **wipes those query params** with no consequence: the runner only reads
  them when the page loads. This is a coupling to today's runner behaviour to
  watch on Vitest upgrades — if it ever re-reads them (on a reload after a
  failure, say), saving the original `href` and restoring it in cleanup is a
  one-liner.
- **MSW keeps intercepting after the change**: the service worker's scope is
  the origin, not the path.
- **The URL persists between tests of the same file** (same document), so the
  route must be set on **every** mount; assuming a clean slate is wrong.
  Between files there is no leak — isolation is per document and the URL
  belongs to the document, unlike storage (finding 12).
- **The route can be a full URI**: `/products?filter=x&page=2#detail`
  reaches the app's router, query and hash included, not just the browser's
  `location`.
- **The `pushState` must happen BEFORE the render.** A `BrowserRouter` reads
  the URL on mount and afterwards only listens to `popstate`, so a later
  `pushState` changes the URL without moving the view.
- **The application's own navigation really works**: a router `<Link>`
  changes the document's real URL without reloading the runner's iframe, so
  assertions on `location.pathname` after navigating are legitimate.

And the part that constrains storage cleanup: **cookie paths follow the real
route, not the simulated one.** Both the default `path` computed when setting
a cookie without the attribute and the path-matching applied when reading
`document.cookie` stay anchored to the URL the runner's `<iframe>` actually
loaded — always the root — and not to the `location` that
`pushState`/`replaceState` are free to change. Measured with three ad-hoc
diagnostics (not kept as regression tests: they investigated, they do not
discriminate anything on their own), which also confirmed
`window === window.top` is `false` — each test file runs in its own
`<iframe>` whose real `src` is always `/?sessionId=…&iframeId=…`.

## 14. A `+` in the project path hangs browser mode, silently

**Measured**, with clean A/B. Source:
`../vbmmsw/docs/knowledge/rutas-con-mas-browser-mode.md`. Upstream state as
of 2026-08-14.

The same tree, byte for byte, passes in ~1.4 s on a path without `+` and
hangs indefinitely on a path with `+`. The symptom: `npm test` prints
`RUN v4.1.10`, launches the browser, starts the server and **runs no file
and prints nothing more, forever** — no error, no timeout. A mute meter.

The mechanism, two upstream failures compounding:

1. Vitest browser mode interpolates the test file's absolute path into the
   tester page's `?iframeId=` query param **without `encodeURIComponent`**.
2. The tester reads it with `URLSearchParams`, which decodes `+` as a space
   (the `application/x-www-form-urlencoded` rule).
3. The `ready` key never matches, `waitForReady()` has no timeout and the
   `page.goto` runs with `timeout: 0` → infinite hang with no message.

Where it bites: any browser-mode project under a directory containing `+`
(and presumably `%` or spaces — unmeasured). The case that exposed it:
**Claude Code worktrees map a branch `feat/x` to the directory `feat+x`, so
any worktree of a branch with a `/` in its name reproduces the hang.** Use
branch names without `/` when working in a worktree.

Ways out: a path without `+` (rename the worktree/directory) is the good one;
`--browser.isolate=false` avoids the affected channel at the cost of per-file
isolation, which finding 12 makes a bad default.

Upstream: the encoding bug is vitest-dev/vitest#10520, closed by PR #10521
("encode iframeId in tester iframe URL", Jun 2026). Verified against the
GitHub API that the fix is **not** contained in `v4.1.10` and **is** in the
v5 prereleases (`v5.0.0-beta.6` onward); the issue is locked, so a backport
cannot be requested there. The "unbounded wait" half is still open in
vitest-dev/vitest#10791, with the A/B reproduction from this work commented
on it. While the package stays on Vitest 4.x: paths without `+`.

## 15. Visual regression: the stable green that lies, and per-platform baselines

**Measured by the package's real-world consumer**, not in the evaluation
repo's spike. Source:
`../vbmmsw/docs/knowledge/regresion-visual-browser-mode.md`. With
`vitest@4.1.10`, native `toMatchScreenshot` (`pixelmatch` comparator),
Chromium via Playwright, on darwin (local) and ubuntu (CI).

This is the finding that justifies `network.idle()` being public API.

Capturing a baseline right after mounting a page whose network is slow (a
handler with `delay(300)`) does not capture a failure: it captures the
loading state. The native stabilizer — the timeout of up to 5000 ms waiting
for the capture to stop changing between frames — does not protect against
it, because "Loading…" **is** a stable capture.

| Environment | Runs | Green                             | Failures                                                                              |
| ----------- | ---- | --------------------------------- | ------------------------------------------------------------------------------------- |
| Local       | 17   | 16, recapturing the loading state | 1 (the coldest run): captured the real list, **dimension** mismatch 333×139 vs 333×93 |
| CI (ubuntu) | 3    | 3, recapturing the loading state  | 0                                                                                     |

That is not flake, it is determinism of the wrong state: 16 of 17 local
baselines and 3 of 3 in CI captured, with total consistency, the screen that
should not have been captured.

Two waits fix it, both measured at **0 failures across 17 local runs + 3 in
CI, with byte-identical baselines**: anchoring content with
`expect.element(...)` before capturing (the most precise when you know what
content to expect), or waiting for the network to settle (the
content-agnostic form). The second one previously required diverting the
`toHaveNoUnhandledRequests` guard-rail from its purpose; that measurement is
the evidence that approved `network.idle()`, which has existed in pepito
since 2026-08-14 with the same stability mechanism, timeout and dump as the
negated matchers.

Cross-platform is impossible, not hard: the same element, stable in content
and with no network involved, measures 333×80 on darwin and 333×82 on linux
— system font metrics change the line height and with it the layout height,
and the comparator fails on size **before** comparing a single pixel. On the
one comparable pair, 6.11% of pixels differed exactly and 4.92% with ±32
per-channel tolerance; absorbing that would need a threshold around 7%, which
would hide real regressions of the same order. And the signal/noise ratio
settles it: a real regression measured 66 px (darwin) / 110 px (linux)
against 1,891 px of typographic noise — signal 20 to 30 times smaller than
the noise. **Per-platform baselines are mandatory, not a recommendation**,
and Vitest's own baseline filenames enforce it (`-chromium-darwin.png` /
`-chromium-linux.png`).

Two more measured details worth carrying: `ScreenshotOptions` exposes no
`mask` and no `clip` (`comparatorOptions.pixelmatch.diffMask` only changes
how the diff image is painted), so the defence against dynamic content is
determinism in the fixture — fixed dates in the data, never `new Date()`; and
`actions/upload-artifact` excludes hidden directories by default, so without
`include-hidden-files: true` the candidate captures under
`.vitest-attachments/` never reach the artifact and the job looks like it
worked while uploading nothing useful.

## 16. Stability risk: the API this package stands on is being rewritten

**Measured** by reading the installed types. Source:
`../vbmmsw/docs/knowledge/msw-browser-mode.md`.

`node_modules/msw/lib/core/sharedOptions.d.ts` marks `LifeCycleEventsMap` as
`@deprecated`, pointing at `HttpNetworkFrameEventMap` /
`WebSocketNetworkFrameEventMap`. Event names are the same today and the
payloads still expose `.request` and `.requestId`, so the destructuring
works — but the API any network matcher stands on is precisely the one MSW is
rewriting. Stack traces on the service-worker path also go through
`msw/core/experimental/frames/http-frame.ts` and
`msw/core/experimental/define-network.ts`: the SW route of MSW 2.15 leans on
code marked experimental.

This is the reason `src/msw-events.ts` is the only file in the package that
touches `worker.events` — so the upstream migration costs one file, not a
sweep.
