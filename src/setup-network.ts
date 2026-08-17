import type { RequestHandler } from 'msw'
import { setupWorker } from 'msw/browser'
import type { SetupWorker, StartOptions } from 'msw/browser'
import { afterEach, beforeAll } from 'vitest'
import { watchNetwork } from './msw-events'
import {
  registerNetworkContext,
  requireNetworkContext,
} from './network-singleton'
import { clearOriginStorage } from './storage-cleanup'
import { resetTraffic } from './traffic-registry'

/**
 * Arranca el worker de MSW y engancha el registro de tráfico, dejando el
 * cleanup entre tests instalado en `afterEach`: registro, handlers en
 * caliente, URL del documento y almacenamiento del origen vuelven al estado
 * previo a cada test (docs/knowledge/aislamiento-tests.md,
 * docs/knowledge/url-navegacion-browser-mode.md).
 *
 * Se llama una vez por fichero de test, típicamente en un `setupFiles` de
 * `vitest.config`, no dentro de un test.
 *
 * Límite conocido del cleanup: una cookie fijada con `path` explícito
 * distinto de `/` (o con `domain`) no se puede enumerar desde
 * `document.cookie`, así que sigue viva entre tests — ver
 * `clearOriginStorage` en storage-cleanup.ts. Una cookie sin `path` explícito
 * sí se limpia, incluida la fijada mientras `mount` simulaba estar en una
 * ruta anidada (docs/knowledge/url-navegacion-browser-mode.md).
 *
 * @param handlers - Handlers iniciales de MSW, los mismos que recibiría `setupWorker`.
 * @param startOptions - Pasa tal cual a `worker.start()`; sin envoltorio propio.
 * @returns El `SetupWorker` de MSW, para poder llamar a `worker.use()` en tests puntuales.
 *
 * @example
 * ```ts
 * import { http, HttpResponse } from 'msw'
 * import { setupNetwork } from '@yabbadabbadev/pepito'
 *
 * setupNetwork([
 *   http.get('/api/products', () => HttpResponse.json([])),
 * ])
 * ```
 */
export function setupNetwork(
  handlers: RequestHandler[],
  startOptions?: StartOptions,
): SetupWorker {
  const worker = setupWorker(...handlers)

  // El registro se engancha ANTES de start(): start es lo primero que puede
  // generar tráfico.
  watchNetwork(worker.events)
  registerNetworkContext({ worker, initialHref: location.href })

  beforeAll(async () => {
    await worker.start({ quiet: true, ...startOptions })
  })

  afterEach(() => {
    resetTraffic()
    worker.resetHandlers()
    // clearOriginStorage() va ANTES de restaurar la URL, no después: orden
    // defensivo por RFC 6265, sin efecto observable medido en este arnés —
    // ver el TSDoc de clearOriginStorage en storage-cleanup.ts.
    clearOriginStorage()
    history.replaceState(
      {},
      '',
      requireNetworkContext('setupNetwork').initialHref,
    )
  })

  return worker
}
