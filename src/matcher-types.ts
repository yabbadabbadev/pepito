/**
 * What a handler is expected to have responded, for `toHaveRespondedWith`.
 * `status` is required; `body` is compared by subset of top-level keys
 * unless `exact: true`, which requires strict equality — same semantics as
 * `RequestSpecOptions.body` in request-descriptors.ts, but over the
 * response instead of the request.
 */
export interface ExpectedResponse {
  status: number
  body?: unknown
  exact?: boolean
}

interface NetworkMatchers<ReturnType = unknown> {
  /**
   * Checks that the application made a request matching `spec`, by exact
   * `method` and `path` and `searchParams`/`body` by subset. Retries until
   * it finds one or the timeout runs out: a request is an effect that
   * follows an interaction, same as `expect.element`.
   *
   * `.not.toHaveBeenRequested()` does not retry: it waits for the network to
   * settle first, so as not to mistake a request that hasn't arrived yet for
   * one that was never made.
   *
   * @example
   * ```ts
   * import { get } from '@yabbadabbadev/pepito'
   *
   * await fetch('/api/products')
   * await expect(get('/api/products')).toHaveBeenRequested()
   * await expect(get('/api/other')).not.toHaveBeenRequested()
   * ```
   */
  toHaveBeenRequested(): Promise<ReturnType>

  /**
   * Checks that exactly `count` requests matching `spec` were made. Always
   * waits for the network to settle before counting, with or without
   * `.not`: a count taken mid-traffic is as false as an absence taken
   * mid-traffic.
   *
   * @example
   * ```ts
   * import { get } from '@yabbadabbadev/pepito'
   *
   * await Promise.all([fetch('/api/products'), fetch('/api/products')])
   * await expect(get('/api/products')).toHaveBeenRequestedTimes(2)
   * ```
   */
  toHaveBeenRequestedTimes(count: number): Promise<ReturnType>

  /**
   * Checks that one of the suite's own handlers produced the response, not
   * just that the request matched its route: a handler with `passthrough()`
   * satisfies `toHaveBeenRequested` but not this matcher, because the
   * response came from the real network.
   *
   * @example
   * ```ts
   * import { post } from '@yabbadabbadev/pepito'
   *
   * await fetch('/api/products', { method: 'POST' })
   * await expect(post('/api/products')).toHaveBeenIntercepted()
   * ```
   */
  toHaveBeenIntercepted(): Promise<ReturnType>

  /**
   * Checks that the request was intercepted (like `toHaveBeenIntercepted`)
   * and that the response has the expected `status` and, if given, a `body`
   * that matches by subset. `toHaveRespondedWith(500)` is the shorthand for
   * `toHaveRespondedWith({ status: 500 })`.
   *
   * @example
   * ```ts
   * import { get } from '@yabbadabbadev/pepito'
   *
   * await fetch('/api/products')
   * await expect(get('/api/products')).toHaveRespondedWith({
   *   status: 200,
   *   body: { total: 2 },
   * })
   * ```
   */
  toHaveRespondedWith(expected: number | ExpectedResponse): Promise<ReturnType>

  /**
   * Suite guardrail: checks that no request was left without a handler. It
   * does not describe a specific request, so it hangs off `expect.network()`
   * instead of a `get`/`post`/… descriptor; using it on anything else fails
   * with an instruction, not a data verdict.
   *
   * @example
   * ```ts
   * await expect.network().toHaveNoUnhandledRequests()
   * ```
   */
  toHaveNoUnhandledRequests(): Promise<ReturnType>
}

// Augments '@vitest/expect', not 'vitest': in this version (vitest@4.1.10),
// `declare module 'vitest'` compiles without error but the merge into
// `Assertion` never actually applies (the global call's own `Assertion<T>`
// ends up without the new methods). The vitest package itself augments its
// own global types against '@vitest/expect' directly (see
// node_modules/vitest/dist/chunks/global.d.*.d.ts) — same pattern, verified
// here because the spike (which does use 'vitest') doesn't reproduce the
// failure. Details in
// docs/knowledge/augmentacion-tipos-vitest-expect.md.
declare module '@vitest/expect' {
  // Empty interfaces: this is the module-augmentation mechanism, not an
  // oversight (same criterion as the `**/*.d.ts` block in eslint.config.js,
  // which doesn't cover this file since it isn't a `.d.ts`).
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends NetworkMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends NetworkMatchers {}
  interface ExpectStatic {
    /**
     * Entry point for assertions over the network as a whole, not over a
     * specific request. Today only `toHaveNoUnhandledRequests` consumes it.
     *
     * @example
     * ```ts
     * await expect.network().toHaveNoUnhandledRequests()
     * ```
     */
    network(): Assertion<unknown>
  }
}
