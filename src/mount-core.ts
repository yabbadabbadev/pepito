import type { RequestHandler } from 'msw'
import { requireNetworkContext } from './network-singleton'

/** Options for {@link mountCore}. Both are optional. */
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

/** The minimal contract every `vitest-browser-*` render result satisfies. */
export interface MountResult {
  container: Element
}

function isSameOriginPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  try {
    return new URL(path, location.origin).origin === location.origin
  } catch {
    return false
  }
}

/**
 * Framework-agnostic mount: applies `pushState` (if `path`), registers
 * test-specific MSW handlers (if `network`), then calls `render(component)`.
 *
 * The `render` function is provided by the caller — each framework subpath
 * (`/react`, `/vue`, `/svelte`) wraps this with its own `vitest-browser-*`
 * render. See the "Custom framework adapter" section in the README for
 * building your own.
 *
 * @example
 * ```ts
 * import { render } from 'vitest-browser-lit'
 * import { mountCore } from '@yabbadabbadev/pepito'
 *
 * const screen = await mountCore(MyComponent, (c) => render(c as any))
 * ```
 */
export async function mountCore<T extends MountResult>(
  component: unknown,
  render: (component: unknown) => T | Promise<T>,
  options: MountOptions = {},
): Promise<T> {
  const { worker } = requireNetworkContext('mountCore')
  const { path, network: testHandlers } = options

  if (path !== undefined && !isSameOriginPath(path)) {
    throw new Error(
      `pepito: path must be a same-origin URI that starts with '/'; ` +
        `received: ${path}. A different origin is mocked in the MSW ` +
        `handlers, not in the mount.`,
    )
  }

  if (path !== undefined) {
    history.pushState({}, '', path)
  }
  if (testHandlers !== undefined && testHandlers.length > 0) {
    worker.use(...testHandlers)
  }

  return await Promise.resolve(render(component))
}
