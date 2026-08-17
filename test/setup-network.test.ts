import { http, HttpResponse } from 'msw'
import { setupNetwork } from '../src/setup-network'
import { snapshotTraffic } from '../src/traffic-registry'

// Captured BEFORE setupNetwork: this is the runner's real href (with its
// session query params), not a fixture URL — see
// docs/knowledge/url-navegacion-browser-mode.md.
const initialHrefBeforeSetup = location.href

const worker = setupNetwork([
  http.get('/api/products', () => HttpResponse.json([])),
])

// The two tests depend on order ON PURPOSE: the first one dirties
// everything setupNetwork's cleanup must undo, the second checks nothing
// survived the afterEach.
test('1: dirties everything the cleanup must undo', async () => {
  await fetch('/api/products')
  expect(await snapshotTraffic()).toHaveLength(1)

  worker.use(
    http.get('/api/products', () => HttpResponse.json(null, { status: 500 })),
  )
  history.pushState({}, '', '/inherited-route?dirty=1')
  localStorage.setItem('token', 'abc')
  document.cookie = 'session=xyz'
})

test('2: the registry, the handlers, the URL and the storage come back clean', async () => {
  expect(await snapshotTraffic()).toHaveLength(0)
  expect(location.href).toBe(initialHrefBeforeSetup)
  expect(localStorage.getItem('token')).toBeNull()
  expect(document.cookie).not.toContain('session=xyz')

  const response = await fetch('/api/products')
  expect(response.status).toBe(200) // test 1's override was undone
})
