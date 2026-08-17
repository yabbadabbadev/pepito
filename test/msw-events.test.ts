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
    // El handler CONSUME el body: la regresión del gotcha 1 exige que el
    // registro lo haya clonado antes.
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

test('REGRESIÓN gotcha 1: el body de un POST es legible aunque el handler lo consuma', async () => {
  await fetch('/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ product_name: 'Leche' }),
  })

  const [entry] = await snapshotTraffic()

  expect(entry?.body).toEqual({ product_name: 'Leche' })
})

test('una petición mockeada acaba matched, mocked y con status y body de respuesta', async () => {
  await fetch('/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ product_name: 'Pan' }),
  })
  await waitForNetworkIdle()

  const [entry] = await snapshotTraffic()

  expect(entry?.matched).toBe(true)
  expect(entry?.mocked).toBe(true)
  expect(entry?.status).toBe(201)
  expect(entry?.responseBody).toEqual({ product_name: 'Pan' })
})

test('REGRESIÓN gotcha 2: passthrough queda matched pero NO mocked', async () => {
  await fetch('/api/passthrough')
  await waitForNetworkIdle()

  const [entry] = await snapshotTraffic()

  expect(entry?.matched).toBe(true)
  expect(entry?.mocked).toBe(false)
  expect(entry?.bypassed).toBe(true)
})

test('una petición sin handler queda unhandled y bypassed', async () => {
  await fetch('/api/nadie-la-espera')
  await waitForNetworkIdle()

  const [entry] = await snapshotTraffic()

  expect(entry?.unhandled).toBe(true)
  expect(entry?.bypassed).toBe(true)
})

test('una respuesta mockeada sin body de verdad no rompe el registro: responseBody queda undefined', async () => {
  worker.use(
    http.get('/api/sin-cuerpo', () => new HttpResponse(null, { status: 204 })),
  )

  await fetch('/api/sin-cuerpo')
  await waitForNetworkIdle()

  const [entry] = await snapshotTraffic()

  expect(entry?.mocked).toBe(true)
  expect(entry?.status).toBe(204)
  expect(entry?.responseBody).toBeUndefined()
})
