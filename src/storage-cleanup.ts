/**
 * Clears the origin storage that browser mode leaks between test files that
 * land on the same worker: `localStorage`, `sessionStorage` and cookies
 * belong to the origin, not the document, so they survive per-file
 * isolation (docs/knowledge/aislamiento-tests.md).
 *
 * Each cookie is expired twice per name: once with `path=/` (the one most
 * application code sets) and once with no `path` attribute, in case one was
 * set without it. `setupNetwork()` calls this function BEFORE restoring the
 * URL in its `afterEach`, as a defensive ordering: per RFC 6265, the
 * default `path` of a cookie without the attribute is, in theory, computed
 * from the active URL both when it's set and when it's deleted, so clearing
 * before restoring the URL would be the correct order IF that computation
 * followed the routes `setupNetwork()` simulates with `history.pushState`.
 *
 * Measured that it doesn't, in this harness (Chromium via Playwright,
 * `vitest@4.1.10`): the order has no observable effect today — full
 * evidence in docs/knowledge/url-navegacion-browser-mode.md. The order is
 * kept anyway, at no cost, in case some future runner or browser does
 * follow the simulated URL.
 *
 * Known and actually verified limit: a cookie set with an explicit `path`
 * or with `domain` can't even be enumerated from `document.cookie` — it
 * stays alive after this call.
 *
 * @example
 * ```ts
 * afterEach(() => {
 *   clearOriginStorage()
 * })
 * ```
 */
export function clearOriginStorage(): void {
  localStorage.clear()
  sessionStorage.clear()

  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (!name) continue
    document.cookie = `${name}=;expires=${new Date(0).toUTCString()};path=/`
    document.cookie = `${name}=;expires=${new Date(0).toUTCString()}`
  }
}
