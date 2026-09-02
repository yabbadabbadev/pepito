import { render, type RenderResult } from 'vitest-browser-vue'
import { mountCore } from './mount-core'
import type { MountOptions } from './mount-core'

/**
 * Mounts a Vue component with `vitest-browser-vue`, optionally on a real
 * document route and with test-specific MSW handlers.
 *
 * `path`, if given, has to be a same-origin URI starting with `/`: it's
 * applied with `history.pushState` BEFORE render so the application's
 * router reads it on mount. `setupNetwork()` restores the original URL
 * in its `afterEach`.
 *
 * `network`, if given, is registered with `worker.use()` before render.
 *
 * @example
 * ```ts
 * import { mount } from '@yabbadabbadev/pepito/vue'
 * import App from './App.vue'
 *
 * const screen = await mount(App, { path: '/products' })
 * await expect.element(screen.getByText('Products')).toBeVisible()
 * ```
 */
export async function mount(
  component: Parameters<typeof render>[0],
  options?: MountOptions,
): Promise<RenderResult<Record<string, unknown>>> {
  return mountCore(
    component,
    (c) => render(c as Parameters<typeof render>[0]),
    options,
  )
}
