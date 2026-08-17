import { formatTraffic } from './failure-messages'
// Cycle with matchers.ts (which imports NETWORK_TARGET from this file,
// below): safe because both uses live inside function bodies that run
// deferred, never during module evaluation — `import`/`function` hoisting
// resolves them at call time. Changing either side to a module-level
// const-arrow would break the cycle, with one of the two sides seeing
// `undefined` on load.
import { snapshotAfterIdle } from './matchers'

/**
 * Opaque marker that `expect.network()` hangs off. It doesn't identify a
 * request but the overall traffic observed by the registry: a symbol keeps
 * any real value from the application (a string, a spec object) from
 * accidentally slipping in where only this marker makes sense —
 * `toHaveNoUnhandledRequests` requires it with `===` before looking at the
 * traffic.
 */
export const NETWORK_TARGET: unique symbol = Symbol('pepito:network-target')

/**
 * Diagnostic utilities over the observed traffic, for inspecting it outside
 * an assertion (for example, while debugging a failing test).
 */
export const network = {
  /**
   * Waits for the network to settle and dumps the observed traffic via
   * `console.log`, in the same format that appears in the network matchers'
   * failure messages.
   *
   * @example
   * ```ts
   * await fetch('/api/products')
   * await network.log()
   * ```
   */
  async log(): Promise<void> {
    const traffic = await snapshotAfterIdle()
    console.log(formatTraffic(traffic))
  },

  /**
   * Waits for the network to settle, with the same double-observation
   * mechanism the network matchers use (`snapshotAfterIdle` in
   * matchers.ts) — it doesn't duplicate it, it only discards the snapshot it
   * produces. Guarantees that every request seen up to the moment of the
   * call has closed (with `response:mocked`, `response:bypass` or the 500
   * MSW fabricates when a handler throws). It does not guarantee the
   * absence of future traffic: the same practical blind window remains as
   * for the rest of the mechanism — a request fired in the same tick as the
   * call, before crossing the real round trip to the service worker (1–6 ms
   * measured; see `.claude/docs/references/measured-foundations.md`), may
   * not be in the registry yet when `network.idle()` resolves.
   *
   * Meant for visual regression: capturing right after mounting, with a
   * slow network in the mix, produces a STABLE but wrong baseline — the
   * native stabilizer of `toMatchScreenshot` doesn't catch it because
   * "Loading…" is also a capture that stops changing between frames
   * (measured: 0 failures across 17 local runs + 3 in CI waiting for calm
   * this way — see `.claude/docs/references/measured-foundations.md`).
   * Before this, the only public way to wait for calm on its own was to
   * divert `expect.network().toHaveNoUnhandledRequests()` from its actual
   * purpose (detecting traffic without a handler). It works just as well as a
   * generic "wait for the network to settle", without asserting anything.
   *
   * @example
   * ```ts
   * const screen = await mount(<App />)
   * await network.idle()
   * await expect.element(screen.getByRole('main')).toMatchScreenshot('catalog')
   * ```
   *
   * @throws If the network doesn't settle within the `QUIESCENCE_TIMEOUT_MS`
   * budget, with the dump of the requests that were still in flight — the
   * same error `waitForNetworkIdle` throws.
   */
  async idle(): Promise<void> {
    await snapshotAfterIdle()
  },
}
