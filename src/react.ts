import type { ReactElement } from 'react'
import { render, type RenderResult } from 'vitest-browser-react'
import { mountCore } from './mount-core'
import type { MountOptions } from './mount-core'

/**
 * Mounts a React element with `vitest-browser-react`, optionally on a real
 * document route and with test-specific MSW handlers.
 *
 * `path`, if given, has to be a same-origin URI starting with `/`: it's
 * applied with `history.pushState` BEFORE render because the application's
 * `BrowserRouter` reads the URL on mount and only listens to `popstate`
 * afterwards. The URI can carry query and hash: they flow through the router
 * the same as the path. `setupNetwork()` restores the original URL in its
 * `afterEach`, so every test starts from the same route regardless of what
 * the previous one mounted.
 *
 * `network`, if given, is registered with `worker.use()` before render: its
 * handlers take priority over the suite's for this request, with the same
 * resolution rules as MSW.
 *
 * @example
 * ```tsx
 * import { mount } from '@yabbadabbadev/pepito/react'
 *
 * const screen = await mount(<App />, { path: '/products?filter=bread' })
 * await expect.element(screen.getByText('filter: bread')).toBeVisible()
 * ```
 */
export async function mount(
  ui: ReactElement,
  options?: MountOptions,
): Promise<RenderResult> {
  return mountCore(ui, (c) => render(c as ReactElement), options)
}
