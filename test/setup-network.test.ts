import { http, HttpResponse } from 'msw'
import { setupNetwork } from '../src/setup-network'
import { snapshotTraffic } from '../src/traffic-registry'

// Capturado ANTES de setupNetwork: es el href real del runner (con sus
// query params de sesión), no una URL de fixture — ver
// docs/knowledge/url-navegacion-browser-mode.md.
const initialHrefBeforeSetup = location.href

const worker = setupNetwork([
  http.get('/api/products', () => HttpResponse.json([])),
])

// Los dos tests dependen del orden A PROPÓSITO: el primero ensucia todo lo
// que el cleanup de setupNetwork debe deshacer, el segundo comprueba que no
// sobrevivió nada al afterEach.
test('1: ensucia todo lo que el cleanup debe deshacer', async () => {
  await fetch('/api/products')
  expect(await snapshotTraffic()).toHaveLength(1)

  worker.use(
    http.get('/api/products', () => HttpResponse.json(null, { status: 500 })),
  )
  history.pushState({}, '', '/ruta-heredada?sucia=1')
  localStorage.setItem('token', 'abc')
  document.cookie = 'sesion=xyz'
})

test('2: el registro, los handlers, la URL y el almacenamiento vuelven limpios', async () => {
  expect(await snapshotTraffic()).toHaveLength(0)
  expect(location.href).toBe(initialHrefBeforeSetup)
  expect(localStorage.getItem('token')).toBeNull()
  expect(document.cookie).not.toContain('sesion=xyz')

  const response = await fetch('/api/products')
  expect(response.status).toBe(200) // el override del test 1 se deshizo
})
