import { expect } from 'vitest'
import {
  noUnhandledRequestsFailureMessage,
  requestCountFailureMessage,
  requestFailureMessage,
  respondedWithFailureMessage,
} from './failure-messages'
import type { ExpectedResponse } from './matcher-types'
import { NETWORK_TARGET } from './network'
import type { RequestSpec } from './request-descriptors'
import { matchesBody, matchesSpec } from './spec-matching'
import {
  inFlightCount,
  QUIESCENCE_TIMEOUT_MS,
  RETRY_INTERVAL_MS,
  snapshotTraffic,
  waitForNetworkIdle,
} from './traffic-registry'
import type { ResolvedRequest } from './traffic-registry'

// 1s of margin on top of polling every RETRY_INTERVAL_MS: enough for a
// request fired right after the assert to have time to complete its real
// trip through the service worker (browser mode, not a same-thread mock).
const RETRY_TIMEOUT_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The shorthand `toHaveRespondedWith(500)` and the long form
// `toHaveRespondedWith({ status: 500 })` coexist in the public signature so
// the common case doesn't force wrapping an object; normalizing here, once,
// avoids spreading the `typeof` check across the rest of the matcher.
function normalizeExpectedResponse(
  expected: number | ExpectedResponse,
): ExpectedResponse {
  return typeof expected === 'number' ? { status: expected } : expected
}

/**
 * Polls `snapshotTraffic()` until an entry matches `spec` and satisfies
 * `isSatisfyingEntry`, or until `RETRY_TIMEOUT_MS` runs out. Returns the
 * last traffic seen even if there was never a positive verdict: the
 * matchers need it to compose the failure message.
 */
async function pollTraffic(
  spec: RequestSpec,
  isSatisfyingEntry: (entry: ResolvedRequest) => boolean,
): Promise<{ traffic: ResolvedRequest[]; pass: boolean }> {
  const deadline = Date.now() + RETRY_TIMEOUT_MS

  for (;;) {
    const traffic = await snapshotTraffic()
    const pass = traffic.some(
      (entry) => matchesSpec(entry, spec) && isSatisfyingEntry(entry),
    )
    if (pass || Date.now() >= deadline) return { traffic, pass }
    await sleep(RETRY_INTERVAL_MS)
  }
}

/**
 * Waits for the network to settle (two consecutive calm observations,
 * separated by a poll interval) and returns a single snapshot of the
 * traffic accumulated up to that point.
 *
 * Use it to assert an ABSENCE or an EXACT COUNT, never for the positive,
 * retrying case (that's `pollTraffic`): it's the basis for the negated
 * branch of `resolveTraffic` and for `toHaveBeenRequestedTimes`, and
 * `network.log()` (network.ts) also uses it, outside this file.
 *
 * Total budget `QUIESCENCE_TIMEOUT_MS`: if the network doesn't settle in
 * time, it throws with a dump of what's pending instead of returning a mute
 * boolean. Full design rationale in the comment block right below the
 * function.
 */
export async function snapshotAfterIdle(): Promise<ResolvedRequest[]> {
  const deadline = performance.now() + QUIESCENCE_TIMEOUT_MS

  await sleep(RETRY_INTERVAL_MS)
  for (;;) {
    // Second argument: if this sub-call runs out its remaining budget and
    // throws, the message has to talk about the TOTAL budget, not the
    // remainder it happened to get (I2 — otherwise the last lap would say
    // "did not settle within 1ms" after having waited almost the entire
    // QUIESCENCE_TIMEOUT_MS).
    await waitForNetworkIdle(
      Math.max(1, deadline - performance.now()),
      QUIESCENCE_TIMEOUT_MS,
    )
    await sleep(RETRY_INTERVAL_MS)
    if (inFlightCount() === 0) return snapshotTraffic()
  }
}

// Full design and rationale, for whoever reviews this later:
//
// Exported (instead of staying private to this file) because network.log()
// needs the same calm-wait without copying it or calling waitForNetworkIdle
// raw, which would reopen the blind window this function closes. Any future
// matcher with the same need (negated forms of toHaveRespondedWith) can call
// it as-is without needing to export anything else, as long as it lives in
// this file alongside the rest of the matchers.
//
// A single fixed margin before `waitForNetworkIdle` isn't enough: it's a
// timing assumption measured in this harness (real page-service
// worker-page round trip of 1 to 6 ms, see
// docs/knowledge/quiescencia-red-msw.md), not a guarantee. On a loaded CI
// that round trip can stretch past the margin while the margin's own
// `setTimeout` keeps its own clock — the calm check would read the registry
// as empty right when the request is still on its way, precisely in the
// tests that exist to prove that doesn't happen. That's why a STABILITY
// CONDITION is required, not a margin: two consecutive observations
// separated by a poll interval, both calm (`inFlightCount() === 0`). If the
// second one sees new traffic (arrived during the wait for the first), the
// calm wait repeats and the check runs again.
//
// This does NOT close the blind window: no bounded wait can, that's the
// preregistered position of docs/knowledge/quiescencia-red-msw.md. It only
// narrows the practical failure margin from one interval to two — reasoned
// from how `waitForNetworkIdle` works, not measured: this harness is too
// fast to reproduce the contended CI that motivates the change. The
// DETERMINISM tests in matchers-quiescencia.test.ts measure something real
// but different: that the full mechanism (margin + double observation) is
// needed against a naive check or no wait at all, not that the second
// observation alone is detectable in this harness (verified by mutation,
// see docs/knowledge/quiescencia-red-msw.md).
//
// The loop needs ONE clock budget for the whole operation, not a fresh one
// per lap: `waitForNetworkIdle()` with no argument starts its own
// `QUIESCENCE_TIMEOUT_MS` every time it's called, so a relay of overlapping
// requests (each one settles the counter just before another starts during
// the trailing margin) would make the loop never converge or throw — it
// would die by Vitest's generic timeout, without the dump of what's
// pending. `deadline` is computed once on entry and each sub-call gets
// whatever budget is left, never a fresh full one again. If the budget runs
// out while the counter happens to be at zero, the current sub-call returns
// right away (nothing to wait for), the check that follows fails if
// something started meanwhile, and the next sub-call gets ~1 ms: if
// something is in flight, its own loop detects it once that remainder
// passes and throws with the dump — bounded to, at most, one extra
// `RETRY_INTERVAL_MS` on top of the global budget, never unbounded.

/**
 * Single decision point between retrying and waiting for calm. `.not`
 * needs quiescence: retrying until something shows up, applied to an
 * absence, would give a false positive with any request still in flight
 * (the DETERMINISM test in matchers-quiescencia.test.ts catches exactly
 * that). The positive case keeps the retrying poll because there it's the
 * request arriving that matters, not the whole network going quiet.
 */
async function resolveTraffic(
  spec: RequestSpec,
  isSatisfyingEntry: (entry: ResolvedRequest) => boolean,
  isNot: boolean,
): Promise<{ traffic: ResolvedRequest[]; pass: boolean }> {
  if (!isNot) return pollTraffic(spec, isSatisfyingEntry)

  const traffic = await snapshotAfterIdle()
  return {
    traffic,
    pass: traffic.some(
      (entry) => matchesSpec(entry, spec) && isSatisfyingEntry(entry),
    ),
  }
}

expect.extend({
  async toHaveBeenRequested(spec: RequestSpec) {
    const { traffic, pass } = await resolveTraffic(spec, () => true, this.isNot)

    return {
      pass,
      message: () =>
        requestFailureMessage({
          utils: this.utils,
          matcherName: 'toHaveBeenRequested',
          spec,
          traffic,
          isNot: this.isNot,
        }),
    }
  },

  async toHaveBeenIntercepted(spec: RequestSpec) {
    // Neither passthrough (matched without mocked) nor the 500 MSW
    // fabricates in error mode (mocked without matched) count as
    // intercepted: the handler itself has to have responded. See
    // docs/knowledge/msw-browser-mode.md.
    const { traffic, pass } = await resolveTraffic(
      spec,
      (entry) => entry.matched && entry.mocked,
      this.isNot,
    )

    return {
      pass,
      message: () =>
        requestFailureMessage({
          utils: this.utils,
          matcherName: 'toHaveBeenIntercepted',
          spec,
          traffic,
          isNot: this.isNot,
        }),
    }
  },

  async toHaveRespondedWith(
    spec: RequestSpec,
    expected: number | ExpectedResponse,
  ) {
    const expectedResponse = normalizeExpectedResponse(expected)

    // The above (intercepted: neither passthrough nor an MSW-fabricated
    // error, see toHaveBeenIntercepted above), plus this response: exact
    // status plus, if given, a subset of the response body using the same
    // rules matchesSpec applies to the request.
    const isSatisfyingEntry = (entry: ResolvedRequest): boolean =>
      entry.matched &&
      entry.mocked &&
      entry.status === expectedResponse.status &&
      (expectedResponse.body === undefined ||
        matchesBody(
          entry.responseBody,
          expectedResponse.body,
          expectedResponse.exact,
        ))

    const { traffic, pass } = await resolveTraffic(
      spec,
      isSatisfyingEntry,
      this.isNot,
    )

    return {
      pass,
      message: () =>
        respondedWithFailureMessage({
          utils: this.utils,
          spec,
          expected: expectedResponse,
          traffic,
          isNot: this.isNot,
        }),
    }
  },

  async toHaveBeenRequestedTimes(spec: RequestSpec, count: number) {
    // Always waits for calm, negated with `.not` or not: an exact count
    // taken mid-traffic is as false as an absence taken mid-traffic (the
    // other DETERMINISM test in the same test file).
    const traffic = await snapshotAfterIdle()
    const matchingEntries = traffic.filter((entry) => matchesSpec(entry, spec))
    const foundCount = matchingEntries.length

    return {
      pass: foundCount === count,
      message: () =>
        requestCountFailureMessage({
          utils: this.utils,
          spec,
          expectedCount: count,
          foundCount,
          traffic,
          isNot: this.isNot,
        }),
    }
  },

  async toHaveNoUnhandledRequests(received: unknown) {
    // This matcher doesn't describe a request: it hangs off
    // `expect.network()`, the only place that produces the
    // `NETWORK_TARGET` marker. Used on anything else (a `get(...)`
    // descriptor, a string) is a usage error, not an assertion failing on
    // data.
    if (received !== NETWORK_TARGET) {
      return {
        pass: false,
        message: () =>
          'toHaveNoUnhandledRequests is used through expect.network(), not on a request descriptor: expect.network().toHaveNoUnhandledRequests()',
      }
    }

    const traffic = await snapshotAfterIdle()
    const unhandledEntries = traffic.filter((entry) => entry.unhandled)

    return {
      pass: unhandledEntries.length === 0,
      message: () =>
        noUnhandledRequestsFailureMessage({
          utils: this.utils,
          unhandledEntries,
          traffic,
          isNot: this.isNot,
        }),
    }
  },
})

// Vitest doesn't allow declaring new properties on `ExpectStatic` via
// `expect.extend`: `expect.extend` only installs matchers inside an
// `Assertion`. `expect.network()` needs to be a top-level function on
// `expect` itself, so it's assigned directly; the type shape comes from the
// `ExpectStatic` augmentation in matcher-types.ts.
expect.network = () => expect(NETWORK_TARGET)
