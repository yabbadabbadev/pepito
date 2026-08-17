import type { ReactElement } from 'react'
import type { RequestHandler } from 'msw'
import { render, type RenderResult } from 'vitest-browser-react'
import { requireNetworkContext } from './network-singleton'

/** Options for {@link mount}. Both are optional: `mount(<App />)` alone just mounts. */
export interface MountOptions {
  /**
   * Same-origin URI starting with `/`, query and hash included (for example
   * `/products?filter=bread#detail`). Applied with `history.pushState`
   * before render so the application's router reads it on mount.
   */
  path?: string
  /**
   * MSW handlers of this test's own. Installed with `worker.use()` before
   * render, so they take priority over the suite's for the same route, and
   * `setupNetwork()` undoes them in its `afterEach`.
   */
  network?: RequestHandler[]
}

// The '/' prefix alone isn't enough: '//evil.com' is protocol-relative and
// WHATWG also treats '/\' as introducing an authority, so both would pass
// it and pushState would be the one throwing the raw SecurityError further
// down.
function isSameOriginPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  try {
    return new URL(path, location.origin).origin === location.origin
  } catch {
    return false
  }
}

/**
 * Mounts `ui` with `vitest-browser-react`, optionally on a real document
 * route and with test-specific MSW handlers.
 *
 * `path`, if given, has to be a same-origin URI starting with `/`: it's
 * applied with `history.pushState` BEFORE render because the application's
 * `BrowserRouter` reads the URL on mount and only listens to `popstate`
 * afterwards (measured — see
 * `.claude/docs/references/measured-foundations.md`). The URI can carry
 * query and hash: they flow through the router the same as the path.
 * `setupNetwork()` restores the original URL in its `afterEach`, so every
 * test starts from the same route regardless of what the previous one
 * mounted.
 *
 * `network`, if given, is registered with `worker.use()` before render: its
 * handlers take priority over the suite's for this request, with the same
 * resolution rules as MSW.
 *
 * @example
 * ```tsx
 * import { mount } from '@yabbadabbadev/pepito'
 *
 * const screen = await mount(<App />, { path: '/products?filter=bread' })
 * await expect.element(screen.getByText('filter: bread')).toBeVisible()
 * ```
 */
export async function mount(
  ui: ReactElement,
  options: MountOptions = {},
): Promise<RenderResult> {
  const { worker } = requireNetworkContext('mount')
  const { path, network: testHandlers } = options

  if (path !== undefined && !isSameOriginPath(path)) {
    throw new Error(
      `pepito: path must be a same-origin URI that starts with '/'; ` +
        `received: ${path}. A different origin is mocked in the MSW ` +
        `handlers, not in the mount.`,
    )
  }

  // Before render: the app's router reads the URL on mount and only
  // listens to popstate afterwards. See
  // docs/knowledge/url-navegacion-browser-mode.md.
  if (path !== undefined) {
    history.pushState({}, '', path)
  }
  if (testHandlers !== undefined && testHandlers.length > 0) {
    worker.use(...testHandlers)
  }

  return render(ui)
}
