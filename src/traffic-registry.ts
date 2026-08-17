/**
 * Entrada de tráfico tal como vive en el registro mientras el test corre:
 * `body` y `responseBody` son promesas porque solo se pueden leer una vez
 * (docs/knowledge/msw-browser-mode.md) y se guardan sin esperar, para no
 * bloquear el listener de `request:start` que las abre.
 */
export interface ObservedRequest {
  requestId: string
  method: string
  origin: string
  path: string
  searchParams: Record<string, string>
  body: Promise<unknown>
  matched: boolean
  mocked: boolean
  bypassed: boolean
  unhandled: boolean
  status: number | null
  responseBody: Promise<unknown>
}

/** Misma forma que {@link ObservedRequest} con `body` y `responseBody` ya resueltos: lo que ven los matchers y los mensajes de fallo. */
export interface ResolvedRequest extends Omit<
  ObservedRequest,
  'body' | 'responseBody'
> {
  body: unknown
  responseBody: unknown
}

const traffic = new Map<string, ObservedRequest>()

// Set de requestId en vuelo, no un entero: un cierre sin request:start previo
// (tráfico de antes de un resetTraffic) solo se ignora, en vez de dejar un
// contador en negativo sin que nadie lo note. Medido en
// docs/knowledge/quiescencia-red-msw.md.
const pending = new Set<string>()

/**
 * Abre una entrada de tráfico con lo que solo se puede leer en
 * `request:start` (docs/knowledge/msw-browser-mode.md) y la marca en vuelo.
 * `watchNetwork` (msw-events.ts) es la única llamante.
 */
export function recordRequestStart(
  requestId: string,
  startFields: Pick<
    ObservedRequest,
    'method' | 'origin' | 'path' | 'searchParams' | 'body'
  >,
): void {
  traffic.set(requestId, {
    requestId,
    ...startFields,
    matched: false,
    mocked: false,
    bypassed: false,
    unhandled: false,
    status: null,
    responseBody: Promise.resolve(undefined),
  })
  pending.add(requestId)
}

/**
 * Marca que un handler casó la ruta. Por sí solo no implica que haya
 * respondido — un `passthrough()` también emite este evento — de ahí que
 * `toHaveBeenIntercepted` (matchers.ts) exija además {@link recordMockedResponse}.
 */
export function recordMatch(requestId: string): void {
  const entry = traffic.get(requestId)
  if (entry) entry.matched = true
}

/** Registra la respuesta que fabricó un handler y cierra la petición (sale de `pending`). */
export function recordMockedResponse(
  requestId: string,
  status: number,
  responseBody: Promise<unknown>,
): void {
  const entry = traffic.get(requestId)
  if (entry) {
    entry.mocked = true
    entry.status = status
    entry.responseBody = responseBody
  }
  pending.delete(requestId)
}

/** Registra que la petición salió a la red real (passthrough o sin handler) y cierra la petición. */
export function recordBypassResponse(requestId: string, status: number): void {
  const entry = traffic.get(requestId)
  if (entry) {
    entry.bypassed = true
    entry.status = status
  }
  pending.delete(requestId)
}

/** Marca una petición sin handler; es lo que lee el guardarraíl `toHaveNoUnhandledRequests`. */
export function recordUnhandled(requestId: string): void {
  const entry = traffic.get(requestId)
  if (entry) entry.unhandled = true
}

/**
 * Resuelve las promesas de `body`/`responseBody` pendientes y devuelve una
 * foto del tráfico acumulado hasta ahora. No vacía el registro: varias
 * llamadas dentro del mismo test ven el mismo histórico más lo nuevo.
 */
export async function snapshotTraffic(): Promise<ResolvedRequest[]> {
  return Promise.all(
    [...traffic.values()].map(async (entry) => ({
      ...entry,
      body: await entry.body,
      responseBody: await entry.responseBody,
    })),
  )
}

/** Vacía registro y contador en vuelo; lo llama `setupNetwork()` en su `afterEach`. */
export function resetTraffic(): void {
  traffic.clear()
  pending.clear()
}

/** Número de peticiones sin evento de cierre todavía. Ver {@link waitForNetworkIdle}. */
export function inFlightCount(): number {
  return pending.size
}

/** Intervalo de sondeo de `waitForNetworkIdle`; también lo usan los matchers con retry. */
export const RETRY_INTERVAL_MS = 25

/** Presupuesto por defecto de {@link waitForNetworkIdle} antes de lanzar con el volcado de lo pendiente. */
export const QUIESCENCE_TIMEOUT_MS = 4000

/**
 * Espera a que el contador de peticiones en vuelo llegue a cero.
 *
 * Sondea en vez de reaccionar a un evento porque el cierre de la última
 * petición puede llegar antes de que se instale cualquier listener de espera.
 * Si el timeout se agota, lanza con el volcado de lo pendiente en vez de
 * devolver un booleano: una petición abortada cuyo handler no termina nunca
 * deja el contador enganchado para siempre, y un medidor que no puede medir
 * tiene que ponerse rojo con diagnóstico, no quedarse mudo.
 *
 * Una sola llamada no basta para saber "no hay tráfico": una petición
 * disparada en el mismo tick que la llamada todavía no cruzó la vuelta real
 * al service worker que registra su `request:start`, así que esta función lee
 * el contador en cero por construcción, no por ausencia real (ver
 * docs/knowledge/quiescencia-red-msw.md). Quien necesite negar una ausencia o
 * contar con exactitud debe entrar por `snapshotAfterIdle` en
 * `pepito/src/matchers.ts`, que cierra esa ventana con una condición de
 * estabilidad de dos observaciones; llamar a esta función directamente la
 * reabre.
 *
 * @param timeoutMs - Presupuesto real de esta llamada: el que rige cuándo lanza.
 * @param reportedTimeoutMs - Número que aparece en el mensaje de error si lanza;
 * por defecto, el mismo `timeoutMs`. Existe porque `snapshotAfterIdle` reparte
 * UN presupuesto global entre varias sub-llamadas (cada una con lo que queda
 * del total, nunca uno completo de nuevo) y necesita que el mensaje final
 * hable de ese total, no del resto de milisegundos que le tocó a la última
 * sub-llamada — si no, la última vuelta del bucle podría reportar "no se
 * calmó en 1ms" tras haber esperado el presupuesto entero.
 */
export async function waitForNetworkIdle(
  timeoutMs: number = QUIESCENCE_TIMEOUT_MS,
  reportedTimeoutMs: number = timeoutMs,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (pending.size > 0) {
    if (Date.now() >= deadline) {
      const dump = [...pending]
        .map((requestId) => {
          const entry = traffic.get(requestId)
          return entry ? `${entry.method} ${entry.path}` : requestId
        })
        .join('\n  ')
      throw new Error(
        `la red no se calmó en ${reportedTimeoutMs}ms, peticiones en vuelo:\n  ${dump}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS))
  }
}
