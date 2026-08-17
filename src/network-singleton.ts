import type { SetupWorker } from 'msw/browser'

/** What `mount` needs from `setupNetwork()`: the worker to register test handlers on and the original `href` to restore between tests. */
export interface NetworkContext {
  worker: SetupWorker
  initialHref: string
}

// Module per test file in browser mode (docs/knowledge/aislamiento-tests.md):
// this variable doesn't leak between files, so a file that never calls
// setupNetwork always sees `undefined` here, with no need for an explicit
// reset.
let context: NetworkContext | undefined

/** Publishes `setupNetwork()`'s context for `mount` to read; one call per test file. */
export function registerNetworkContext(nextContext: NetworkContext): void {
  context = nextContext
}

/** Reads the published context or throws with a fix instruction if `setupNetwork()` wasn't called before `caller`. */
export function requireNetworkContext(caller: string): NetworkContext {
  if (!context) {
    throw new Error(
      `pepito: setupNetwork(handlers) has not been initialized. Call it in your setup file (setupFiles in vitest.config) before using ${caller}.`,
    )
  }
  return context
}
