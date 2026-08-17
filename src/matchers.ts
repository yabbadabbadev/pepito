import { expect } from 'vitest'
import {
  noUnhandledRequestsFailureMessage,
  requestCountFailureMessage,
  requestFailureMessage,
  respondedWithFailureMessage,
} from './failure-messages'
import type { ExpectedResponse } from './matcher-types'
import { NETWORK_TARGET } from './network'
import type { RequestSpec } from './request-descriptors'
import { matchesBody, matchesSpec } from './spec-matching'
import {
  inFlightCount,
  QUIESCENCE_TIMEOUT_MS,
  RETRY_INTERVAL_MS,
  snapshotTraffic,
  waitForNetworkIdle,
} from './traffic-registry'
import type { ResolvedRequest } from './traffic-registry'

// 1s de margen sobre el sondeo cada RETRY_INTERVAL_MS: suficiente para que una
// petición lanzada justo después del assert tenga tiempo de completar el viaje
// real por el service worker (browser mode, no un mock en el mismo hilo).
const RETRY_TIMEOUT_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// El atajo `toHaveRespondedWith(500)` y la forma larga
// `toHaveRespondedWith({ status: 500 })` conviven en la firma pública para que
// el caso común no obligue a envolver un objeto; normalizar aquí, una sola
// vez, evita repartir el `typeof` por el resto del matcher.
function normalizeExpectedResponse(
  expected: number | ExpectedResponse,
): ExpectedResponse {
  return typeof expected === 'number' ? { status: expected } : expected
}

/**
 * Sondea `snapshotTraffic()` hasta que una entrada case con `spec` y cumpla
 * `isSatisfyingEntry`, o hasta agotar `RETRY_TIMEOUT_MS`. Devuelve el último
 * tráfico visto incluso si nunca hubo veredicto positivo: los matchers lo
 * necesitan para componer el mensaje de fallo.
 */
async function pollTraffic(
  spec: RequestSpec,
  isSatisfyingEntry: (entry: ResolvedRequest) => boolean,
): Promise<{ traffic: ResolvedRequest[]; pass: boolean }> {
  const deadline = Date.now() + RETRY_TIMEOUT_MS

  for (;;) {
    const traffic = await snapshotTraffic()
    const pass = traffic.some(
      (entry) => matchesSpec(entry, spec) && isSatisfyingEntry(entry),
    )
    if (pass || Date.now() >= deadline) return { traffic, pass }
    await sleep(RETRY_INTERVAL_MS)
  }
}

/**
 * Espera a que la red se calme (dos observaciones consecutivas en calma,
 * separadas por un intervalo de sondeo) y devuelve un único snapshot del
 * tráfico acumulado hasta ese momento.
 *
 * Úsala para afirmar una AUSENCIA o un CONTEO EXACTO, nunca para el caso
 * positivo con reintento (ese es `pollTraffic`): es la base de la rama
 * negada de `resolveTraffic` y de `toHaveBeenRequestedTimes`, y la usa
 * también `network.log()` (network.ts), fuera de este fichero.
 *
 * Presupuesto total `QUIESCENCE_TIMEOUT_MS`: si la red no se calma a tiempo,
 * lanza con el volcado de lo pendiente en vez de devolver un booleano mudo.
 * Racional de diseño completo en el bloque de comentario justo debajo de la
 * función.
 */
export async function snapshotAfterIdle(): Promise<ResolvedRequest[]> {
  const deadline = performance.now() + QUIESCENCE_TIMEOUT_MS

  await sleep(RETRY_INTERVAL_MS)
  for (;;) {
    // Segundo argumento: si esta sub-llamada agota su resto de presupuesto y
    // lanza, el mensaje tiene que hablar del presupuesto TOTAL, no del resto
    // que le tocó a ella (I2 — de lo contrario la última vuelta diría "no se
    // calmó en 1ms" tras haber esperado casi QUIESCENCE_TIMEOUT_MS enteros).
    await waitForNetworkIdle(
      Math.max(1, deadline - performance.now()),
      QUIESCENCE_TIMEOUT_MS,
    )
    await sleep(RETRY_INTERVAL_MS)
    if (inFlightCount() === 0) return snapshotTraffic()
  }
}

// Diseño y racional completos, para quien revise esto más adelante:
//
// Se exporta (en vez de quedar privada de este fichero) porque network.log()
// necesita la misma espera de calma sin copiarla ni llamar a
// waitForNetworkIdle a pelo, lo que reabriría la ventana ciega que cierra
// esta función. Cualquier matcher futuro con la misma necesidad (negados de
// toHaveRespondedWith) puede llamarla tal cual sin que haga falta exportar
// nada más, mientras viva en este fichero junto al resto de matchers.
//
// Un solo margen fijo antes de `waitForNetworkIdle` no basta: es una
// asunción de temporización medida en este arnés (vuelta real
// página-service worker-página de 1 a 6 ms, ver
// docs/knowledge/quiescencia-red-msw.md), no una garantía. En una CI cargada
// esa vuelta puede estirarse más allá del margen mientras el `setTimeout` del
// margen sigue su propio reloj — el check de calma leería el registro vacío
// justo cuando la petición sigue en camino, precisamente en las pruebas que
// existen para demostrar que eso no pasa. Por eso se exige una CONDICIÓN DE
// ESTABILIDAD, no un margen: dos observaciones consecutivas separadas por un
// intervalo de sondeo, ambas en calma (`inFlightCount() === 0`). Si la
// segunda ve tráfico nuevo (llegó durante la espera de la primera), se vuelve
// a esperar la calma y se repite la comprobación.
//
// Esto NO cierra la ventana ciega: ninguna espera acotada puede, es la
// postura preregistrada de docs/knowledge/quiescencia-red-msw.md. Solo
// estrecha la cota práctica de fallo de un intervalo a dos — razonado a
// partir de cómo funciona `waitForNetworkIdle`, no medido: este arnés es
// demasiado rápido para reproducir la CI contendida que motiva el cambio.
// Las DETERMINISMO de matchers-quiescencia.test.ts miden algo real pero
// distinto: que el mecanismo completo (margen + doble observación) hace
// falta frente a una comprobación ingenua o a no esperar en absoluto, no que
// la segunda observación por sí sola sea detectable en este arnés
// (verificado por mutación, ver docs/knowledge/quiescencia-red-msw.md).
//
// El bucle necesita UN presupuesto de reloj para toda la operación, no uno
// nuevo por vuelta: `waitForNetworkIdle()` sin argumento arranca su propio
// `QUIESCENCE_TIMEOUT_MS` cada vez que se le llama, así que un relevo de
// peticiones solapadas (cada una calma el contador justo antes de que otra
// arranque durante el margen posterior) haría que el bucle nunca convergiera
// ni lanzara — moriría por el timeout genérico de Vitest, sin el volcado de
// lo pendiente. `deadline` se calcula una sola vez al entrar y cada sub-
// llamada recibe el presupuesto que queda, nunca uno completo de nuevo. Si
// el presupuesto se agota mientras el contador está momentáneamente a cero,
// la sub-llamada de turno vuelve enseguida (nada que esperar), la
// comprobación posterior falla si algo arrancó mientras tanto, y la
// siguiente sub-llamada recibe ~1 ms: si hay algo en vuelo, su propio bucle
// lo detecta pasado ese resto y lanza con el volcado — acotado a, como
// mucho, un `RETRY_INTERVAL_MS` extra sobre el presupuesto global, nunca sin
// límite.

/**
 * Punto único de decisión entre reintentar y esperar la calma. `.not`
 * necesita quiescencia: reintentar hasta ver algo, aplicado a una ausencia,
 * daría un falso positivo con cualquier petición todavía en vuelo (la
 * DETERMINISMO de matchers-quiescencia.test.ts caza justo eso). El caso
 * positivo conserva el sondeo con reintento porque ahí sí interesa esperar a
 * que la petición llegue, no a que la red entera calle.
 */
async function resolveTraffic(
  spec: RequestSpec,
  isSatisfyingEntry: (entry: ResolvedRequest) => boolean,
  isNot: boolean,
): Promise<{ traffic: ResolvedRequest[]; pass: boolean }> {
  if (!isNot) return pollTraffic(spec, isSatisfyingEntry)

  const traffic = await snapshotAfterIdle()
  return {
    traffic,
    pass: traffic.some(
      (entry) => matchesSpec(entry, spec) && isSatisfyingEntry(entry),
    ),
  }
}

expect.extend({
  async toHaveBeenRequested(spec: RequestSpec) {
    const { traffic, pass } = await resolveTraffic(spec, () => true, this.isNot)

    return {
      pass,
      message: () =>
        requestFailureMessage({
          utils: this.utils,
          matcherName: 'toHaveBeenRequested',
          spec,
          traffic,
          isNot: this.isNot,
        }),
    }
  },

  async toHaveBeenIntercepted(spec: RequestSpec) {
    // Ni el passthrough (matched sin mocked) ni el 500 fabricado por MSW en
    // modo error (mocked sin matched) cuentan como interceptado: hace falta
    // que el propio handler haya respondido. Ver
    // docs/knowledge/msw-browser-mode.md.
    const { traffic, pass } = await resolveTraffic(
      spec,
      (entry) => entry.matched && entry.mocked,
      this.isNot,
    )

    return {
      pass,
      message: () =>
        requestFailureMessage({
          utils: this.utils,
          matcherName: 'toHaveBeenIntercepted',
          spec,
          traffic,
          isNot: this.isNot,
        }),
    }
  },

  async toHaveRespondedWith(
    spec: RequestSpec,
    expected: number | ExpectedResponse,
  ) {
    const expectedResponse = normalizeExpectedResponse(expected)

    // Lo anterior (interceptada: ni passthrough ni error fabricado de MSW, ver
    // toHaveBeenIntercepted más arriba), y con esta respuesta: status exacto
    // más, si se dio, subconjunto del body de la respuesta con las mismas
    // reglas que matchesSpec aplica a la petición.
    const isSatisfyingEntry = (entry: ResolvedRequest): boolean =>
      entry.matched &&
      entry.mocked &&
      entry.status === expectedResponse.status &&
      (expectedResponse.body === undefined ||
        matchesBody(
          entry.responseBody,
          expectedResponse.body,
          expectedResponse.exact,
        ))

    const { traffic, pass } = await resolveTraffic(
      spec,
      isSatisfyingEntry,
      this.isNot,
    )

    return {
      pass,
      message: () =>
        respondedWithFailureMessage({
          utils: this.utils,
          spec,
          expected: expectedResponse,
          traffic,
          isNot: this.isNot,
        }),
    }
  },

  async toHaveBeenRequestedTimes(spec: RequestSpec, count: number) {
    // Siempre espera la calma, esté o no negado con `.not`: un conteo exacto
    // tomado a mitad de tráfico es tan falso como una ausencia tomada a mitad
    // de tráfico (la otra DETERMINISMO del mismo fichero de test).
    const traffic = await snapshotAfterIdle()
    const matchingEntries = traffic.filter((entry) => matchesSpec(entry, spec))
    const foundCount = matchingEntries.length

    return {
      pass: foundCount === count,
      message: () =>
        requestCountFailureMessage({
          utils: this.utils,
          spec,
          expectedCount: count,
          foundCount,
          traffic,
          isNot: this.isNot,
        }),
    }
  },

  async toHaveNoUnhandledRequests(received: unknown) {
    // Este matcher no describe una petición: cuelga de `expect.network()`,
    // el único sitio que produce el marcador `NETWORK_TARGET`. Usado sobre
    // cualquier otra cosa (un descriptor de `get(...)`, un string) es un
    // error de uso, no una aserción que falla por datos.
    if (received !== NETWORK_TARGET) {
      return {
        pass: false,
        message: () =>
          'toHaveNoUnhandledRequests se usa a través de expect.network(), no sobre un descriptor de petición: expect.network().toHaveNoUnhandledRequests()',
      }
    }

    const traffic = await snapshotAfterIdle()
    const unhandledEntries = traffic.filter((entry) => entry.unhandled)

    return {
      pass: unhandledEntries.length === 0,
      message: () =>
        noUnhandledRequestsFailureMessage({
          utils: this.utils,
          unhandledEntries,
          traffic,
          isNot: this.isNot,
        }),
    }
  },
})

// Vitest no permite declarar propiedades nuevas en `ExpectStatic` vía
// `expect.extend`: `expect.extend` solo instala matchers dentro de una
// `Assertion`. `expect.network()` necesita ser una función de primer nivel
// sobre el propio `expect`, así que se asigna directamente; la forma del
// tipo la trae la augmentación de `ExpectStatic` en matcher-types.ts.
expect.network = () => expect(NETWORK_TARGET)
