/**
 * Traffic entry as it lives in the registry while the test runs: `body` and
 * `responseBody` are promises because they can only be read once (measured
 * — see `.claude/docs/references/measured-foundations.md`) and are stored
 * without awaiting, so as not to block the `request:start` listener that
 * opens them.
 */
export interface ObservedRequest {
  requestId: string
  method: string
  origin: string
  path: string
  searchParams: Record<string, string>
  body: Promise<unknown>
  matched: boolean
  mocked: boolean
  bypassed: boolean
  unhandled: boolean
  status: number | null
  responseBody: Promise<unknown>
}

/** Same shape as {@link ObservedRequest} with `body` and `responseBody` already resolved: what the matchers and failure messages see. */
export interface ResolvedRequest extends Omit<
  ObservedRequest,
  'body' | 'responseBody'
> {
  body: unknown
  responseBody: unknown
}

const traffic = new Map<string, ObservedRequest>()

// A Set of in-flight requestId, not an integer: a close event with no prior
// request:start (traffic from before a resetTraffic) is simply ignored,
// instead of leaving a counter stuck negative without anyone noticing.
// Measured in docs/knowledge/quiescencia-red-msw.md.
const pending = new Set<string>()

/**
 * Opens a traffic entry with what can only be read at `request:start`
 * (measured — see `.claude/docs/references/measured-foundations.md`) and
 * marks it in flight.
 * `watchNetwork` (msw-events.ts) is the only caller.
 */
export function recordRequestStart(
  requestId: string,
  startFields: Pick<
    ObservedRequest,
    'method' | 'origin' | 'path' | 'searchParams' | 'body'
  >,
): void {
  traffic.set(requestId, {
    requestId,
    ...startFields,
    matched: false,
    mocked: false,
    bypassed: false,
    unhandled: false,
    status: null,
    responseBody: Promise.resolve(undefined),
  })
  pending.add(requestId)
}

/**
 * Marks that a handler matched the route. By itself it doesn't imply it
 * responded — a `passthrough()` also emits this event — which is why
 * `toHaveBeenIntercepted` (matchers.ts) additionally requires
 * {@link recordMockedResponse}.
 */
export function recordMatch(requestId: string): void {
  const entry = traffic.get(requestId)
  if (entry) entry.matched = true
}

/** Records the response a handler produced and closes the request (removes it from `pending`). */
export function recordMockedResponse(
  requestId: string,
  status: number,
  responseBody: Promise<unknown>,
): void {
  const entry = traffic.get(requestId)
  if (entry) {
    entry.mocked = true
    entry.status = status
    entry.responseBody = responseBody
  }
  pending.delete(requestId)
}

/** Records that the request went out to the real network (passthrough or no handler) and closes the request. */
export function recordBypassResponse(requestId: string, status: number): void {
  const entry = traffic.get(requestId)
  if (entry) {
    entry.bypassed = true
    entry.status = status
  }
  pending.delete(requestId)
}

/** Marks a request as unhandled; this is what the `toHaveNoUnhandledRequests` guardrail reads. */
export function recordUnhandled(requestId: string): void {
  const entry = traffic.get(requestId)
  if (entry) entry.unhandled = true
}

/**
 * Resolves the pending `body`/`responseBody` promises and returns a
 * snapshot of the traffic accumulated so far. Doesn't empty the registry:
 * several calls within the same test see the same history plus whatever is
 * new.
 */
export async function snapshotTraffic(): Promise<ResolvedRequest[]> {
  return Promise.all(
    [...traffic.values()].map(async (entry) => ({
      ...entry,
      body: await entry.body,
      responseBody: await entry.responseBody,
    })),
  )
}

/** Empties the registry and the in-flight counter; called by `setupNetwork()` in its `afterEach`. */
export function resetTraffic(): void {
  traffic.clear()
  pending.clear()
}

/** Number of requests with no close event yet. See {@link waitForNetworkIdle}. */
export function inFlightCount(): number {
  return pending.size
}

/** Poll interval for `waitForNetworkIdle`; also used by the retrying matchers. */
export const RETRY_INTERVAL_MS = 25

/** Default budget for {@link waitForNetworkIdle} before it throws with a dump of what's pending. */
export const QUIESCENCE_TIMEOUT_MS = 4000

/**
 * Waits for the in-flight request counter to reach zero.
 *
 * Polls instead of reacting to an event because the close of the last
 * request can arrive before any waiting listener gets installed. If the
 * timeout runs out, it throws with a dump of what's pending instead of
 * returning a boolean: an aborted request whose handler never finishes
 * would leave the counter stuck forever, and a meter that cannot measure
 * has to go red with diagnostics, not stay silent.
 *
 * A single call isn't enough to know "there's no traffic": a request fired
 * in the same tick as the call hasn't yet crossed the real round trip to
 * the service worker that registers its `request:start`, so this function
 * reads the counter at zero by construction, not by actual absence (see
 * `.claude/docs/references/measured-foundations.md`). Whoever needs to
 * assert an absence or count with precision must go through
 * `snapshotAfterIdle` in `pepito/src/matchers.ts`, which closes that window
 * with a two-observation stability condition; calling this function
 * directly reopens it.
 *
 * @param timeoutMs - The real budget for this call: what governs when it throws.
 * @param reportedTimeoutMs - The number that appears in the error message if it
 * throws; defaults to the same `timeoutMs`. Exists because `snapshotAfterIdle`
 * splits ONE global budget across several sub-calls (each with whatever is
 * left of the total, never a fresh full one) and needs the final message to
 * talk about that total, not the remaining milliseconds the last sub-call
 * got — otherwise the last lap of the loop could report "did not settle
 * within 1ms" after having waited the entire budget.
 */
export async function waitForNetworkIdle(
  timeoutMs: number = QUIESCENCE_TIMEOUT_MS,
  reportedTimeoutMs: number = timeoutMs,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (pending.size > 0) {
    if (Date.now() >= deadline) {
      const dump = [...pending]
        .map((requestId) => {
          const entry = traffic.get(requestId)
          return entry ? `${entry.method} ${entry.path}` : requestId
        })
        .join('\n  ')
      throw new Error(
        `the network did not settle within ${reportedTimeoutMs}ms; in flight:\n  ${dump}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS))
  }
}
