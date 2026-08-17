import type { SetupWorker } from 'msw/browser'
import {
  recordBypassResponse,
  recordMatch,
  recordMockedResponse,
  recordRequestStart,
  recordUnhandled,
} from './traffic-registry'

// Único fichero del paquete que toca `worker.events` (riesgo 1 del spec: la
// API de life-cycle events está en migración — ver
// docs/knowledge/msw-browser-mode.md). Si MSW cambia esa API, se arregla aquí
// sin tocar el registro ni los matchers.
//
// Solo cinco eventos: `request:end` y `unhandledException` no aportan nada al
// registro (medido, ver docs/knowledge/quiescencia-red-msw.md), así que no se
// escuchan.
/**
 * Engancha el registro de tráfico (traffic-registry.ts) a los eventos de MSW.
 * `setupNetwork()` la llama una vez por worker, antes de `worker.start()`.
 */
export function watchNetwork(events: SetupWorker['events']): void {
  events.on('request:start', ({ request, requestId }) => {
    const url = new URL(request.url)
    // Clonar sin ceder el control: en cuanto el handler empiece a leer el
    // stream, request.clone() lanza (gotcha 1, docs/knowledge/msw-browser-mode.md).
    const clone = request.clone()
    recordRequestStart(requestId, {
      method: request.method,
      origin: url.origin,
      path: url.pathname,
      searchParams: Object.fromEntries(url.searchParams),
      body: clone.json().catch(() => undefined),
    })
  })

  events.on('request:match', ({ requestId }) => {
    recordMatch(requestId)
  })

  events.on('request:unhandled', ({ requestId }) => {
    recordUnhandled(requestId)
  })

  events.on('response:mocked', ({ response, requestId }) => {
    recordMockedResponse(
      requestId,
      response.status,
      response
        .clone()
        .json()
        .catch(() => undefined),
    )
  })

  events.on('response:bypass', ({ response, requestId }) => {
    recordBypassResponse(requestId, response.status)
  })
}
