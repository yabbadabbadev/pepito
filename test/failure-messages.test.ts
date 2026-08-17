import { formatTraffic } from '../src/failure-messages'
import type { ResolvedRequest } from '../src/traffic-registry'

// Forma que tiene una entrada justo después de recordRequestStart(): sin
// veredicto (ningún flag a true) y sin respuesta (status null). No hace falta
// pasar por MSW para producirla — es la misma forma que traffic-registry.ts
// documenta, así que se construye a mano.
const inFlightEntry: ResolvedRequest = {
  requestId: 'r1',
  method: 'GET',
  origin: 'http://localhost',
  path: '/api/lenta',
  searchParams: {},
  matched: false,
  mocked: false,
  bypassed: false,
  unhandled: false,
  status: null,
  body: undefined,
  responseBody: undefined,
}

test('sin tráfico observado, el volcado lo dice en vez de enseñar una lista vacía', () => {
  expect(formatTraffic([])).toBe('  (sin tráfico observado)')
})

test('una petición todavía en vuelo se vuelca como "sin veredicto" y "(sin respuesta)"', () => {
  const line = formatTraffic([inFlightEntry])

  expect(line).toContain('[sin veredicto]')
  expect(line).toContain('(sin respuesta)')
})
