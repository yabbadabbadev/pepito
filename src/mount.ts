import type { ReactElement } from 'react'
import type { RequestHandler } from 'msw'
import { render, type RenderResult } from 'vitest-browser-react'
import { requireNetworkContext } from './network-singleton'

/** Opciones de {@link mount}. Las dos son opcionales: `mount(<App />)` a secas monta y punto. */
export interface MountOptions {
  /**
   * URI same-origin que empieza por `/`, query y hash incluidos (por ejemplo
   * `/products?filtro=pan#detalle`). Se aplica con `history.pushState` antes
   * del render para que el router de la aplicación la lea al montar.
   */
  path?: string
  /**
   * Handlers de MSW propios de este test. Entran con `worker.use()` antes del
   * render, así que tienen prioridad sobre los de la suite para la misma
   * ruta, y `setupNetwork()` los deshace en su `afterEach`.
   */
  network?: RequestHandler[]
}

// El prefijo '/' no basta: '//evil.com' es protocol-relative y WHATWG trata
// '/\' como introductor de authority también, así que ambos lo pasarían y
// sería pushState quien lanzase el SecurityError en crudo más abajo.
function isSameOriginPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  try {
    return new URL(path, location.origin).origin === location.origin
  } catch {
    return false
  }
}

/**
 * Monta `ui` con `vitest-browser-react`, opcionalmente en una ruta real del
 * documento y con handlers de MSW propios del test.
 *
 * El `path`, si se da, tiene que ser una URI same-origin que empiece por
 * `/`: se aplica con `history.pushState` ANTES del render porque el
 * `BrowserRouter` de la aplicación lee la URL al montar y después solo
 * escucha `popstate` (docs/knowledge/url-navegacion-browser-mode.md). La
 * URI puede llevar query y hash: atraviesan el router igual que el path.
 * `setupNetwork()` restaura la URL original en su `afterEach`, así que cada
 * test parte de la misma ruta sin importar lo que haya montado el anterior.
 *
 * `network`, si se da, se registra con `worker.use()` antes del render: sus
 * handlers tienen prioridad sobre los de la suite para esta petición, con el
 * mismo criterio de resolución de MSW.
 *
 * @example
 * ```tsx
 * import { mount } from '@yabbadabbadev/pepito'
 *
 * const screen = await mount(<App />, { path: '/products?filtro=pan' })
 * await expect.element(screen.getByText('filtro: pan')).toBeVisible()
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

  // Antes del render: el router de la app lee la URL al montar y después
  // solo escucha popstate. Ver docs/knowledge/url-navegacion-browser-mode.md.
  if (path !== undefined) {
    history.pushState({}, '', path)
  }
  if (testHandlers !== undefined && testHandlers.length > 0) {
    worker.use(...testHandlers)
  }

  return render(ui)
}
