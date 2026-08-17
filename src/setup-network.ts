import type { RequestHandler } from 'msw'
import { setupWorker } from 'msw/browser'
import type { SetupWorker, StartOptions } from 'msw/browser'
import { afterEach, beforeAll } from 'vitest'
import { watchNetwork } from './msw-events'
import {
  registerNetworkContext,
  requireNetworkContext,
} from './network-singleton'
import { clearOriginStorage } from './storage-cleanup'
import { resetTraffic } from './traffic-registry'

/**
 * Starts the MSW worker and hooks up the traffic registry, leaving the
 * between-test cleanup installed in `afterEach`: registry, hot handlers,
 * document URL and origin storage all return to their pre-test state
 * (docs/knowledge/aislamiento-tests.md,
 * docs/knowledge/url-navegacion-browser-mode.md).
 *
 * Called once per test file, typically from a `setupFiles` entry in
 * `vitest.config`, never from inside a test.
 *
 * Known cleanup limit: a cookie set with an explicit `path` other than `/`
 * (or with `domain`) can't be enumerated from `document.cookie`, so it
 * survives between tests — see `clearOriginStorage` in storage-cleanup.ts.
 * A cookie without an explicit `path` does get cleared, including one set
 * while `mount` was simulating being on a nested route
 * (docs/knowledge/url-navegacion-browser-mode.md).
 *
 * @param handlers - Initial MSW handlers, the same ones `setupWorker` would take.
 * @param startOptions - Passed through to `worker.start()` as-is; no wrapper of its own.
 * @returns The MSW `SetupWorker`, so individual tests can call `worker.use()`.
 *
 * @example
 * ```ts
 * import { http, HttpResponse } from 'msw'
 * import { setupNetwork } from '@yabbadabbadev/pepito'
 *
 * setupNetwork([
 *   http.get('/api/products', () => HttpResponse.json([])),
 * ])
 * ```
 */
export function setupNetwork(
  handlers: RequestHandler[],
  startOptions?: StartOptions,
): SetupWorker {
  const worker = setupWorker(...handlers)

  // The registry is hooked up BEFORE start(): start is the earliest point
  // that can generate traffic.
  watchNetwork(worker.events)
  registerNetworkContext({ worker, initialHref: location.href })

  beforeAll(async () => {
    await worker.start({ quiet: true, ...startOptions })
  })

  afterEach(() => {
    resetTraffic()
    worker.resetHandlers()
    // clearOriginStorage() goes BEFORE restoring the URL, not after:
    // defensive ordering per RFC 6265, with no observable effect measured
    // in this harness — see the TSDoc on clearOriginStorage in
    // storage-cleanup.ts.
    clearOriginStorage()
    history.replaceState(
      {},
      '',
      requireNetworkContext('setupNetwork').initialHref,
    )
  })

  return worker
}
