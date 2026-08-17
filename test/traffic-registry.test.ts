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

test('a recorded request appears in the snapshot with its body resolved', async () => {
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

test('two identical requests are two entries: the count comes for free', async () => {
  recordRequestStart('r1', productsRequestStart())
  recordRequestStart('r2', productsRequestStart())

  expect(await snapshotTraffic()).toHaveLength(2)
})

test('verdicts are correlated by requestId', async () => {
  recordRequestStart('r1', productsRequestStart())
  recordMatch('r1')
  recordMockedResponse('r1', 201, Promise.resolve({ id: 1 }))

  const [entry] = await snapshotTraffic()

  expect(entry?.matched).toBe(true)
  expect(entry?.mocked).toBe(true)
  expect(entry?.status).toBe(201)
  expect(entry?.responseBody).toEqual({ id: 1 })
})

test('a verdict for an unknown request is ignored without breaking anything', async () => {
  // The four functions share the same guard (`if (entry) ...`): an MSW
  // event can arrive for a requestId that resetTraffic() already cleared
  // from the registry, and none of them should create a phantom entry or
  // throw.
  recordMatch('fantasma')
  recordMockedResponse('fantasma', 200, Promise.resolve(undefined))
  recordBypassResponse('fantasma', 404)
  recordUnhandled('fantasma')

  expect(await snapshotTraffic()).toHaveLength(0)
  expect(inFlightCount()).toBe(0)
})

test('the counter goes up with request:start and down with the response', () => {
  recordRequestStart('r1', productsRequestStart())
  expect(inFlightCount()).toBe(1)

  recordBypassResponse('r1', 404)
  expect(inFlightCount()).toBe(0)
})

test('waitForNetworkIdle resolves when the network settles', async () => {
  recordRequestStart('r1', productsRequestStart())
  setTimeout(() => recordMockedResponse('r1', 200, Promise.resolve({})), 50)

  await waitForNetworkIdle()

  expect(inFlightCount()).toBe(0)
})

test('waitForNetworkIdle exhausts the timeout by THROWING with the dump of what is pending', async () => {
  recordRequestStart('r1', {
    ...productsRequestStart(),
    path: '/api/colgada',
  })

  await expect(waitForNetworkIdle(120)).rejects.toThrow(/\/api\/colgada/)
})

test('waitForNetworkIdle reports the TOTAL budget when it is given a different one from the real one', async () => {
  // snapshotAfterIdle (matchers.ts) calls with the remainder of a global
  // budget as the first argument, but requires the message to talk about
  // the total budget: without the second argument, the last sub-call would
  // report a remaining fraction of milliseconds instead of the real total.
  recordRequestStart('r1', {
    ...productsRequestStart(),
    path: '/api/colgada',
  })

  await expect(waitForNetworkIdle(1, 4000)).rejects.toThrow(/4000ms/)
})
