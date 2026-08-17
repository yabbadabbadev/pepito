import { http, HttpResponse, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { watchNetwork } from '../src/msw-events'
import {
  resetTraffic,
  snapshotTraffic,
  waitForNetworkIdle,
} from '../src/traffic-registry'

const worker = setupWorker(
  http.post('/api/products', async ({ request }) => {
    // The handler CONSUMES the body: the gotcha 1 regression requires the
    // registry to have cloned it beforehand.
    const payload = await request.json()
    return HttpResponse.json(payload, { status: 201 })
  }),
  http.get('/api/passthrough', () => passthrough()),
)
watchNetwork(worker.events)

beforeAll(async () => {
  await worker.start({ quiet: true })
})
afterEach(() => resetTraffic())

test('REGRESSION gotcha 1: a POST body is readable even if the handler consumes it', async () => {
  await fetch('/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ product_name: 'Milk' }),
  })

  const [entry] = await snapshotTraffic()

  expect(entry?.body).toEqual({ product_name: 'Milk' })
})

test('a mocked request ends up matched, mocked and with a response status and body', async () => {
  await fetch('/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ product_name: 'Bread' }),
  })
  await waitForNetworkIdle()

  const [entry] = await snapshotTraffic()

  expect(entry?.matched).toBe(true)
  expect(entry?.mocked).toBe(true)
  expect(entry?.status).toBe(201)
  expect(entry?.responseBody).toEqual({ product_name: 'Bread' })
})

test('REGRESSION gotcha 2: passthrough ends up matched but NOT mocked', async () => {
  await fetch('/api/passthrough')
  await waitForNetworkIdle()

  const [entry] = await snapshotTraffic()

  expect(entry?.matched).toBe(true)
  expect(entry?.mocked).toBe(false)
  expect(entry?.bypassed).toBe(true)
})

test('a request without a handler ends up unhandled and bypassed', async () => {
  await fetch('/api/nobody-expects-it')
  await waitForNetworkIdle()

  const [entry] = await snapshotTraffic()

  expect(entry?.unhandled).toBe(true)
  expect(entry?.bypassed).toBe(true)
})

test('a mocked response with no real body does not break the registry: responseBody stays undefined', async () => {
  worker.use(
    http.get('/api/empty-body', () => new HttpResponse(null, { status: 204 })),
  )

  await fetch('/api/empty-body')
  await waitForNetworkIdle()

  const [entry] = await snapshotTraffic()

  expect(entry?.mocked).toBe(true)
  expect(entry?.status).toBe(204)
  expect(entry?.responseBody).toBeUndefined()
})
