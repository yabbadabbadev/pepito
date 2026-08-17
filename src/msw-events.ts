import type { SetupWorker } from 'msw/browser'
import {
  recordBypassResponse,
  recordMatch,
  recordMockedResponse,
  recordRequestStart,
  recordUnhandled,
} from './traffic-registry'

// The only file in the package that touches `worker.events` (spec risk 1:
// the life-cycle events API is mid-migration — see
// docs/knowledge/msw-browser-mode.md). If MSW changes that API, it gets
// fixed here without touching the registry or the matchers.
//
// Only five events: `request:end` and `unhandledException` add nothing to
// the registry (measured, see docs/knowledge/quiescencia-red-msw.md), so
// they aren't listened to.
/**
 * Hooks up the traffic registry (traffic-registry.ts) to MSW's events.
 * `setupNetwork()` calls it once per worker, before `worker.start()`.
 */
export function watchNetwork(events: SetupWorker['events']): void {
  events.on('request:start', ({ request, requestId }) => {
    const url = new URL(request.url)
    // Clone without giving up control: as soon as the handler starts
    // reading the stream, request.clone() throws (gotcha 1,
    // docs/knowledge/msw-browser-mode.md).
    const clone = request.clone()
    recordRequestStart(requestId, {
      method: request.method,
      origin: url.origin,
      path: url.pathname,
      searchParams: Object.fromEntries(url.searchParams),
      body: clone.json().catch(() => undefined),
    })
  })

  events.on('request:match', ({ requestId }) => {
    recordMatch(requestId)
  })

  events.on('request:unhandled', ({ requestId }) => {
    recordUnhandled(requestId)
  })

  events.on('response:mocked', ({ response, requestId }) => {
    recordMockedResponse(
      requestId,
      response.status,
      response
        .clone()
        .json()
        .catch(() => undefined),
    )
  })

  events.on('response:bypass', ({ response, requestId }) => {
    recordBypassResponse(requestId, response.status)
  })
}
