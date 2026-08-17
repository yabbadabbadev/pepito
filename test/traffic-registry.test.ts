import {
  inFlightCount,
  recordBypassResponse,
  recordRequestStart,
  recordMatch,
  recordMockedResponse,
  recordUnhandled,
  resetTraffic,
  snapshotTraffic,
  waitForNetworkIdle,
} from '../src/traffic-registry'

afterEach(() => resetTraffic())

const productsRequestStart = () => ({
  method: 'GET',
  origin: 'http://localhost',
  path: '/api/products',
  searchParams: {},
  body: Promise.resolve(undefined),
})

test('una petición registrada aparece en el snapshot con su body resuelto', async () => {
  recordRequestStart('r1', {
    ...productsRequestStart(),
    method: 'POST',
    body: Promise.resolve({ product_name: 'Leche' }),
  })

  const traffic = await snapshotTraffic()

  expect(traffic).toHaveLength(1)
  expect(traffic[0]?.method).toBe('POST')
  expect(traffic[0]?.body).toEqual({ product_name: 'Leche' })
  expect(traffic[0]?.matched).toBe(false)
})

test('dos peticiones idénticas son dos entradas: el conteo sale gratis', async () => {
  recordRequestStart('r1', productsRequestStart())
  recordRequestStart('r2', productsRequestStart())

  expect(await snapshotTraffic()).toHaveLength(2)
})

test('los veredictos se correlacionan por requestId', async () => {
  recordRequestStart('r1', productsRequestStart())
  recordMatch('r1')
  recordMockedResponse('r1', 201, Promise.resolve({ id: 1 }))

  const [entry] = await snapshotTraffic()

  expect(entry?.matched).toBe(true)
  expect(entry?.mocked).toBe(true)
  expect(entry?.status).toBe(201)
  expect(entry?.responseBody).toEqual({ id: 1 })
})

test('un veredicto de una petición desconocida se ignora sin romper nada', async () => {
  // Las cuatro funciones comparten la misma guarda (`if (entry) ...`): un
  // evento de MSW puede llegar para un requestId que resetTraffic() ya vació
  // del registro, y ninguna debe crear una entrada fantasma ni lanzar.
  recordMatch('fantasma')
  recordMockedResponse('fantasma', 200, Promise.resolve(undefined))
  recordBypassResponse('fantasma', 404)
  recordUnhandled('fantasma')

  expect(await snapshotTraffic()).toHaveLength(0)
  expect(inFlightCount()).toBe(0)
})

test('el contador sube con request:start y baja con la respuesta', () => {
  recordRequestStart('r1', productsRequestStart())
  expect(inFlightCount()).toBe(1)

  recordBypassResponse('r1', 404)
  expect(inFlightCount()).toBe(0)
})

test('waitForNetworkIdle resuelve cuando la red se calma', async () => {
  recordRequestStart('r1', productsRequestStart())
  setTimeout(() => recordMockedResponse('r1', 200, Promise.resolve({})), 50)

  await waitForNetworkIdle()

  expect(inFlightCount()).toBe(0)
})

test('waitForNetworkIdle agota el timeout LANZANDO con el volcado de lo pendiente', async () => {
  recordRequestStart('r1', {
    ...productsRequestStart(),
    path: '/api/colgada',
  })

  await expect(waitForNetworkIdle(120)).rejects.toThrow(/\/api\/colgada/)
})

test('waitForNetworkIdle reporta el presupuesto TOTAL cuando se le pasa distinto del real', async () => {
  // snapshotAfterIdle (matchers.ts) llama con el resto de un presupuesto
  // global como primer argumento, pero pide que el mensaje hable del
  // presupuesto total: sin el segundo argumento, la última sub-llamada
  // reportaría un resto de milisegundos en vez del total real.
  recordRequestStart('r1', {
    ...productsRequestStart(),
    path: '/api/colgada',
  })

  await expect(waitForNetworkIdle(1, 4000)).rejects.toThrow(/4000ms/)
})
