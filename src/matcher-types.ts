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

export interface NetworkMatchers<ReturnType = unknown> {
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
   * Checks that one of your own handlers produced the response, not
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

declare module 'vitest' {
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends NetworkMatchers<T> {}
  interface AsymmetricMatchersContaining extends NetworkMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
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
    network(): Assertion<void>
  }
}
