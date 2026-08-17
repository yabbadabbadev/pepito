/**
 * How the expected request is compared against the observed one.
 * `searchParams` and `body` match by subset of top-level keys with deep
 * equality per key — `{ body: { productName: 'Milk' } }` matches even if
 * the real request also carries `id` or `createdAt` — unless `exact: true`,
 * which requires strict equality of the whole object.
 *
 * A repeated key in the real query (`?tag=a&tag=b`) collapses to a single
 * value — the last one — before comparing, because the registry builds
 * `searchParams` with `Object.fromEntries`: if your application relies on a
 * key appearing more than once, this comparison won't detect it.
 */
export interface RequestSpecOptions {
  searchParams?: Record<string, string>
  body?: unknown
  exact?: boolean
}

/**
 * Describes the request a network matcher looks for in the observed
 * traffic. Built with `request()` or one of its shortcuts (`get`, `post`,
 * `put`, `patch`, `del`, `query`); there's no need to build it by hand.
 *
 * Matching ignores `origin`: `get('/api/x')` matches both a same-origin
 * request to `/api/x` and one to `https://other.host/api/x`, if some
 * handler responds there. The traffic registry does keep the `origin` of
 * each request — not used yet, but it leaves room for an assertion by host
 * the day two hosts share the same path.
 */
export interface RequestSpec extends RequestSpecOptions {
  method: string
  path: string
}

/**
 * Escape hatch for any HTTP method, including ones MSW 2.15 doesn't yet
 * expose as its own helper (`QUERY`). The shortcuts (`get`, `post`, …) are
 * `request(fixedMethod, ...)`; for any other method, or to leave the method
 * explicit in the test itself, use this directly.
 *
 * @example
 * ```ts
 * import { request } from '@yabbadabbadev/pepito'
 *
 * await expect(request('QUERY', '/api/products')).toHaveBeenRequested()
 * ```
 */
export function request(
  method: string,
  path: string,
  options?: RequestSpecOptions,
): RequestSpec {
  return { method, path, ...options }
}

/**
 * Describes an expected `GET` request.
 *
 * @example
 * ```ts
 * import { get } from '@yabbadabbadev/pepito'
 *
 * await expect(get('/api/products', { searchParams: { filter: 'bread' } })).toHaveBeenRequested()
 * ```
 */
export const get: (
  path: string,
  options?: RequestSpecOptions,
) => RequestSpec = (path, options) => request('GET', path, options)

/** Describes an expected `POST` request; same shape as {@link get}. */
export const post: typeof get = (path, options) =>
  request('POST', path, options)

/** Describes an expected `PUT` request; same shape as {@link get}. */
export const put: typeof get = (path, options) => request('PUT', path, options)

/** Describes an expected `PATCH` request; same shape as {@link get}. */
export const patch: typeof get = (path, options) =>
  request('PATCH', path, options)

/**
 * Describes an expected `DELETE` request; same shape as {@link get}.
 * Named `del` because `delete` is a reserved word.
 */
export const del: typeof get = (path, options) =>
  request('DELETE', path, options)

/**
 * Describes an expected `QUERY` request — the method this package's spec
 * introduces, between `GET` and `POST`. The relevant option is usually
 * `searchParams`, not `body`: it's called `searchParams` and not `query` on
 * purpose, because `query` is already the name of this HTTP method in the
 * same API. MSW 2.15 doesn't expose `query` as a handler helper yet — it's
 * declared with `http.all` and filtered by method — but pepito's traffic
 * registry observes it just the same, because it reads `request.method` as
 * a plain string.
 */
export const query: typeof get = (path, options) =>
  request('QUERY', path, options)
