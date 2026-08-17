import type { MatcherState } from '@vitest/expect'
import type { ExpectedResponse } from './matcher-types'
import type { RequestSpec } from './request-descriptors'
import { matchesSpec } from './spec-matching'
import type { ResolvedRequest } from './traffic-registry'

const TRAFFIC_FLAGS = ['matched', 'mocked', 'bypassed', 'unhandled'] as const

function formatQuery(searchParams: Record<string, string>): string {
  const query = new URLSearchParams(searchParams).toString()
  return query ? `?${query}` : ''
}

function formatFlags(entry: ResolvedRequest): string {
  const activeFlags = TRAFFIC_FLAGS.filter((flag) => entry[flag])
  return activeFlags.length > 0 ? activeFlags.join('/') : 'sin veredicto'
}

function formatTrafficLine(entry: ResolvedRequest): string {
  const status = entry.status ?? '(sin respuesta)'
  return `  ${entry.method} ${entry.path}${formatQuery(entry.searchParams)} → ${status} [${formatFlags(entry)}]`
}

/** Vuelca el tráfico observado, una línea por entrada, para incrustar en un mensaje de fallo. */
export function formatTraffic(traffic: ResolvedRequest[]): string {
  if (traffic.length === 0) return '  (sin tráfico observado)'
  return traffic.map(formatTrafficLine).join('\n')
}

// Solo lo que identifica la petición esperada, no las opciones de comparación
// (`exact`): eso es un modo de matchesSpec, no algo que uno "esperaba recibir".
function describeSpec(spec: RequestSpec): Record<string, unknown> {
  return {
    method: spec.method,
    path: spec.path,
    searchParams: spec.searchParams,
    body: spec.body,
  }
}

/**
 * Compone el mensaje de fallo de los matchers de red: el hint del matcher,
 * qué se esperaba, un diff contra el candidato más parecido (mismo método y
 * path, aunque no case del todo) si existe, y el volcado completo del
 * tráfico observado.
 */
export function requestFailureMessage(messageContext: {
  utils: MatcherState['utils']
  matcherName: string
  spec: RequestSpec
  traffic: ResolvedRequest[]
  isNot: boolean
}): string {
  const { utils, matcherName, spec, traffic, isNot } = messageContext

  const sections = [
    utils.matcherHint(matcherName, undefined, undefined, { isNot }),
    // Bajo `.not`, lo que falló es que SÍ hubo una petición que casaba: el
    // hint ya lo dice con el "not.", pero la línea de "Esperaba" sin más
    // seguiría leyéndose como el caso positivo si no cambia con ella.
    isNot
      ? `No esperaba: ${utils.printExpected(describeSpec(spec))}`
      : `Esperaba: ${utils.printExpected(describeSpec(spec))}`,
  ]

  const candidate = traffic.find(
    (entry) => entry.method === spec.method && entry.path === spec.path,
  )
  if (candidate) {
    const diff = utils.diff(
      { searchParams: spec.searchParams, body: spec.body },
      { searchParams: candidate.searchParams, body: candidate.body },
    )
    if (diff) sections.push(diff)
  }

  sections.push(`Tráfico observado:\n${formatTraffic(traffic)}`)

  return sections.join('\n\n')
}

/**
 * Compone el mensaje de fallo de `toHaveBeenRequestedTimes`: no hay
 * "candidato más parecido" que mostrar como en `requestFailureMessage`, sino
 * un conteo esperado contra el realmente observado, más el volcado completo.
 */
export function requestCountFailureMessage(messageContext: {
  utils: MatcherState['utils']
  spec: RequestSpec
  expectedCount: number
  foundCount: number
  traffic: ResolvedRequest[]
  isNot: boolean
}): string {
  const { utils, spec, expectedCount, foundCount, traffic, isNot } =
    messageContext

  // Bajo `.not`, `foundCount` es necesariamente igual a `expectedCount` (es lo
  // que hizo fallar la aserción negada): "encontré 2" a secas se leería como
  // un eco sin sentido si no dice también que ese conteo es justo el que no
  // se esperaba.
  const leadLine = isNot
    ? `No esperaba encontrar exactamente ${expectedCount} petición(es) a ${utils.printExpected(describeSpec(spec))}, y encontré ${foundCount}`
    : `Esperaba ${expectedCount} petición(es) a ${utils.printExpected(describeSpec(spec))}, encontré ${foundCount}`

  const sections = [
    utils.matcherHint('toHaveBeenRequestedTimes', undefined, undefined, {
      isNot,
    }),
    leadLine,
    `Tráfico observado:\n${formatTraffic(traffic)}`,
  ]

  return sections.join('\n\n')
}

/**
 * Compone el mensaje de fallo de `toHaveNoUnhandledRequests`: qué peticiones
 * llegaron sin handler (método y path, lo mínimo para localizarlas en el
 * código) y a continuación el volcado completo del tráfico, por si el
 * handler que falta se hace evidente al verlas junto al resto.
 */
export function noUnhandledRequestsFailureMessage(messageContext: {
  utils: MatcherState['utils']
  unhandledEntries: ResolvedRequest[]
  traffic: ResolvedRequest[]
  isNot: boolean
}): string {
  const { utils, unhandledEntries, traffic, isNot } = messageContext

  // Bajo `.not`, lo que falló es que `unhandledEntries` está VACÍO — listar
  // "Peticiones sin handler:" seguido de nada es el bug que este `isNot`
  // arregla: la aserción negada exigía tráfico sin handler y no lo hubo.
  const leadLine = isNot
    ? 'Esperaba encontrar alguna petición sin handler, pero el tráfico llegó limpio'
    : `Peticiones sin handler:\n${unhandledEntries
        .map((entry) => `  ${entry.method} ${entry.path}`)
        .join('\n')}`

  const sections = [
    utils.matcherHint('toHaveNoUnhandledRequests', undefined, undefined, {
      isNot,
    }),
    leadLine,
    `Tráfico observado:\n${formatTraffic(traffic)}`,
  ]

  return sections.join('\n\n')
}

function describeExpectedResponse(
  expected: ExpectedResponse,
): Record<string, unknown> {
  return expected.body === undefined
    ? { status: expected.status }
    : { status: expected.status, body: expected.body }
}

/**
 * Compone el mensaje de fallo de `toHaveRespondedWith`: el hint del matcher,
 * la respuesta esperada, un diff contra el candidato interceptado y con spec
 * casada más parecido (aunque no case en status ni en body) si existe, y el
 * volcado completo del tráfico observado. El candidato exige `matched &&
 * mocked` porque una entrada de passthrough puede casar la spec de la
 * petición sin haber sido interceptada nunca: mostrarla como "casi" sería
 * engañoso.
 */
export function respondedWithFailureMessage(messageContext: {
  utils: MatcherState['utils']
  spec: RequestSpec
  expected: ExpectedResponse
  traffic: ResolvedRequest[]
  isNot: boolean
}): string {
  const { utils, spec, expected, traffic, isNot } = messageContext

  const leadLine = isNot
    ? `No esperaba: ${utils.printExpected(describeSpec(spec))} respondida con ${utils.printExpected(describeExpectedResponse(expected))}`
    : `Esperaba: ${utils.printExpected(describeSpec(spec))} respondida con ${utils.printExpected(describeExpectedResponse(expected))}`

  const sections = [
    utils.matcherHint('toHaveRespondedWith', undefined, undefined, { isNot }),
    leadLine,
  ]

  const candidate = traffic.find(
    (entry) => entry.matched && entry.mocked && matchesSpec(entry, spec),
  )
  if (candidate) {
    // Misma clave (`body`) a los dos lados, y ausente en los dos si `expected`
    // no la trae: con nombres distintos (`body` contra `responseBody`) el
    // diff no encuentra terreno común y enseña dos bloques enteros sin
    // relación en vez de señalar el campo que de verdad cambió dentro del
    // body.
    const diff = utils.diff(
      describeExpectedResponse(expected),
      expected.body === undefined
        ? { status: candidate.status }
        : { status: candidate.status, body: candidate.responseBody },
    )
    if (diff) sections.push(diff)
  }

  sections.push(`Tráfico observado:\n${formatTraffic(traffic)}`)

  return sections.join('\n\n')
}
